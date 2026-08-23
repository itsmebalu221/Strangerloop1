/* AdminService + ModerationService (human tooling) + AnalyticsService.
   RBAC: permission maps per role; every action is audit-logged. */

import type { DB, PublicUser, ReportRecord, UserStatus } from "../lib/types";
import { uid, nowIso } from "../lib/utils";
import { getDB, mutate, userById, toPublic } from "./db";
import { AuthorizationError, NotFoundError, ValidationError } from "../lib/errors";
import { emitEvent } from "../api/realtime";
import { presenceSnapshot } from "./db";
import { pushNotification } from "./safety.service";

const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: ["users:read", "users:action", "reports:read", "reports:action", "analytics:read", "audit:read"],
  moderator: ["users:read", "reports:read", "reports:action", "audit:read"],
  user: [],
};

export function requirePermission(userId: string, permission: string): void {
  const d = getDB();
  const u = userById(d, userId);
  if (!u) throw AuthorizationError("Unknown account");
  const perms = ROLE_PERMISSIONS[u.role] ?? [];
  if (!perms.includes(permission)) throw AuthorizationError(`Missing permission: ${permission}`);
}

function audit(d: DB, actorId: string, action: string, target: string | null, details: string | null): void {
  d.audit.push({
    id: uid(),
    actorId,
    actorName: userById(d, actorId)?.username ?? "system",
    action,
    target,
    details,
    createdAt: nowIso(),
  });
}

/* ---------------- overview / analytics ---------------- */

export function overview(actorId: string) {
  requirePermission(actorId, "analytics:read");
  const d = getDB();
  const now = Date.now();
  const days = d.analyticsDays.slice(-14);
  const searches = days.reduce((s, r) => s + r.searches, 0);
  const matches = days.reduce((s, r) => s + r.matches, 0);
  const ended = d.conversations.filter((c) => c.endedAt);
  const avgMs = ended.length ? ended.reduce((s, c) => s + (new Date(c.endedAt!).getTime() - new Date(c.startedAt).getTime()), 0) / ended.length : 0;

  return {
    online: presenceSnapshot().count,
    searching: d.queue.filter((q) => q.status === "WAITING").length,
    activeConversations: d.conversations.filter((c) => c.state === "ACTIVE").length,
    totalUsers: d.users.filter((u) => !u.simulated && u.status !== "DELETED").length,
    newUsers7d: d.users.filter((u) => !u.simulated && now - new Date(u.createdAt).getTime() < 7 * 86400000).length,
    dau: d.users.filter((u) => !u.simulated && now - new Date(u.lastActiveAt).getTime() < 86400000).length,
    matchRate: searches ? Math.round((matches / searches) * 100) : 0,
    avgConversationSec: Math.round(avgMs / 1000),
    openReports: d.reports.filter((r) => r.status === "open" || r.status === "escalated").length,
    banned: d.users.filter((u) => u.status === "BANNED").length,
    suspended: d.users.filter((u) => u.status === "SUSPENDED" && u.suspendedUntil && new Date(u.suspendedUntil) > new Date()).length,
  };
}

export function analytics(actorId: string) {
  requirePermission(actorId, "analytics:read");
  const d = getDB();
  const days = d.analyticsDays.slice(-14);
  const realUsers = d.users.filter((u) => !u.simulated);
  const now = Date.now();
  const retentionBase = Math.max(1, realUsers.filter((u) => now - new Date(u.createdAt).getTime() > 86400000).length);
  const active = (windowMs: number) => realUsers.filter((u) => now - new Date(u.lastActiveAt).getTime() < windowMs).length;

  return {
    days,
    retention: {
      d1: Math.min(100, Math.round((active(86400000 * 2) / retentionBase) * 100)),
      d7: Math.min(100, Math.round((active(86400000 * 8) / retentionBase) * 100)),
      d30: Math.min(100, Math.round((active(86400000 * 31) / retentionBase) * 100)),
    },
    outcomes: {
      next: d.conversations.filter((c) => c.endReason === "NEXT" || c.endReason === "STRANGER_NEXT").length,
      blocked: d.conversations.filter((c) => c.endReason === "BLOCK").length,
      reported: d.conversations.filter((c) => c.endReason === "REPORT").length,
      mutualConnections: d.connections.filter((c) => c.status === "mutual").length,
    },
    scoreHistogram: (() => {
      const buckets = [0, 0, 0, 0, 0]; // <40, 40-59, 60-79, 80-99, 100+
      for (const m of d.matches) {
        if (m.score < 40) buckets[0]++;
        else if (m.score < 60) buckets[1]++;
        else if (m.score < 80) buckets[2]++;
        else if (m.score < 100) buckets[3]++;
        else buckets[4]++;
      }
      return buckets;
    })(),
  };
}

