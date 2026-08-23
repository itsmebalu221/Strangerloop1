/* MatchingService + MatchingScoreService + QueueService (embedded engine).
   Scoring-based matching with centralized weights, 5-level progressive
   relaxation, blocked/banned/self exclusion, and a single active queue
   entry per user (idempotent join, concurrency-safe within the engine). */

import type { DB, UserRecord, ConversationRecord, PublicUser, Interest } from "../lib/types";
import { uid, nowIso } from "../lib/utils";
import { getDB, mutate, userById, toPublic, isBlockedEitherWay, activeConversationFor, trackDay } from "./db";
import { AppError, ConflictError } from "../lib/errors";
import { emitEvent } from "../api/realtime";
import { starterFor } from "./strangers";
import { requireUser } from "./auth.service";

export const MATCH_WEIGHTS = {
  sharedInterest: 20, // per shared interest, capped at 2 → 40
  language: 20,
  ageCompatibility: 15,
  genderPreference: 20, // 10 per direction
  conversationType: 15,
  country: 10,
} as const;

export const MAX_SCORE = 120;

const overlaps = (a: string[], b: string[]) => a.filter((x) => b.includes(x));

export interface ScoreResult {
  score: number;
  sharedInterestIds: string[];
  sharedLanguage: boolean;
  sharedConvTypes: string[];
}

export function scorePair(d: DB, seeker: UserRecord, cand: UserRecord): ScoreResult {
  const sharedInterestIds = overlaps(seeker.interestIds, cand.interestIds);
  const sharedLangs = overlaps(seeker.languageIds, cand.languageIds);
  const sharedConvTypes = overlaps(seeker.convTypeIds, cand.convTypeIds);

  let score = 0;
  score += Math.min(sharedInterestIds.length, 2) * MATCH_WEIGHTS.sharedInterest;
  if (sharedLangs.length) score += MATCH_WEIGHTS.language;
  if (sharedConvTypes.length) score += MATCH_WEIGHTS.conversationType;
  if (seeker.country === cand.country) score += MATCH_WEIGHTS.country;

  const seekerAge = ageOf(seeker);
  const candAge = ageOf(cand);
  const seekerOk = candAge >= seeker.prefs.ageMin && candAge <= seeker.prefs.ageMax;
  const candOk = seekerAge >= cand.prefs.ageMin && seekerAge <= cand.prefs.ageMax;
  if (seekerOk && candOk) score += MATCH_WEIGHTS.ageCompatibility;

  if (prefIncludes(seeker.prefs.genders, cand.gender)) score += MATCH_WEIGHTS.genderPreference / 2;
  if (prefIncludes(cand.prefs.genders, seeker.gender)) score += MATCH_WEIGHTS.genderPreference / 2;

  return { score, sharedInterestIds, sharedLanguage: sharedLangs.length > 0, sharedConvTypes };
}

function ageOf(u: UserRecord): number {
  const d = new Date(u.dob);
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) a--;
  return a;
}

function prefIncludes(prefs: string[], gender: string): boolean {
  return prefs.includes("anyone") || prefs.includes(gender) || prefs.includes("undisclosed");
}

/* ---------------- eligibility per fallback level ---------------- */

function genderPrefHardOk(a: UserRecord, b: UserRecord): boolean {
  return prefIncludes(a.prefs.genders, b.gender) && prefIncludes(b.prefs.genders, a.gender);
}

function ageHardOk(a: UserRecord, b: UserRecord, slack = 0): boolean {
  const aa = ageOf(a);
  const ab = ageOf(b);
  return ab >= a.prefs.ageMin - slack && ab <= a.prefs.ageMax + slack && aa >= b.prefs.ageMin - slack && aa <= b.prefs.ageMax + slack;
}

