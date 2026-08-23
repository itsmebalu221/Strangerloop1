/* SafetyService — automated message moderation, blocks, reports,
   connections, notifications. Risk levels: LOW → SEVERE.
   Actions: ALLOW / FLAG / WARN / BLOCK_CONTENT / ESCALATE / SUSPEND / BAN. */

import { uid, nowIso, hashStr } from "../lib/utils";
import { getDB, mutate, userById, toPublic, activeConversationBetween, trackDay } from "./db";
import { AppError, ValidationError, NotFoundError } from "../lib/errors";
import { emitEvent } from "../api/realtime";

/* ---------------- message classification ---------------- */

const SEVERE_PATTERNS = [
  [/\b(kill yourself|kys|i'?ll find you|find where you live|hurt you|beat you)\b/i, "threats"],
  [/\b(minor|underage|\b1[3-5]\b.*(year|yo)).*(meet|date|pics|pics)\b/i, "minor-safety"],
];
const HIGH_PATTERNS = [
  [/\b(gift card|bitcoin|crypto|western union|send money|pay me|cash ?app|guaranteed returns|investment)\b/i, "scam"],
  [/\b(send nudes|nudes|sexting|explicit pics|nsfw pics)\b/i, "explicit-content"],
  [/\b(whatsapp|telegram|snapchat|instagram|phone number|call me|email me|my number is)\b/i, "contact-solicitation"],
  [/\b(hate you|stupid (people|person)|shut up|you'?re (worthless|pathetic))\b/i, "harassment"],
];
const SUSPICIOUS_PATTERNS = [
  [/(https?:\/\/|www\.)/i, "url"],
  [/\b(follow me|subscribe|my channel|promo code|discount code)\b/i, "promotion"],
];

const recentSent = new Map();

export function classifyMessage(userId, content) {
  const reasons = [];
  let risk = "LOW";

  for (const [re, tag] of SEVERE_PATTERNS) if (re.test(content)) { reasons.push(tag); risk = "SEVERE"; }
  if (risk !== "SEVERE") {
    for (const [re, tag] of HIGH_PATTERNS) if (re.test(content)) { reasons.push(tag); risk = "HIGH"; }
  }
  if (risk === "LOW") {
    for (const [re, tag] of SUSPICIOUS_PATTERNS) if (re.test(content)) { reasons.push(tag); risk = "SUSPICIOUS"; }
    const letters = content.replace(/[^a-zA-Z]/g, "");
    if (content.length > 14 && letters.length > 8) {
      const upper = letters.replace(/[^A-Z]/g, "").length;
      if (upper / letters.length > 0.7) { reasons.push("caps-shouting"); risk = "SUSPICIOUS"; }
    }
    const history = recentSent.get(userId) ?? [];
    const repeats = history.filter((h) => h === content).length;
    if (repeats >= 2) { reasons.push("repetition-spam"); risk = risk === "LOW" ? "SUSPICIOUS" : risk; }
    history.push(content);
    recentSent.set(userId, history.slice(-5));
  }

  const action = risk === "SEVERE" ? "BLOCK_CONTENT" : risk === "HIGH" ? "WARN" : risk === "SUSPICIOUS" ? "FLAG" : "ALLOW";
  return { risk, action, reasons };
}

export function logModeration(userId, actorId, action, reason, risk) {
  mutate((d) => {
    d.moderation.push({ id: uid(), userId, actorId, action, reason, risk, createdAt: nowIso() });
  });
}

export function applySevereAutoAction(userId, reasons) {
  mutate((d) => {
    const u = userById(d, userId);
    if (!u || u.simulated) return;
    const recentSevere = d.moderation.filter(
      (m) => m.userId === userId && m.risk === "SEVERE" && Date.now() - new Date(m.createdAt).getTime() < 86400000
    ).length;
    if (recentSevere >= 2) {
      u.status = "SUSPENDED";
      u.suspendedUntil = new Date(Date.now() + 86400000).toISOString();
    }
    // Auto-escalate to human moderation.
    d.reports.push({
      id: uid(),
      reporterId: "system",
      reportedId: userId,
      conversationId: null,
      category: reasons.includes("minor-safety") ? "underage" : "threats",
      details: `Automated escalation: ${reasons.join(", ")}`,
      risk: "SEVERE",
      autoAction: "ESCALATE",
      status: "escalated",
      createdAt: nowIso(),
      adminNote: null,
      actedBy: null,
    });
    trackDay("reports");
  });
  notifyAdmins("report", "Severe content auto-escalated", "A message was blocked by automated moderation and escalated for review.");
}

/* ---------------- blocks ---------------- */

export function blockUser(blockerId, blockedId) {
  if (blockerId === blockedId) throw ValidationError("You cannot block yourself");
  return mutate((d) => {
    const target = userById(d, blockedId);
    if (!target || target.status === "DELETED") throw NotFoundError("User not found");
    const exists = d.blocks.some((b) => b.blockerId === blockerId && b.blockedId === blockedId);
    if (!exists) d.blocks.push({ id: uid(), blockerId, blockedId, createdAt: nowIso() });

    // Blocking ends any active conversation between the pair.
    const conv = activeConversationBetween(d, blockerId, blockedId);
    if (conv) {
      conv.state = "BLOCKED";
      conv.endReason = "BLOCK";
      conv.endedAt = nowIso();
      emitEvent("conversation:ended", { conversationId: conv.id, reason: "BLOCK", byUserId: blockerId }, { conversationId: conv.id });
    }
    // A pending queue entry for the blocked user against this seeker becomes stale-safe
    // because eligibility always re-checks blocks.
    return { already: exists };
  });
}

export function unblockUser(blockerId, blockedId) {
  mutate((d) => {
    const before = d.blocks.length;
    d.blocks = d.blocks.filter((b) => !(b.blockerId === blockerId && b.blockedId === blockedId));
    if (d.blocks.length === before) throw NotFoundError("Block not found");
  });
}

export function listBlocks(userId) {
  const d = getDB();
  return d.blocks
    .filter((b) => b.blockerId === userId)
    .map((b) => ({ blockedUser: toPublic(d, userById(d, b.blockedId)), createdAt: b.createdAt }))
    .filter((x) => !!x.blockedUser);
}

/* ---------------- reports ---------------- */

const CATEGORY_RISK = {
  threats: "SEVERE",
  underage: "SEVERE",
  harassment: "HIGH",
  hate: "HIGH",
  sexual: "HIGH",
  scam: "HIGH",
  spam: "SUSPICIOUS",
  impersonation: "SUSPICIOUS",
  other: "SUSPICIOUS",
};

export function reportUser(reporterId, input) {
  const d = getDB();
  const target = userById(d, input.reportedId);
  if (!target || target.status === "DELETED") throw NotFoundError("User not found");
  if (input.reportedId === reporterId) throw ValidationError("You cannot report yourself");
  if (input.details && input.details.length > 500) throw ValidationError("Details must be under 500 characters", "details");

  let risk = CATEGORY_RISK[input.category];
  if (input.details) {
    const textRisk = classifyMessage(reporterId, input.details).risk;
    if (textRisk === "SEVERE") risk = "SEVERE";
  }

  return mutate((dd) => {
    const conv = input.conversationId ? dd.conversations.find((c) => c.id === input.conversationId) : undefined;
    if (conv && !conv.participantIds.includes(reporterId)) throw new AppError(403, "FORBIDDEN", "Not a participant of this conversation");

    const autoAction = risk === "SEVERE" ? "SUSPEND" : "FLAG";
    const reportId = uid();
    dd.reports.push({
      id: reportId,
      reporterId,
      reportedId: input.reportedId,
      conversationId: input.conversationId ?? null,
      category: input.category,
      details: input.details?.trim() || null,
      risk,
      autoAction,
      status: risk === "SEVERE" ? "escalated" : "open",
      createdAt: nowIso(),
      adminNote: null,
      actedBy: null,
    });
    dd.moderation.push({ id: uid(), userId: input.reportedId, actorId: "system", action: autoAction, reason: `report:${input.category}`, risk, createdAt: nowIso() });
    trackDay("reports");

    if (risk === "SEVERE" && !target.simulated) {
      target.status = "SUSPENDED";
      target.suspendedUntil = new Date(Date.now() + 3 * 86400000).toISOString();
    }
    if (conv && conv.state === "ACTIVE") {
      conv.state = "REPORTED";
      conv.endReason = "REPORT";
      conv.endedAt = nowIso();
      emitEvent("conversation:ended", { conversationId: conv.id, reason: "REPORT", byUserId: reporterId }, { conversationId: conv.id });
    }
    if (input.alsoBlock && !dd.blocks.some((b) => b.blockerId === reporterId && b.blockedId === input.reportedId)) {
      dd.blocks.push({ id: uid(), blockerId: reporterId, blockedId: input.reportedId, createdAt: nowIso() });
    }
    return { reportId, risk };
  });
}

export function conversationContext(conversationId) {
  const d = getDB();
  return d.messages.filter((m) => m.conversationId === conversationId).slice(-12);
}

/* ---------------- connections ---------------- */

export function connectionBetween(d, a, b) {
  return d.connections.find(
    (c) => (c.aId === a && c.bId === b) || (c.aId === b && c.bId === a)
  );
}

export function createConnection(requesterId, otherId) {
  if (requesterId === otherId) throw ValidationError("You cannot connect with yourself");
  const d = getDB();
  const other = userById(d, otherId);
  if (!other || other.status === "DELETED") throw NotFoundError("User not found");
  if (d.blocks.some((b) => (b.blockerId === otherId && b.blockedId === requesterId)))
    throw new AppError(403, "FORBIDDEN", "Unable to connect with this member");

  const existing = connectionBetween(d, requesterId, otherId);
  if (existing) return { connectionId: existing.id, status: existing.status, already: true };

  return mutate((dd) => {
    const conn = { id: uid(), aId: requesterId, bId: otherId, status: "pending", requestedBy: requesterId, createdAt: nowIso(), acceptedAt: null };
    dd.connections.push(conn);
    if (other.simulated) {
      // Community members in the embedded engine respond asynchronously.
      scheduleSimulatedAccept(conn.id);
    }
    return { connectionId: conn.id, status: "pending", already: false };
  });
}

function scheduleSimulatedAccept(connectionId) {
  setTimeout(() => {
    mutate((d) => {
      const conn = d.connections.find((c) => c.id === connectionId);
      if (!conn || conn.status !== "pending") return;
      const a = userById(d, conn.aId);
      const b = userById(d, conn.bId);
      const shared = a.interestIds.filter((i) => b.interestIds.includes(i)).length;
      const chance = shared >= 2 ? 0.88 : shared === 1 ? 0.65 : 0.35;
      if (Math.random() > chance) {
        d.connections = d.connections.filter((c) => c.id !== connectionId); // declined
        return;
      }
      conn.status = "mutual";
      conn.acceptedAt = nowIso();
      pushNotification(d, conn.aId, "connection", `${b.username} accepted your connect`, "You're now mutual connections. Say hi from your Connections page.");
      emitEvent("connection:update", { connectionId, status: "mutual" }, { userId: conn.aId });
    });
  }, 2400 + Math.random() * 3600);
}

export function removeConnection(userId, otherId) {
  mutate((d) => {
    const before = d.connections.length;
    d.connections = d.connections.filter((c) => !((c.aId === userId && c.bId === otherId) || (c.aId === otherId && c.bId === userId)));
    if (d.connections.length === before) throw NotFoundError("Connection not found");
  });
}

export function listConnections(userId) {
  const d = getDB();
  return d.connections
    .filter((c) => c.aId === userId || c.bId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((c) => {
      const otherId = c.aId === userId ? c.bId : c.aId;
      const other = userById(d, otherId);
      if (!other || other.status === "DELETED") return null;
      const me = userById(d, userId);
      return {
        connectionId: c.id,
        other: toPublic(d, other),
        status: c.status,
        sharedInterests: me.interestIds.filter((i) => other.interestIds.includes(i)).map((id) => d.interests.find((i) => i.id === id)?.name ?? ""),
        createdAt: c.createdAt,
        acceptedAt: c.acceptedAt,
        initiatedByMe: c.requestedBy === userId,
      };
    })
    .filter((x) => x !== null);
}

/* ---------------- notifications ---------------- */

export function pushNotification(d, userId, type, title, body) {
  const n = { id: uid(), userId, type, title, body, read: false, createdAt: nowIso() };
  d.notifications.push(n);
  emitEvent("notification:new", n, { userId });
}

export function listNotifications(userId) {
  const d = getDB();
  return d.notifications.filter((n) => n.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 40);
}

export function markNotificationRead(userId, id) {
  mutate((d) => {
    const n = d.notifications.find((x) => x.id === id && x.userId === userId);
    if (n) n.read = true;
  });
}

export function markAllNotificationsRead(userId) {
  mutate((d) => {
    for (const n of d.notifications) if (n.userId === userId) n.read = true;
  });
}

export function notifyAdmins(type, title, body) {
  const d = getDB();
  for (const admin of d.users.filter((u) => u.role === "admin")) {
    pushNotification(d, admin.id, type, title, body);
  }
  // pushNotification mutates d in place within the same object; persist explicitly.
  mutate(() => undefined);
}

export function unreadCount(userId) {
  return getDB().notifications.filter((n) => n.userId === userId && !n.read).length;
}
