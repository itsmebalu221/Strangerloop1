/* AuthService — registration, credential login, JWT-style access tokens,
   rotating refresh tokens with family reuse detection, sessions, password reset.
   Signing secrets are module constants in the embedded engine; the Express
   deployment sources them from environment variables (JWT_ACCESS_SECRET etc.). */

import { uid, nowIso, stretchHash, hashStr, b64u, ageFromDob } from "../lib/utils";
import { getDB, mutate, userByEmail, userByLower, userById, toPublic, trackDay } from "./db";
import { AppError, ValidationError, AuthenticationError, NotFoundError, ConflictError } from "../lib/errors";

const ACCESS_SECRET = "wv-access-secret::embedded-engine::replace-from-env";
const REFRESH_SECRET = "wv-refresh-secret::embedded-engine::replace-from-env";
export const ACCESS_TTL_MS = 15 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 86400000;
const RESET_TTL_MS = 30 * 60 * 1000;

export function signAccess(user, sessionId) {
  const claims = {
    sub: user.id,
    sessionId,
    role: user.role,
    iat: Date.now(),
    exp: Date.now() + ACCESS_TTL_MS,
  };
  const body = b64u.enc(JSON.stringify(claims));
  return `${body}.${hashStr(body + "::" + ACCESS_SECRET)}`;
}

