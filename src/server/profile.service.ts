/* ProfileService — profile reads/updates, preferences, reference data,
   account deletion with the retention policy (reports/moderation preserved,
   identity anonymized, auth material destroyed). */

import type { DB, Gender, GenderPref, Preferences, ReferenceData, SelfUser, UserRecord } from "../lib/types";
import { nowIso, uid } from "../lib/utils";
import { getDB, mutate, userById, userByLower, toPublic, activeConversationFor } from "./db";
import { ValidationError, NotFoundError } from "../lib/errors";
import { emitEvent } from "../api/realtime";
import { toSelf, requireUser } from "./auth.service";

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export function referenceData(): ReferenceData {
  const d = getDB();
  return { interests: d.interests, languages: d.languages, conversationTypes: d.conversationTypes };
}

export function getProfile(userId: string): SelfUser {
  const d = getDB();
  return toSelf(d, requireUser(d, userId));
}

export function publicProfileByUsername(username: string) {
  const d = getDB();
  const u = userByLower(d, username.toLowerCase());
  if (!u || u.status === "DELETED") throw NotFoundError("Profile not found");
  return toPublic(d, u);
}

export interface ProfilePatch {
  username?: string;
  bio?: string | null;
  gender?: Gender;
  country?: string;
  languageIds?: string[];
  interestIds?: string[];
  convTypeIds?: string[];
  avatarHue?: number;
}

export function updateProfile(userId: string, patch: ProfilePatch): SelfUser {
  return mutate((d) => {
    const u = requireUser(d, userId);
    if (patch.username !== undefined) {
      if (!USERNAME_RE.test(patch.username)) throw ValidationError("Username must be 3–20 letters, numbers or underscores", "username");
      const clash = userByLower(d, patch.username.toLowerCase());
      if (clash && clash.id !== userId) throw ValidationError("That username is taken", "username");
      u.username = patch.username;
      u.usernameLower = patch.username.toLowerCase();
    }
    if (patch.bio !== undefined) {
      if (patch.bio && patch.bio.length > 240) throw ValidationError("Bio must be under 240 characters", "bio");
      u.bio = patch.bio?.trim() || null;
    }
    if (patch.gender !== undefined) u.gender = patch.gender;
    if (patch.country !== undefined) u.country = patch.country;
    if (patch.languageIds !== undefined) {
      if (patch.languageIds.length < 1) throw ValidationError("Keep at least one language", "languages");
      u.languageIds = patch.languageIds;
    }
    if (patch.interestIds !== undefined) {
      if (patch.interestIds.length < 1 || patch.interestIds.length > 12) throw ValidationError("Pick between 1 and 12 interests", "interests");
      u.interestIds = patch.interestIds;
    }
    if (patch.convTypeIds !== undefined) {
      if (patch.convTypeIds.length < 1) throw ValidationError("Keep at least one conversation type", "conversationTypes");
      u.convTypeIds = patch.convTypeIds;
    }
    if (patch.avatarHue !== undefined) u.avatarHue = ((patch.avatarHue % 360) + 360) % 360;
    return toSelf(d, u);
  });
}

export function getPreferences(userId: string): Preferences {
  const d = getDB();
  return requireUser(d, userId).prefs;
}

export function updatePreferences(userId: string, patch: Partial<Preferences>): Preferences {
  return mutate((d) => {
    const u = requireUser(d, userId);
    if (patch.genders !== undefined) {
      if (!patch.genders.length) throw ValidationError("Pick at least one gender preference", "genders");
      u.prefs.genders = patch.genders as GenderPref[];
    }
    if (patch.ageMin !== undefined) u.prefs.ageMin = Math.max(18, Math.min(patch.ageMin, 70));
    if (patch.ageMax !== undefined) u.prefs.ageMax = Math.max(18, Math.min(patch.ageMax, 70));
    if (u.prefs.ageMin > u.prefs.ageMax) [u.prefs.ageMin, u.prefs.ageMax] = [u.prefs.ageMax, u.prefs.ageMin];
    if (patch.languageIds !== undefined) u.prefs.languageIds = patch.languageIds;
    if (patch.convTypeIds !== undefined) u.prefs.convTypeIds = patch.convTypeIds;
    return u.prefs;
  });
}

/* ---------------- account deletion (retention policy) ----------------
   Anonymized: username, email, bio, dob. Destroyed: sessions, refresh tokens,
   queue presence. Preserved: reports & moderation history (legal retention),
   aggregate analytics. */
export function deleteAccount(userId: string): void {
  mutate((d) => {
    const u = userById(d, userId);
    if (!u) throw NotFoundError("Account not found");
    const conv = activeConversationFor(d, userId);
    if (conv) {
      conv.state = "ENDED";
      conv.endReason = "DISCONNECT";
      conv.endedAt = nowIso();
      emitEvent("conversation:ended", { conversationId: conv.id, reason: "DISCONNECT", byUserId: userId }, { conversationId: conv.id });
    }
    for (const q of d.queue) if (q.userId === userId && q.status === "WAITING") q.status = "CANCELLED";
    for (const s of d.sessions) if (s.userId === userId) s.revokedAt = nowIso();
    for (const r of d.refreshTokens) if (r.userId === userId) r.revokedAt = nowIso();
    d.connections = d.connections.filter((c) => !(c.aId === userId || c.bId === userId));
    d.notifications = d.notifications.filter((n) => n.userId !== userId);

    const tag = uid().slice(0, 8);
    u.status = "DELETED";
    u.deletedAt = nowIso();
    u.username = `deleted_${tag}`;
    u.usernameLower = u.username.toLowerCase();
    u.email = `deleted_${tag}@removed.wavelength`;
    u.bio = null;
    u.dob = "1900-01-01";
    u.passHash = "";
    u.salt = "";
    d.audit.push({ id: uid(), actorId: userId, actorName: `deleted_${tag}`, action: "account.deleted", target: userId, details: "User-initiated account deletion (anonymized)", createdAt: nowIso() });
  });
}
