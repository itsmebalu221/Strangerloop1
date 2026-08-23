/* Centralized API client — the REST seam of the application.
   Every screen talks to this client; in the Express deployment the same
   method/path contract is served over HTTP with identical envelopes:
   { success, data, meta, requestId } / { success:false, error:{code,message}, requestId }.
   Handles: latency, request IDs, auth headers, 401 → refresh → retry,
   per-endpoint rate limiting, consistent ApiError throws. */

import { uid, sleep, rand } from "../lib/utils";
import { AppError, ApiError } from "../lib/errors";
import { getDB, initEngine, userById, presenceSnapshot } from "../server/db";
import { setParticipantResolver } from "./realtime";
import * as auth from "../server/auth.service";
import * as profile from "../server/profile.service";
import * as matching from "../server/matching.service";
import * as chat from "../server/chat.service";
import * as safety from "../server/safety.service";
import * as admin from "../server/admin.service";

/* ---------------- engine bootstrap ---------------- */
initEngine();
chat.registerSocketHandlers();
setParticipantResolver((userId, conversationId) => {
  return getDB().conversations.find((c) => c.id === conversationId)?.participantIds.includes(userId) ?? false;
});

/* ---------------- token storage ---------------- */
const TOKEN_KEY = "wavelength.tokens.v1";

export function getTokens() {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
export function setTokens(t) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(t));
}
export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
}

const expiredListeners = new Set();
export function onSessionExpired(fn) {
  expiredListeners.add(fn);
  return () => expiredListeners.delete(fn);
}
function fireExpired() {
  clearTokens();
  expiredListeners.forEach((fn) => fn());
}

/* ---------------- routing table ---------------- */

function route(method, path, handler, opts = {}) {
  return { method, segments: path.split("/").filter(Boolean), handler, public: opts.public, rate: opts.rate, key: `${method} ${path}` };
}

const bootedAt = Date.now();