export function eligibleCandidates(d: DB, seeker: UserRecord, level: number): UserRecord[] {
  const seekerActive = d.queue.some((q) => q.userId === seeker.id && q.status === "WAITING");
  return d.users.filter((cand) => {
    if (cand.id === seeker.id) return false;
    if (cand.status !== "ACTIVE") return false;
    if (cand.suspendedUntil && new Date(cand.suspendedUntil) > new Date()) return false;
    if (ageOf(cand) < 18) return false;
    if (isBlockedEitherWay(d, seeker.id, cand.id)) return false;

    // Simulated community members must be online; real members must be waiting in queue.
    if (cand.simulated) {
      if (!d.onlinePersonaIds.includes(cand.id)) return false;
    } else if (!seekerActive || !d.queue.some((q) => q.userId === cand.id && q.status === "WAITING")) {
      return false;
    }

    const shared = overlaps(seeker.interestIds, cand.interestIds);
    const sharedLangs = overlaps(seeker.languageIds, cand.languageIds);
    const sharedCt = overlaps(seeker.convTypeIds, cand.convTypeIds);

    switch (level) {
      case 1:
        return genderPrefHardOk(seeker, cand) && ageHardOk(seeker, cand) && sharedLangs.length > 0 && shared.length > 0 && sharedCt.length > 0;
      case 2:
        return genderPrefHardOk(seeker, cand) && ageHardOk(seeker, cand, 6) && sharedLangs.length > 0 && shared.length > 0 && sharedCt.length > 0;
      case 3:
        return genderPrefHardOk(seeker, cand) && ageHardOk(seeker, cand, 10) && sharedLangs.length > 0 && sharedCt.length > 0;
      case 4:
        return ageHardOk(seeker, cand, 12) && (sharedLangs.length > 0 || seeker.country === cand.country);
      default:
        return true;
    }
  });
}

const LEVEL_MIN_SCORE: Record<number, number> = { 1: 40, 2: 40, 3: 35, 4: 22, 5: 12 };

export function findBest(d: DB, seeker: UserRecord, level: number): { cand: UserRecord; result: ScoreResult } | null {
  const cands = eligibleCandidates(d, seeker, level);
  let best: { cand: UserRecord; result: ScoreResult } | null = null;
  for (const cand of cands) {
    const result = scorePair(d, seeker, cand);
    if (!best || result.score > best.result.score) best = { cand, result };
  }
  if (!best || best.result.score < (LEVEL_MIN_SCORE[level] ?? 12)) return null;
  return best;
}

/* ---------------- queue + match creation ---------------- */

const loops = new Map<string, ReturnType<typeof setInterval>>();
let matchCreatedHook: ((conv: ConversationRecord) => void) | null = null;
export function onMatchCreated(fn: (conv: ConversationRecord) => void): void {
  matchCreatedHook = fn;
}

function levelForElapsed(ms: number): number {
  return Math.min(5, 1 + Math.floor(ms / 2400));
}

export function createMatch(d: DB, seeker: UserRecord, cand: UserRecord, result: ScoreResult, level: number): ConversationRecord {
  d.matches.push({ id: uid(), seekerId: seeker.id, candidateId: cand.id, score: result.score, level, createdAt: nowIso() });

  const seekerEntry = d.queue.find((q) => q.userId === seeker.id && q.status === "WAITING");
  if (seekerEntry) {
    seekerEntry.status = "MATCHED";
    seekerEntry.resolvedAt = nowIso();
    seekerEntry.level = level;
  }
  const candEntry = d.queue.find((q) => q.userId === cand.id && q.status === "WAITING");
  if (candEntry) {
    candEntry.status = "MATCHED";
    candEntry.resolvedAt = nowIso();
  }

  const shared = result.sharedInterestIds.map((id) => d.interests.find((i) => i.id === id)!).filter(Boolean);
  const conv: ConversationRecord = {
    id: uid(),
    participantIds: [seeker.id, cand.id],
    state: "ACTIVE",
    endReason: null,
    startedAt: nowIso(),
    endedAt: null,
    lastMessageAt: null,
    sharedInterestIds: result.sharedInterestIds,
    starterPrompt: starterFor(shared.map((s) => s.name)),
  };
  d.conversations.push(conv);
  trackDay("matches");
  trackDay("conversations");
  return conv;
}

function announceMatch(d: DB, conv: ConversationRecord, seeker: UserRecord, cand: UserRecord, shared: Interest[]): void {
  const seekerView = { conversation: conv, other: toPublic(d, cand), shared };
  const candView = { conversation: conv, other: toPublic(d, seeker), shared };
  emitEvent("match:found", seekerView, { userId: seeker.id });
  if (!cand.simulated) emitEvent("match:found", candView, { userId: cand.id });
}

export function search(userId: string): { entryId: string; status: "searching" } {
  const d = getDB();
  const user = requireUser(d, userId);
  if (activeConversationFor(d, userId)) throw ConflictError("Finish or end your current conversation first");

  const existing = d.queue.find((q) => q.userId === userId && q.status === "WAITING");
  if (existing) return { entryId: existing.id, status: "searching" }; // idempotent double-click guard

  const entry = mutate((dd) => {
    const e = { id: uid(), userId, status: "WAITING" as const, level: 1, joinedAt: nowIso(), resolvedAt: null };
    dd.queue.push(e);
    trackDay("searches");
    return e;
  });

  emitEvent("queue:status", { status: "searching", level: 1 }, { userId });
  startLoop(user.id);
  return { entryId: entry.id, status: "searching" };
}

