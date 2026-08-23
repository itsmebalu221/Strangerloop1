/* ChatService — conversations, authorized messaging over the socket layer,
   typing indicators, NEXT lifecycle, connect requests, stranger pacing. */

import { uid, nowIso, chance } from "../lib/utils";
import { getDB, mutate, userById, toPublic, trackDay } from "./db";
import { AppError, ValidationError, NotFoundError, AuthorizationError, ConflictError, RateLimitError } from "../lib/errors";
import { emitEvent, registerServerHandler } from "../api/realtime";
import { requireUser } from "./auth.service";
import { classifyMessage, logModeration, applySevereAutoAction, createConnection, connectionBetween, pushNotification } from "./safety.service";
import { buildOpener, buildReply, nextProbability, connectionAcceptChance } from "./strangers";
import { matchNow, onMatchCreated, search as queueSearch } from "./matching.service";

const MAX_MESSAGE_LENGTH = 1000;
const sendTimestamps = new Map();
const convTimers = new Map();
const convStats = new Map();

function timers(convId) {
  if (!convTimers.has(convId)) convTimers.set(convId, []);
  return convTimers.get(convId);
}

function clearTimers(convId) {
  for (const t of convTimers.get(convId) ?? []) clearTimeout(t);
  convTimers.delete(convId);
  convStats.delete(convId);
}

function assertParticipant(conv, userId) {
  if (!conv.participantIds.includes(userId)) throw AuthorizationError("You are not a participant of this conversation");
}

function getConvOrThrow(d, convId, userId) {
  const conv = d.conversations.find((c) => c.id === convId);
  if (!conv) throw NotFoundError("Conversation not found");
  assertParticipant(conv, userId);
  return conv;
}

function sanitize(content) {
  // Plain text only — control characters stripped; React escapes rendering.
  return content.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
}

function checkThrottle(userId) {
  const now = Date.now();
  const history = (sendTimestamps.get(userId) ?? []).filter((t) => now - t < 10_000);
  if (history.length >= 7) throw RateLimitError("You're sending messages too fast — take a breath");
  const last = history[history.length - 1];
  if (last && now - last < 420) throw RateLimitError("Slow down a moment");
  history.push(now);
  sendTimestamps.set(userId, history);
}

/* ---------------- messaging ---------------- */

export function sendMessage(userId, conversationId, rawContent) {
  const content = sanitize(rawContent);
  if (!content) throw ValidationError("Message cannot be empty");
  if (content.length > MAX_MESSAGE_LENGTH) throw ValidationError(`Messages are limited to ${MAX_MESSAGE_LENGTH} characters`);
  checkThrottle(userId);

  const d = getDB();
  requireUser(d, userId);
  const conv = getConvOrThrow(d, conversationId, userId);
  if (conv.state !== "ACTIVE") throw new AppError(409, "CONVERSATION_ENDED", "This conversation has ended");

  const classification = classifyMessage(userId, content);
  if (classification.action === "BLOCK_CONTENT") {
    logModeration(userId, "system", "BLOCK_CONTENT", classification.reasons.join(","), "SEVERE");
    applySevereAutoAction(userId, classification.reasons);
    throw new AppError(451, "MESSAGE_BLOCKED", "Message removed by safety filters — keep it respectful.");
  }

  const message = { id: uid(), conversationId, senderId: userId, content, createdAt: nowIso(), deletedAt: null };
  mutate((dd) => {
    dd.messages.push(message);
    const c = dd.conversations.find((x) => x.id === conversationId);
    c.lastMessageAt = message.createdAt;
    if (classification.action === "WARN") {
      logModeration(userId, "system", "WARN", classification.reasons.join(","), "HIGH");
      dd.messages.push({
        id: uid(),
        conversationId,
        senderId: "system",
        content: "Heads up from Wavelength safety: avoid sharing contact details or money requests. Repeated violations end conversations.",
        createdAt: nowIso(),
        deletedAt: null,
      });
    } else if (classification.action === "FLAG") {
      logModeration(userId, "system", "FLAG", classification.reasons.join(","), "SUSPICIOUS");
    }
  });

  emitEvent("message:new", { message }, { conversationId });
  scheduleStrangerReply(conv, userId, content);
  return message;
}

export function deleteMessage(userId, conversationId, messageId) {
  return mutate((d) => {
    getConvOrThrow(d, conversationId, userId);
    const msg = d.messages.find((m) => m.id === messageId && m.conversationId === conversationId);
    if (!msg) throw NotFoundError("Message not found");
    if (msg.senderId !== userId) throw AuthorizationError("You can only delete your own messages");
    if (Date.now() - new Date(msg.createdAt).getTime() > 120_000) throw new AppError(409, "TOO_LATE", "Messages can be deleted within 2 minutes");
    msg.deletedAt = nowIso();
    emitEvent("message:updated", { message: msg }, { conversationId });
    return msg;
  });
}