/* ---------------- user management ---------------- */

export interface AdminUserRow {
  user: PublicUser;
  email: string;
  status: UserStatus;
  role: string;
  warnCount: number;
  createdAt: string;
  lastActiveAt: string;
  simulated: boolean;
}

export function listUsers(actorId: string, q: string, status: string | null): AdminUserRow[] {
  requirePermission(actorId, "users:read");
  const d = getDB();
  const needle = q.trim().toLowerCase();
  return d.users
    .filter((u) => u.status !== "DELETED")
    .filter((u) => !status || u.status === status)
    .filter((u) => !needle || u.usernameLower.includes(needle) || u.email.includes(needle))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((u) => ({
      user: toPublic(d, u),
      email: u.email,
      status: u.suspendedUntil && new Date(u.suspendedUntil) > new Date() && u.status === "SUSPENDED" ? "SUSPENDED" : u.status,
      role: u.role,
      warnCount: u.warnCount,
      createdAt: u.createdAt,
      lastActiveAt: u.lastActiveAt,
      simulated: !!u.simulated,
    }));
}

export function userDetail(actorId: string, targetId: string) {
  requirePermission(actorId, "users:read");
  const d = getDB();
  const u = userById(d, targetId);
  if (!u) throw NotFoundError("User not found");
  return {
    row: {
      user: toPublic(d, u),
      email: u.email,
      status: u.status,
      role: u.role,
      warnCount: u.warnCount,
      createdAt: u.createdAt,
      lastActiveAt: u.lastActiveAt,
      simulated: !!u.simulated,
    } as AdminUserRow,
    moderationHistory: d.moderation.filter((m) => m.userId === targetId).slice(-20).reverse(),
    reportsAgainst: d.reports.filter((r) => r.reportedId === targetId).slice(-10).reverse(),
    reportsFiled: d.reports.filter((r) => r.reporterId === targetId).length,
    activeSessions: d.sessions.filter((s) => s.userId === targetId && !s.revokedAt).length,
    conversationCount: d.conversations.filter((c) => c.participantIds.includes(targetId)).length,
  };
}

export function adminUserAction(actorId: string, targetId: string, action: "warn" | "suspend" | "ban" | "restore", note: string | null): void {
  requirePermission(actorId, "users:action");
  mutate((d) => {
    const target = userById(d, targetId);
    if (!target) throw NotFoundError("User not found");
    if (target.role === "admin" && action !== "restore") throw ValidationError("Admins cannot action other admins");

    if (action === "warn") {
      target.warnCount += 1;
      d.moderation.push({ id: uid(), userId: targetId, actorId, action: "WARN", reason: note ?? "manual warning", risk: "SUSPICIOUS", createdAt: nowIso() });
      pushNotification(d, targetId, "moderation", "You received a warning", note ?? "A moderator asked you to review the community guidelines.");
    } else if (action === "suspend") {
      target.status = "SUSPENDED";
      target.suspendedUntil = new Date(Date.now() + 7 * 86400000).toISOString();
      d.moderation.push({ id: uid(), userId: targetId, actorId, action: "SUSPEND", reason: note ?? "manual suspension", risk: "HIGH", createdAt: nowIso() });
      pushNotification(d, targetId, "moderation", "Account suspended (7 days)", note ?? "Review the community guidelines to avoid a ban.");
      endActiveConversationsFor(d, targetId);
    } else if (action === "ban") {
      target.status = "BANNED";
      d.moderation.push({ id: uid(), userId: targetId, actorId, action: "BAN", reason: note ?? "manual ban", risk: "SEVERE", createdAt: nowIso() });
      for (const s of d.sessions) if (s.userId === targetId && !s.revokedAt) s.revokedAt = nowIso();
      for (const r of d.refreshTokens) if (r.userId === targetId && !r.revokedAt) r.revokedAt = nowIso();
      endActiveConversationsFor(d, targetId);
    } else {
      target.status = "ACTIVE";
      target.suspendedUntil = null;
      d.moderation.push({ id: uid(), userId: targetId, actorId, action: "RESTRICT", reason: note ?? "restored", risk: "LOW", createdAt: nowIso() });
      pushNotification(d, targetId, "moderation", "Account restored", "Your account is back in good standing.");
    }
    audit(d, actorId, `admin.user.${action}`, targetId, note);
  });
  emitEvent("account:action", { targetId, action }, { userId: targetId });
}