export function verifyAccess(token) {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  if (hashStr(body + "::" + ACCESS_SECRET) !== sig) return null;
  try {
    const claims = JSON.parse(b64u.dec(body));
    if (claims.exp < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

function hashRefresh(value) {
  return hashStr(value + "::" + REFRESH_SECRET);
}

function deviceLabel() {
  const ua = navigator.userAgent;
  const mobile = /Mobi|Android|iPhone/i.test(ua);
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return `${mobile ? "Mobile" : "Desktop"} · ${browser}`;
}

function issueTokens(d, user, familyId) {
  const session = {
    id: uid(),
    userId: user.id,
    device: deviceLabel(),
    createdAt: nowIso(),
    lastSeenAt: nowIso(),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS).toISOString(),
    revokedAt: null,
  };
  d.sessions.push(session);
  const rtId = uid();
  const value = `${rtId}.${hashStr(rtId + user.id + nowIso())}`;
  d.refreshTokens.push({
    id: rtId,
    userId: user.id,
    sessionId: session.id,
    familyId: familyId ?? uid(),
    tokenHash: hashRefresh(value),
    createdAt: nowIso(),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS).toISOString(),
    revokedAt: null,
    replacedBy: null,
  });
  return { accessToken: signAccess(user, session.id), refreshToken: value };
}

function assertAccountUsable(u) {
  if (u.status === "DELETED") throw AuthenticationError("This account no longer exists");
  if (u.status === "BANNED") throw new AppError(403, "ACCOUNT_BANNED", "This account has been banned");
  if (u.status === "SUSPENDED" && u.suspendedUntil && new Date(u.suspendedUntil) > new Date()) {
    throw new AppError(403, "ACCOUNT_SUSPENDED", `This account is suspended until ${new Date(u.suspendedUntil).toLocaleDateString()}`);
  }
}

export function toSelf(d, u) {
  const status =
    u.status === "SUSPENDED" && u.suspendedUntil && new Date(u.suspendedUntil) > new Date() ? "SUSPENDED" : u.status;
  return { ...toPublic(d, u), email: u.email, emailVerified: u.emailVerified, role: u.role, status, prefs: u.prefs, warnCount: u.warnCount, createdAt: u.createdAt };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export function validatePassword(pw) {
  if (pw.length < 8) throw ValidationError("Password must be at least 8 characters", "password");
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) throw ValidationError("Password needs at least one letter and one number", "password");
}

export function register(input) {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw ValidationError("Enter a valid email address", "email");
  if (!USERNAME_RE.test(input.username)) throw ValidationError("Username must be 3–20 letters, numbers or underscores", "username");
  validatePassword(input.password);
  if (!input.dob || Number.isNaN(new Date(input.dob).getTime())) throw ValidationError("Date of birth is required", "dob");
  const age = ageFromDob(input.dob);
  if (age < 18) throw new AppError(422, "UNDERAGE", "Wavelength is for adults — you must be 18 or older to register");
  if (age > 110) throw ValidationError("Please double-check your date of birth", "dob");
  if (input.interestIds.length < 1 || input.interestIds.length > 12) throw ValidationError("Pick between 1 and 12 interests", "interests");
  if (input.languageIds.length < 1) throw ValidationError("Pick at least one language", "languages");
  if (input.convTypeIds.length < 1) throw ValidationError("Pick at least one conversation type", "conversationTypes");
  if (input.bio && input.bio.length > 240) throw ValidationError("Bio must be under 240 characters", "bio");

  return mutate((d) => {
    if (userByEmail(d, email)) throw ConflictError("An account with this email already exists");
    if (userByLower(d, input.username.toLowerCase())) throw ConflictError("That username is taken — try another");
    const user = {
      id: uid(),
      email,
      username: input.username,
      usernameLower: input.username.toLowerCase(),
      salt: uid(),
      passHash: "",
      role: "user",
      status: "ACTIVE",
      emailVerified: false,
      createdAt: nowIso(),
      deletedAt: null,
      gender: input.gender,
      dob: input.dob,
      country: input.country,
      bio: input.bio?.trim() || null,
      avatarHue: Math.floor(Math.random() * 360),
      languageIds: input.languageIds,
      interestIds: input.interestIds,
      convTypeIds: input.convTypeIds,
      prefs: { genders: ["anyone"], ageMin: 18, ageMax: Math.min(60, age + 12), languageIds: input.languageIds, convTypeIds: input.convTypeIds },
      suspendedUntil: null,
      warnCount: 0,
      lastActiveAt: nowIso(),
    };
    user.passHash = stretchHash(input.password, user.salt);
    d.users.push(user);
    trackDay("signups");
    d.notifications.push({
      id: uid(),
      userId: user.id,
      type: "welcome",
      title: "Welcome to Wavelength",
      body: "Your profile is live. Verification email sent (simulated in this build — verify from your profile banner).",
      read: false,
      createdAt: nowIso(),
    });
    const tokens = issueTokens(d, user);
    return { user: toSelf(d, user), tokens };
  });
}

export function login(email, password) {
  return mutate((d) => {
    const user = userByEmail(d, email);
    if (!user || stretchHash(password, user.salt) !== user.passHash) {
      throw AuthenticationError("Invalid email or password");
    }
    assertAccountUsable(user);
    user.lastActiveAt = nowIso();
    const tokens = issueTokens(d, user);
    return { user: toSelf(d, user), tokens };
  });
}

export function refresh(refreshToken) {
  return mutate((d) => {
    const rtId = refreshToken.split(".")[0];
    const rt = d.refreshTokens.find((r) => r.id === rtId);
    if (!rt || rt.tokenHash !== hashRefresh(refreshToken)) throw AuthenticationError("Invalid refresh token");

    if (rt.revokedAt) {
      // Reuse detection: an already-rotated token was presented → compromise.
      for (const other of d.refreshTokens) if (other.familyId === rt.familyId) other.revokedAt = other.revokedAt ?? nowIso();
      const session = d.sessions.find((s) => s.id === rt.sessionId);
      if (session) session.revokedAt = nowIso();
      throw new AppError(401, "REFRESH_REUSE", "Refresh token reuse detected — all sessions in this family were revoked");
    }
    if (new Date(rt.expiresAt) < new Date()) {
      rt.revokedAt = nowIso();
      throw AuthenticationError("Refresh token expired — sign in again");
    }
    const session = d.sessions.find((s) => s.id === rt.sessionId);
    if (!session || session.revokedAt || new Date(session.expiresAt) < new Date()) {
      throw AuthenticationError("Session revoked — sign in again");
    }
    const user = userById(d, rt.userId);
    if (!user) throw AuthenticationError("Account no longer exists");
    assertAccountUsable(user);

    // Rotation: old token is single-use from here on.
    rt.revokedAt = nowIso();
    const tokens = issueTokens(d, user, rt.familyId);
    rt.replacedBy = d.refreshTokens[d.refreshTokens.length - 1].id;
    session.lastSeenAt = nowIso();
    user.lastActiveAt = nowIso();
    return { tokens, user: toSelf(d, user) };
  });
}

export function logout(refreshToken) {
  mutate((d) => {
    const rtId = refreshToken.split(".")[0];
    const rt = d.refreshTokens.find((r) => r.id === rtId);
    if (rt) {
      rt.revokedAt = nowIso();
      const session = d.sessions.find((s) => s.id === rt.sessionId);
      if (session) session.revokedAt = nowIso();
    }
  });
}

export function logoutAll(userId) {
  mutate((d) => {
    for (const s of d.sessions) if (s.userId === userId && !s.revokedAt) s.revokedAt = nowIso();
    for (const r of d.refreshTokens) if (r.userId === userId && !r.revokedAt) r.revokedAt = nowIso();
    d.audit.push({ id: uid(), actorId: userId, actorName: userById(d, userId)?.username ?? "unknown", action: "auth.logout_all", target: userId, details: "All sessions revoked by user", createdAt: nowIso() });
  });
}

export function me(userId) {
  const d = getDB();
  const user = userById(d, userId);
  if (!user) throw AuthenticationError("Account not found");
  assertAccountUsable(user);
  return toSelf(d, user);
}

export function sessionsFor(userId) {
  const d = getDB();
  return d.sessions.filter((s) => s.userId === userId && !s.revokedAt && new Date(s.expiresAt) > new Date());
}

export function revokeSession(userId, sessionId) {
  mutate((d) => {
    const s = d.sessions.find((x) => x.id === sessionId && x.userId === userId);
    if (!s) throw NotFoundError("Session not found");
    s.revokedAt = nowIso();
    for (const r of d.refreshTokens) if (r.sessionId === sessionId && !r.revokedAt) r.revokedAt = nowIso();
  });
}

export function markEmailVerified(userId) {
  return mutate((d) => {
    const u = userById(d, userId);
    if (!u) throw NotFoundError();
    u.emailVerified = true;
    return toSelf(d, u);
  });
}

export function forgotPassword(email) {
  const d = getDB();
  const user = userByEmail(d, email);
  const note = "If an account exists for that email, a reset link has been sent.";
  if (!user) return { note, devToken: null };
  const raw = uid() + uid();
  mutate((dd) => {
    dd.passwordResetTokens.push({ tokenHash: hashStr(raw), userId: user.id, expiresAt: new Date(Date.now() + RESET_TTL_MS).toISOString(), usedAt: null });
  });
  // No email provider in the embedded engine — the raw one-time token is
  // surfaced to the UI in dev mode. Production sends it via the mailer service.
  return { note, devToken: raw };
}

export function resetPassword(token, newPassword) {
  validatePassword(newPassword);
  mutate((d) => {
    const entry = d.passwordResetTokens.find((t) => t.tokenHash === hashStr(token));
    if (!entry) throw new AppError(422, "RESET_INVALID", "Reset link is invalid");
    if (entry.usedAt) throw new AppError(422, "RESET_USED", "This reset link was already used");
    if (new Date(entry.expiresAt) < new Date()) throw new AppError(422, "RESET_EXPIRED", "Reset link expired — request a new one");
    entry.usedAt = nowIso();
    const user = userById(d, entry.userId);
    if (!user) throw NotFoundError();
    user.salt = uid();
    user.passHash = stretchHash(newPassword, user.salt);
    // Password change invalidates every existing session.
    for (const s of d.sessions) if (s.userId === user.id && !s.revokedAt) s.revokedAt = nowIso();
    for (const r of d.refreshTokens) if (r.userId === user.id && !r.revokedAt) r.revokedAt = nowIso();
  });
}

export function requireUser(d, userId) {
  const u = userById(d, userId);
  if (!u || u.status === "DELETED") throw AuthenticationError("Account not found");
  assertAccountUsable(u);
  return u;
}