const routes = [
  // ---- infra ----
  route("GET", "/health", () => ({ status: "ok", uptimeSec: Math.floor((Date.now() - bootedAt) / 1000) }), { public: true }),
  route("GET", "/ready", () => {
    const d = getDB();
    return { ready: Array.isArray(d.users), users: d.users.length };
  }, { public: true }),

  // ---- auth ----
  route("POST", "/auth/register", (c) => {
    const r = auth.register(c.body);
    setTokens(r.tokens);
    return { user: r.user };
  }, { public: true, rate: [5, 120_000] }),
  route("POST", "/auth/login", (c) => {
    const r = auth.login(String(c.body.email ?? ""), String(c.body.password ?? ""));
    setTokens(r.tokens);
    return { user: r.user };
  }, { public: true, rate: [8, 60_000] }),
  route("POST", "/auth/refresh", (c) => {
    const rt = String(c.body.refreshToken ?? getTokens()?.refreshToken ?? "");
    if (!rt) throw new AppError(401, "UNAUTHORIZED", "No refresh token");
    const r = auth.refresh(rt);
    setTokens(r.tokens);
    return { user: r.user };
  }, { public: true }),
  route("POST", "/auth/logout", (c) => {
    const rt = String(c.body.refreshToken ?? getTokens()?.refreshToken ?? "");
    if (rt) auth.logout(rt);
    clearTokens();
    return { ok: true };
  }, { public: true }),
  route("POST", "/auth/logout-all", (c) => {
    auth.logoutAll(c.userId);
    clearTokens();
    return { ok: true };
  }),
  route("GET", "/auth/me", (c) => ({ user: auth.me(c.userId) })),
  route("POST", "/auth/verify-email", (c) => ({ user: auth.markEmailVerified(c.userId) })),
  route("POST", "/auth/forgot-password", (c) => auth.forgotPassword(String(c.body.email ?? "")), { public: true, rate: [3, 120_000] }),
  route("POST", "/auth/reset-password", (c) => {
    auth.resetPassword(String(c.body.token ?? ""), String(c.body.password ?? ""));
    return { ok: true };
  }, { public: true, rate: [5, 120_000] }),
  route("GET", "/auth/sessions", (c) => ({ sessions: auth.sessionsFor(c.userId) })),
  route("POST", "/auth/sessions/:sessionId/revoke", (c) => {
    auth.revokeSession(c.userId, c.params.sessionId);
    return { ok: true };
  }),

  // ---- reference + profile ----
  route("GET", "/reference", () => profile.referenceData(), { public: true }),
  route("GET", "/profile", (c) => ({ profile: profile.getProfile(c.userId) })),
  route("PATCH", "/profile", (c) => ({ profile: profile.updateProfile(c.userId, c.body) })),
  route("GET", "/profile/:username", (c) => ({ profile: profile.publicProfileByUsername(c.params.username) })),
  route("GET", "/preferences", (c) => ({ preferences: profile.getPreferences(c.userId) })),
  route("PATCH", "/preferences", (c) => ({ preferences: profile.updatePreferences(c.userId, c.body) })),
  route("DELETE", "/account", (c) => {
    profile.deleteAccount(c.userId);
    clearTokens();
    return { ok: true };
  }, { rate: [3, 60_000] }),

  // ---- matching ----
  route("POST", "/matching/search", (c) => matching.search(c.userId), { rate: [10, 60_000] }),
  route("POST", "/matching/cancel", (c) => matching.cancel(c.userId)),
  route("GET", "/matching/status", (c) => matching.queueStatus(c.userId)),

  // ---- conversations ----
  route("GET", "/conversations", (c) => ({ items: chat.recentConversations(c.userId, Number(c.query.get("limit") ?? 6)) })),
  route("GET", "/conversations/:id", (c) => chat.getConversation(c.userId, c.params.id)),
  route("GET", "/conversations/:id/messages", (c) =>
    chat.getMessages(c.userId, c.params.id, c.query.get("before"), Number(c.query.get("limit") ?? 60))
  ),
  route("DELETE", "/conversations/:id/messages/:messageId", (c) => ({ message: chat.deleteMessage(c.userId, c.params.id, c.params.messageId) })),
  route("POST", "/conversations/:id/next", (c) => chat.next(c.userId, c.params.id), { rate: [12, 30_000] }),
  route("POST", "/conversations/:id/connect", (c) => chat.connectFromConversation(c.userId, c.params.id)),

  // ---- safety ----
  route("POST", "/blocks", (c) => safety.blockUser(c.userId, String(c.body.userId ?? ""))),
  route("GET", "/blocks", (c) => ({ items: safety.listBlocks(c.userId) })),
  route("DELETE", "/blocks/:userId", (c) => {
    safety.unblockUser(c.userId, c.params.userId);
    return { ok: true };
  }),
  route("POST", "/reports", (c) => safety.reportUser(c.userId, c.body), { rate: [6, 300_000] }),
  route("GET", "/connections", (c) => ({ items: safety.listConnections(c.userId) })),
  route("DELETE", "/connections/:userId", (c) => {
    safety.removeConnection(c.userId, c.params.userId);
    return { ok: true };
  }),
  route("GET", "/notifications", (c) => ({ items: safety.listNotifications(c.userId) })),
  route("POST", "/notifications/:id/read", (c) => {
    safety.markNotificationRead(c.userId, c.params.id);
    return { ok: true };
  }),
  route("POST", "/notifications/read-all", (c) => {
    safety.markAllNotificationsRead(c.userId);
    return { ok: true };
  }),
  route("GET", "/presence", () => presenceSnapshot(), { public: true }),

  // ---- admin ----
  route("GET", "/admin/overview", (c) => admin.overview(c.userId)),
  route("GET", "/admin/analytics", (c) => admin.analytics(c.userId)),
  route("GET", "/admin/users", (c) => ({ items: admin.listUsers(c.userId, c.query.get("q") ?? "", c.query.get("status")) })),
  route("GET", "/admin/users/:id", (c) => admin.userDetail(c.userId, c.params.id)),
  route("POST", "/admin/users/:id/action", (c) => {
    admin.adminUserAction(c.userId, c.params.id, c.body.action, c.body.note ?? null);
    return { ok: true };
  }),
  route("GET", "/admin/reports", (c) => ({ items: admin.listReports(c.userId, c.query.get("status")) })),
  route("POST", "/admin/reports/:id/action", (c) => {
    admin.reportAction(c.userId, c.params.id, c.body.action, c.body.note ?? null);
    return { ok: true };
  }),
  route("GET", "/admin/audit", (c) => ({ items: admin.auditLog(c.userId) })),
];