export function broadcastTyping(userId, conversationId, isTyping) {
  const d = getDB();
  const conv = getConvOrThrow(d, conversationId, userId);
  if (conv.state !== "ACTIVE") return;
  emitEvent("typing", { conversationId, userId, isTyping }, { conversationId });
}

/* ---------------- stranger pacing (embedded community engine) ---------------- */

function otherOf(conv, userId) {
  return conv.participantIds[0] === userId ? conv.participantIds[1] : conv.participantIds[0];
}

function deliverAs(convId, senderId, text) {
  const message = { id: uid(), conversationId: convId, senderId, content: text, createdAt: nowIso(), deletedAt: null };
  mutate((d) => {
    d.messages.push(message);
    const c = d.conversations.find((x) => x.id === convId);
    if (c) c.lastMessageAt = message.createdAt;
  });
  emitEvent("message:new", { message }, { conversationId: convId });
}

export function scheduleStrangerOpener(conv) {
  const strangerId = conv.participantIds.find((id) => userById(getDB(), id)?.simulated);
  const humanId = conv.participantIds.find((id) => !userById(getDB(), id)?.simulated);
  if (!strangerId || !humanId) return;
  const d = getDB();
  const human = userById(d, humanId);
  const sharedNames = conv.sharedInterestIds.map((id) => d.interests.find((i) => i.id === id)?.name).filter(Boolean);
  const plan = buildOpener(sharedNames, human.username);

  const t0 = setTimeout(() => emitEvent("typing", { conversationId: conv.id, userId: strangerId, isTyping: true }, { conversationId: conv.id }), 1300);
  timers(conv.id).push(t0);
  plan.texts.forEach((text, i) => {
    const t = setTimeout(() => {
      const c = getDB().conversations.find((x) => x.id === conv.id);
      if (!c || c.state !== "ACTIVE") return;
      if (i === plan.texts.length - 1) emitEvent("typing", { conversationId: conv.id, userId: strangerId, isTyping: false }, { conversationId: conv.id });
      deliverAs(conv.id, strangerId, text);
    }, 1900 + plan.typingMs * ((i + 1) / plan.texts.length) + i * 700);
    timers(conv.id).push(t);
  });
}

function scheduleStrangerReply(conv, senderId, userText) {
  const d = getDB();
  const strangerId = otherOf(conv, senderId);
  const stranger = userById(d, strangerId);
  if (!stranger?.simulated) return;

  const stats = convStats.get(conv.id) ?? { turn: 0, shortStreak: 0 };
  stats.turn += 1;
  stats.shortStreak = userText.trim().length <= 6 ? stats.shortStreak + 1 : 0;
  convStats.set(conv.id, stats);

  // Clear any in-flight reply so interruptions feel natural.
  for (const t of convTimers.get(conv.id) ?? []) clearTimeout(t);
  convTimers.set(conv.id, []);

  const human = userById(d, senderId);
  void human;

  if (chance(nextProbability(stats.turn, stats.shortStreak))) {
    const t = setTimeout(() => {
      const c = getDB().conversations.find((x) => x.id === conv.id);
      if (c && c.state === "ACTIVE") endConversationInternal(c, "STRANGER_NEXT", strangerId);
    }, 1200 + Math.random() * 1600);
    timers(conv.id).push(t);
    return;
  }

  const plan = buildReply(stranger.interestIds.map((id) => d.interests.find((i) => i.id === id)?.name ?? "").filter(Boolean), stranger.country, userText, stats.turn, senderName(d, senderId));
  const typingStart = Math.max(500, plan.typingMs * 0.35);
  const t1 = setTimeout(() => {
    const c = getDB().conversations.find((x) => x.id === conv.id);
    if (c && c.state === "ACTIVE") emitEvent("typing", { conversationId: conv.id, userId: strangerId, isTyping: true }, { conversationId: conv.id });
  }, typingStart);
  timers(conv.id).push(t1);

  plan.texts.forEach((text, i) => {
    const at = typingStart + 500 + (plan.typingMs * (i + 1)) / plan.texts.length;
    const t = setTimeout(() => {
      const c = getDB().conversations.find((x) => x.id === conv.id);
      if (!c || c.state !== "ACTIVE") return;
      if (i === plan.texts.length - 1) emitEvent("typing", { conversationId: conv.id, userId: strangerId, isTyping: false }, { conversationId: conv.id });
      deliverAs(conv.id, strangerId, text);
    }, at);
    timers(conv.id).push(t);
  });
}

function senderName(d, senderId) {
  return userById(d, senderId)?.username ?? "friend";
}

/* ---------------- lifecycle ---------------- */