function endActiveConversationsFor(d: DB, userId: string): void {
  for (const c of d.conversations) {
    if (c.state === "ACTIVE" && c.participantIds.includes(userId)) {
      c.state = "ENDED";
      c.endReason = "DISCONNECT";
      c.endedAt = nowIso();
      emitEvent("conversation:ended", { conversationId: c.id, reason: "DISCONNECT", byUserId: null }, { conversationId: c.id });
    }
  }
}

/* ---------------- report queue ---------------- */

export interface AdminReportRow extends ReportRecord {
  reporterName: string;
  reportedName: string;
  context: Array<{ sender: string; content: string; at: string }>;
  priorViolations: number;
}

export function listReports(actorId: string, status: string | null): AdminReportRow[] {
  requirePermission(actorId, "reports:read");
  const d = getDB();
  return d.reports
    .filter((r) => !status || r.status === status)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 60)
    .map((r) => toReportRow(d, r));
}

function toReportRow(d: DB, r: ReportRecord): AdminReportRow {
  const ctx = r.conversationId ? d.messages.filter((m) => m.conversationId === r.conversationId).slice(-8) : [];
  return {
    ...r,
    reporterName: r.reporterId === "system" ? "Auto-moderation" : userById(d, r.reporterId)?.username ?? "deleted",
    reportedName: userById(d, r.reportedId)?.username ?? "deleted",
    context: ctx.map((m) => ({ sender: m.senderId === "system" ? "system" : userById(d, m.senderId)?.username ?? "?", content: m.deletedAt ? "(deleted)" : m.content, at: m.createdAt })),
    priorViolations: d.moderation.filter((m) => m.userId === r.reportedId && m.actorId !== "system").length,
  };
}

export function reportAction(actorId: string, reportId: string, action: "dismiss" | "warn" | "suspend" | "ban" | "escalate", note: string | null): void {
  requirePermission(actorId, "reports:action");
  if (action === "ban") requirePermission(actorId, "users:action");
  mutate((d) => {
    const r = d.reports.find((x) => x.id === reportId);
    if (!r) throw NotFoundError("Report not found");
    if (r.status === "dismissed" || r.status === "actioned") throw ValidationError("Report already resolved");

    if (action === "dismiss") {
      r.status = "dismissed";
    } else if (action === "escalate") {
      r.status = "escalated";
    } else {
      r.status = "actioned";
      const target = userById(d, r.reportedId);
      if (target) {
        if (action === "warn") {
          target.warnCount += 1;
          pushNotification(d, target.id, "moderation", "You received a warning", note ?? "A moderator reviewed a report about your conduct.");
        } else if (action === "suspend") {
          target.status = "SUSPENDED";
          target.suspendedUntil = new Date(Date.now() + 7 * 86400000).toISOString();
          endActiveConversationsFor(d, target.id);
          pushNotification(d, target.id, "moderation", "Account suspended (7 days)", note ?? "A report against you was upheld.");
        } else if (action === "ban") {
          target.status = "BANNED";
          for (const s of d.sessions) if (s.userId === target.id && !s.revokedAt) s.revokedAt = nowIso();
          for (const rt of d.refreshTokens) if (rt.userId === target.id && !rt.revokedAt) rt.revokedAt = nowIso();
          endActiveConversationsFor(d, target.id);
        }
      }
    }
    r.adminNote = note;
    r.actedBy = actorId;
    d.moderation.push({
      id: uid(),
      userId: r.reportedId,
      actorId,
      action: action === "dismiss" ? "ALLOW" : action === "warn" ? "WARN" : action === "suspend" ? "SUSPEND" : action === "ban" ? "BAN" : "ESCALATE",
      reason: `report:${r.category}`,
      risk: r.risk,
      createdAt: nowIso(),
    });
    audit(d, actorId, `admin.report.${action}`, reportId, note);
  });
}

export function auditLog(actorId: string) {
  requirePermission(actorId, "audit:read");
  const d = getDB();
  return [...d.audit].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100);
}