function matchRoute(method, pathname) {
  const segs = pathname.split("/").filter(Boolean);
  for (const r of routes) {
    if (r.method !== method || r.segments.length !== segs.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < segs.length; i++) {
      const want = r.segments[i];
      if (want.startsWith(":")) params[want.slice(1)] = decodeURIComponent(segs[i]);
      else if (want !== segs[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { route: r, params };
  }
  return null;
}

/* ---------------- rate limiting (token windows per endpoint) ---------------- */
const rateBuckets = new Map();
function checkRate(r) {
  if (!r.rate) return;
  const [max, windowMs] = r.rate;
  const now = Date.now();
  const hits = (rateBuckets.get(r.key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    rateBuckets.set(r.key, hits);
    throw new AppError(429, "RATE_LIMITED", "Too many requests — please wait a moment");
  }
  hits.push(now);
  rateBuckets.set(r.key, hits);
}

/* ---------------- auth resolution with auto-refresh ---------------- */
function resolveClaims() {
  const tokens = getTokens();
  if (!tokens) return null;
  let claims = auth.verifyAccess(tokens.accessToken);
  if (!claims && tokens.refreshToken) {
    try {
      const r = auth.refresh(tokens.refreshToken);
      setTokens(r.tokens);
      claims = auth.verifyAccess(r.tokens.accessToken);
    } catch {
      return null;
    }
  }
  if (!claims) return null;
  const user = userById(getDB(), claims.sub);
  if (!user || user.status === "DELETED" || user.status === "BANNED") return null;
  return { userId: claims.sub };
}

/* ---------------- the client ---------------- */

export async function request(method, url, body) {
  const requestId = uid();
  const [rawPath, qs] = url.split("?");
  // All endpoints live under the /api/v1 base (callers may pass relative paths).
  const pathname = rawPath.startsWith("/api/v1") ? rawPath.slice(7) : rawPath;
  const found = matchRoute(method.toUpperCase(), pathname);
  await sleep(rand(70, 230)); // network latency of the embedded transport

  if (!found) {
    throw new ApiError(404, "NOT_FOUND", `No route for ${method} ${pathname}`, requestId);
  }
  const { route: r, params } = found;
  checkRate(r);

  let userId = "";
  if (!r.public) {
    const authed = resolveClaims();
    if (!authed) {
      fireExpired();
      throw new ApiError(401, "UNAUTHORIZED", "Your session expired — sign in again", requestId);
    }
    userId = authed.userId;
  }

  try {
    const data = r.handler({ userId, body: body ?? {}, params, query: new URLSearchParams(qs ?? "") });
    return data;
  } catch (e) {
    if (e instanceof AppError) throw new ApiError(e.status, e.code, e.message, requestId);
    if (e instanceof ApiError) throw e;
    // Never leak internal details to the client.
    console.error(`[${requestId}] internal error:`, e);
    throw new ApiError(500, "INTERNAL", "Something went wrong on our side", requestId);
  }
}

export const api = {
  get: (url) => request("GET", url),
  post: (url, body) => request("POST", url, body),
  patch: (url, body) => request("PATCH", url, body),
  del: (url, body) => request("DELETE", url, body),
};

/* Re-export for the auth store handshake. */
export { auth as authEngine };