function startLoop(userId: string): void {
  if (loops.has(userId)) return;
  const started = Date.now();
  const loop = setInterval(() => attempt(userId, Date.now() - started), 1150);
  loops.set(userId, loop);
  setTimeout(() => attempt(userId, 60), 350); // immediate first pass
}

function stopLoop(userId: string): void {
  const l = loops.get(userId);
  if (l) clearInterval(l);
  loops.delete(userId);
}

function attempt(userId: string, elapsed: number): void {
  const d = getDB();
  const entry = d.queue.find((q) => q.userId === userId && q.status === "WAITING");
  if (!entry) {
    stopLoop(userId);
    return;
  }
  const level = levelForElapsed(elapsed);
  if (entry.level !== level) {
    mutate((dd) => {
      const e = dd.queue.find((q) => q.id === entry.id);
      if (e && e.status === "WAITING") e.level = level;
    });
    emitEvent("queue:status", { status: "searching", level }, { userId });
  }
  const seeker = userById(d, userId);
  if (!seeker) {
    stopLoop(userId);
    return;
  }
  const best = findBest(d, seeker, level);
  if (!best) return;

  const conv = mutate((dd) => {
    const s = userById(dd, userId)!;
    const c = userById(dd, best.cand.id)!;
    const res = scorePair(dd, s, c);
    return createMatch(dd, s, c, res, level);
  });
  stopLoop(userId);
  if (best.cand.simulated) stopLoop(best.cand.id);

  const shared = conv.sharedInterestIds.map((id) => d.interests.find((i) => i.id === id)!).filter(Boolean);
  announceMatch(getDB(), conv, seeker, best.cand, shared);
  matchCreatedHook?.(conv);
}

export function cancel(userId: string): { status: "cancelled" } {
  stopLoop(userId);
  mutate((d) => {
    const e = d.queue.find((q) => q.userId === userId && q.status === "WAITING");
    if (e) {
      e.status = "CANCELLED";
      e.resolvedAt = nowIso();
    }
  });
  emitEvent("queue:status", { status: "cancelled" }, { userId });
  return { status: "cancelled" };
}

export function queueStatus(userId: string): { status: "idle" | "searching" | "matched"; level: number; elapsedMs: number } {
  const d = getDB();
  const e = [...d.queue].reverse().find((q) => q.userId === userId);
  if (!e) return { status: "idle", level: 1, elapsedMs: 0 };
  if (e.status === "WAITING") {
    // Self-heal: a page reload leaves the entry WAITING with no live loop behind it.
    if (!loops.has(userId)) startLoop(userId);
    return { status: "searching", level: e.level, elapsedMs: Date.now() - new Date(e.joinedAt).getTime() };
  }
  if (e.status === "MATCHED") return { status: "matched", level: e.level, elapsedMs: 0 };
  return { status: "idle", level: 1, elapsedMs: 0 };
}

export function ensureSearching(userId: string): void {
  const st = queueStatus(userId);
  if (st.status === "searching" && !loops.has(userId)) {
    startLoop(userId);
  }
}

/* Synchronous best-effort match used by NEXT — keeps the experience near-instant. */
export function matchNow(userId: string): ConversationRecord | null {
  const d = getDB();
  const seeker = requireUser(d, userId);
  if (activeConversationFor(d, userId)) throw ConflictError("You already have an active conversation");
  for (let level = 1; level <= 5; level++) {
    const best = findBest(d, seeker, level);
    if (best) {
      const conv = mutate((dd) => {
        const s = userById(dd, userId)!;
        const c = userById(dd, best.cand.id)!;
        const res = scorePair(dd, s, c);
        return createMatch(dd, s, c, res, level);
      });
      const shared = conv.sharedInterestIds.map((id) => getDB().interests.find((i) => i.id === id)!).filter(Boolean);
      announceMatch(getDB(), conv, seeker, best.cand, shared);
      matchCreatedHook?.(conv);
      return conv;
    }
  }
  return null;
}

export function publicUserById(id: string): PublicUser {
  const d = getDB();
  const u = userById(d, id);
  if (!u) throw new AppError(404, "NOT_FOUND", "User not found");
  return toPublic(d, u);
}