export function endConversationInternal(conv, reason, byUserId) {
  clearTimers(conv.id);
  mutate((d) => {
    const c = d.conversations.find((x) => x.id === conv.id);
    if (c.state !== "ACTIVE") return;
    c.state = reason === "BLOCK" ? "BLOCKED" : reason === "REPORT" ? "REPORTED" : "ENDED";
    c.endReason = reason;
    c.endedAt = nowIso();
  });
  emitEvent("conversation:ended", { conversationId: conv.id, reason, byUserId }, { conversationId: conv.id });
}

export function next(userId, conversationId) {
  const d = getDB();
  requireUser(d, userId);
  const conv = getConvOrThrow(d, conversationId, userId);
  if (conv.state === "ACTIVE") endConversationInternal(conv, "NEXT", userId);

  const matched = matchNow(userId);
  if (matched) return { status: "matched", view: toView(matched, userId) };
  // Fall back to the asynchronous queue — the client transitions to /match.
  queueSearch(userId);
  return { status: "searching" };
}

export function connectFromConversation(userId, conversationId) {
  const d = getDB();
  const conv = getConvOrThrow(d, conversationId, userId);
  const otherId = otherOf(conv, userId);
  const existing = connectionBetween(d, userId, otherId);
  if (existing) return { status: existing.status === "mutual" ? "mutual" : "requested", chanceHint: 1 };

  const me = userById(d, userId);
  const other = userById(d, otherId);
  const sharedCount = me.interestIds.filter((i) => other.interestIds.includes(i)).length;
  const res = createConnection(userId, otherId);
  if (res.status === "mutual") return { status: "mutual", chanceHint: 1 };

  // Real (non-simulated) peers: instant mutual if they already requested you.
  if (!other.simulated) {
    const conn = connectionBetween(getDB(), userId, otherId);
    if (conn && conn.status === "pending" && conn.requestedBy === otherId) {
      mutate((dd) => {
        const c = dd.connections.find((x) => x.id === conn.id);
        c.status = "mutual";
        c.acceptedAt = nowIso();
        pushNotification(dd, otherId, "connection", `${me.username} connected back`, "You're now mutual connections.");
        emitEvent("connection:update", { connectionId: c.id, status: "mutual" }, { userId: otherId });
      });
      pushNotification(getDB(), userId, "connection", `You and ${other.username} are connected`, "Mutual connection created.");
      return { status: "mutual", chanceHint: 1 };
    }
  }
  void connectionAcceptChance;
  return { status: "pending", chanceHint: connectionAcceptChance(sharedCount) };
}

/* ---------------- queries ---------------- */

export function toView(conv, viewerId) {
  const d = getDB();
  const otherId = otherOf(conv, viewerId);
  const other = userById(d, otherId);
  if (!other) throw NotFoundError("Conversation not found");
  const shared = conv.sharedInterestIds.map((id) => d.interests.find((i) => i.id === id)).filter(Boolean);
  return { conversation: conv, other: toPublic(d, other), shared, starter: conv.starterPrompt };
}

export function getConversation(userId, conversationId) {
  const d = getDB();
  const conv = getConvOrThrow(d, conversationId, userId);
  return toView(conv, userId);
}

export function recentConversations(userId, limit = 6) {
  const d = getDB();
  return d.conversations
    .filter((c) => c.participantIds.includes(userId))
    .sort((a, b) => (b.lastMessageAt ?? b.startedAt).localeCompare(a.lastMessageAt ?? a.startedAt))
    .slice(0, limit)
    .map((c) => {
      const msgs = d.messages.filter((m) => m.conversationId === c.id && m.senderId !== "system" && !m.deletedAt);
      const last = msgs[msgs.length - 1];
      return {
        ...toView(c, userId),
        lastMessage: last ? { content: last.content, mine: last.senderId === userId, at: last.createdAt } : null,
      };
    });
}

export function getMessages(userId, conversationId, before, limit = 60) {
  const d = getDB();
  getConvOrThrow(d, conversationId, userId);
  let msgs = d.messages.filter((m) => m.conversationId === conversationId);
  if (before) msgs = msgs.filter((m) => m.createdAt < before);
  msgs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const page = msgs.slice(-limit);
  const nextCursor = page.length === limit && msgs.length > limit ? page[0].createdAt : null;
  return { items: page, nextCursor };
}

/* ---------------- socket handlers ---------------- */

export function registerSocketHandlers() {
  registerServerHandler("message:send", async (payload, userId) => {
    return { message: sendMessage(userId, payload.conversationId, payload.content) };
  });
  registerServerHandler("typing", async (payload, userId) => {
    broadcastTyping(userId, payload.conversationId, payload.isTyping);
    return { ok: true };
  });
}

// Boot hook: schedule openers whenever a match with a simulated member is created.
onMatchCreated((conv) => scheduleStrangerOpener(conv));

// Re-export for the client bootstrap.
export { trackDay };
