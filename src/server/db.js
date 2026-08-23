/* Repository layer for the embedded server engine.
   Storage adapter: localStorage (swap for MySQL via Prisma in the Express deployment).
   All writes go through mutate(); reads through getDB(). */

import { uid, nowIso, stretchHash, dayKey, ageFromDob, ageRangeOf } from "../lib/utils";
import { PERSONAS, dobFromAge } from "./strangers";
import { emitEvent } from "../api/realtime";

const DB_KEY = "wavelength.db.v1";
const DB_VERSION = 1;

const INTERESTS = [
  ["Programming", "Technology"], ["Artificial Intelligence", "Technology"], ["Web Development", "Technology"],
  ["Mobile Development", "Technology"], ["Cybersecurity", "Technology"], ["Startups", "Technology"],
  ["Technology", "Technology"], ["Robotics", "Technology"],
  ["PC Gaming", "Gaming"], ["Mobile Gaming", "Gaming"], ["Console Gaming", "Gaming"], ["Esports", "Gaming"], ["Game Development", "Gaming"],
  ["Movies", "Entertainment"], ["TV", "Entertainment"], ["Anime", "Entertainment"], ["Music", "Entertainment"], ["Books", "Entertainment"],
  ["College", "Education"], ["School", "Education"], ["Competitive Exams", "Education"], ["Science", "Education"],
  ["Mathematics", "Education"], ["Languages", "Education"], ["Learning", "Education"],
  ["Fitness", "Lifestyle"], ["Travel", "Lifestyle"], ["Food", "Lifestyle"], ["Photography", "Lifestyle"], ["Fashion", "Lifestyle"],
  ["Friendship", "Social"], ["Casual Conversation", "Social"], ["Networking", "Social"], ["Debate", "Social"], ["Relationships", "Social"],
];

const LANGUAGES = [
  ["en", "English"], ["hi", "Hindi"], ["te", "Telugu"], ["ta", "Tamil"], ["kn", "Kannada"],
  ["ml", "Malayalam"], ["bn", "Bengali"], ["mr", "Marathi"], ["es", "Spanish"], ["ja", "Japanese"],
  ["de", "German"], ["pt", "Portuguese"], ["tr", "Turkish"], ["fr", "French"],
];

const CONV_TYPES = ["Casual", "Friendship", "Networking", "Coding", "Gaming", "Study", "Debate", "Movies", "Music", "Travel", "General"];

const COUNTRIES = ["India", "United States", "United Kingdom", "Germany", "Japan", "Brazil", "Singapore", "Canada", "Spain", "Turkey", "Nigeria", "UAE", "Australia", "France"];

function makeUser(partial) {
  return {
    email: `${partial.username.toLowerCase()}@wavelength.dev`,
    usernameLower: partial.username.toLowerCase(),
    passHash: "",
    salt: "",
    role: "user",
    status: "ACTIVE",
    emailVerified: true,
    createdAt: nowIso(),
    deletedAt: null,
    gender: "undisclosed",
    dob: dobFromAge(25),
    country: "India",
    bio: null,
    avatarHue: Math.floor(Math.random() * 360),
    languageIds: [],
    interestIds: [],
    convTypeIds: [],
    prefs: { genders: ["anyone"], ageMin: 18, ageMax: 45, languageIds: [], convTypeIds: [] },
    suspendedUntil: null,
    warnCount: 0,
    lastActiveAt: nowIso(),
    ...partial,
  };
}

function buildSeed() {
  const interests = INTERESTS.map(([name, category]) => ({ id: `int_${name.toLowerCase().replace(/\s+/g, "-")}`, name, category }));
  const languages = LANGUAGES.map(([code, name]) => ({ id: `lang_${code}`, code, name }));
  const conversationTypes = CONV_TYPES.map((name) => ({ id: `ct_${name.toLowerCase()}`, name }));

  const byName = (arr, names) => names.map((n) => arr.find((x) => x.name === n).id);

  const users = PERSONAS.map((p) =>
    makeUser({
      id: uid(),
      username: p.username,
      gender: p.gender,
      country: p.country,
      dob: dobFromAge(p.age),
      bio: p.bio,
      avatarHue: p.hue,
      languageIds: byName(languages, p.langs),
      interestIds: byName(interests, p.interests),
      convTypeIds: byName(conversationTypes, p.convTypes),
      simulated: true,
      createdAt: new Date(Date.now() - Math.random() * 90 * 86400000).toISOString(),
    })
  );

  // Dev-seeded accounts (disclosed on the login screen): one member, one admin.
  const demo = makeUser({
    id: uid(),
    username: "Aarav",
    email: "aarav@demo.dev",
    gender: "male",
    country: "India",
    dob: dobFromAge(24),
    bio: "Here to talk about code, games, and questionable startup ideas.",
    avatarHue: 150,
    languageIds: byName(languages, ["English", "Hindi"]),
    interestIds: byName(interests, ["Programming", "Artificial Intelligence", "PC Gaming", "Startups"]),
    convTypeIds: byName(conversationTypes, ["Coding", "Gaming", "Casual"]),
    prefs: { genders: ["anyone"], ageMin: 18, ageMax: 34, languageIds: byName(languages, ["English"]), convTypeIds: byName(conversationTypes, ["Coding", "Casual"]) },
    emailVerified: true,
  });
  demo.salt = uid();
  demo.passHash = stretchHash("Aarav#1234", demo.salt);

  const admin = makeUser({
    id: uid(),
    username: "wv-admin",
    email: "admin@demo.dev",
    role: "admin",
    gender: "undisclosed",
    country: "India",
    dob: dobFromAge(32),
    bio: "Keeping the frequency clean.",
    avatarHue: 210,
    languageIds: byName(languages, ["English"]),
    interestIds: byName(interests, ["Technology"]),
    convTypeIds: byName(conversationTypes, ["General"]),
    emailVerified: true,
  });
  admin.salt = uid();
  admin.passHash = stretchHash("Admin#2026", admin.salt);

  users.push(demo, admin);

  // Seeded analytics baseline (labelled as such in the admin UI) — live events append to today.
  const analyticsDays = Array.from({ length: 14 }, (_, i) => {
    const offset = 13 - i;
    const base = 40 + Math.round(Math.sin(offset / 2.2) * 12 + Math.random() * 14);
    return {
      date: dayKey(offset),
      signups: base,
      searches: base + Math.round(Math.random() * 30),
      matches: Math.round(base * 0.72 + Math.random() * 8),
      conversations: Math.round(base * 0.66),
      reports: Math.random() < 0.4 ? Math.ceil(Math.random() * 3) : 0,
    };
  });

  const online = users.filter((u) => u.simulated).slice(0, 10).map((u) => u.id);

  return {
    v: DB_VERSION,
    interests,
    languages,
    conversationTypes,
    users,
    sessions: [],
    refreshTokens: [],
    queue: [],
    matches: [],
    conversations: [],
    messages: [],
    connections: [],
    blocks: [],
    reports: [],
    moderation: [],
    notifications: [],
    audit: [],
    analyticsDays,
    passwordResetTokens: [],
    onlinePersonaIds: online,
  };
}

/* ---------------- persistence ---------------- */

let db = load();

function load() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.v === DB_VERSION) return parsed;
    }
  } catch {
    /* corrupted storage → reseed */
  }
  const fresh = buildSeed();
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(fresh));
  } catch { /* private mode */ }
  return fresh;
}

function save() {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch { /* storage full/private mode — engine continues in-memory */ }
}

export function getDB() {
  return db;
}

export function mutate(fn) {
  const result = fn(db);
  save();
  return result;
}

export function resetDB() {
  db = buildSeed();
  save();
}

/* ---------------- query helpers (repository) ---------------- */

export function userById(d, id) {
  return d.users.find((u) => u.id === id);
}

export function userByLower(d, lower) {
  return d.users.find((u) => u.usernameLower === lower);
}

export function userByEmail(d, email) {
  const e = email.trim().toLowerCase();
  return d.users.find((u) => u.email === e);
}

function ageRangeOfDob(dob) {
  return ageRangeOf(ageFromDob(dob));
}

export function toPublic(d, u) {
  return {
    id: u.id,
    username: u.username,
    ageRange: ageRangeOfDob(u.dob),
    gender: u.gender,
    country: u.country,
    bio: u.bio,
    avatarHue: u.avatarHue,
    interests: u.interestIds.map((id) => d.interests.find((i) => i.id === id)).filter(Boolean),
    languages: u.languageIds.map((id) => d.languages.find((l) => l.id === id)).filter(Boolean),
    convTypes: u.convTypeIds.map((id) => d.conversationTypes.find((c) => c.id === id)).filter(Boolean),
    simulated: u.simulated,
  };
}

export function isBlockedEitherWay(d, a, b) {
  return d.blocks.some((bl) => (bl.blockerId === a && bl.blockedId === b) || (bl.blockerId === b && bl.blockedId === a));
}

export function activeConversationFor(d, userId) {
  return d.conversations.find((c) => c.state === "ACTIVE" && c.participantIds.includes(userId));
}

export function activeConversationBetween(d, a, b) {
  return d.conversations.find((c) => c.state === "ACTIVE" && c.participantIds.includes(a) && c.participantIds.includes(b));
}

export function trackDay(field) {
  mutate((d) => {
    const key = dayKey(0);
    let row = d.analyticsDays.find((r) => r.date === key);
    if (!row) {
      row = { date: key, signups: 0, searches: 0, matches: 0, conversations: 0, reports: 0 };
      d.analyticsDays.push(row);
      if (d.analyticsDays.length > 60) d.analyticsDays = d.analyticsDays.slice(-60);
    }
    row[field] += 1;
  });
}

/* ---------------- engine boot: hygiene + presence ---------------- */

let booted = false;

export function initEngine() {
  if (booted) return;
  booted = true;

  // Expire stale queue entries left over from a previous page life.
  mutate((d) => {
    const cutoff = Date.now() - 90_000;
    for (const q of d.queue) {
      if (q.status === "WAITING" && new Date(q.joinedAt).getTime() < cutoff) {
        q.status = "EXPIRED";
        q.resolvedAt = nowIso();
      }
    }
    // Conversations left ACTIVE with a simulated peer end on reconnect of the app.
    for (const c of d.conversations) {
      if (c.state === "ACTIVE" && c.participantIds.some((id) => userById(d, id)?.simulated)) {
        c.state = "ENDED";
        c.endReason = "DISCONNECT";
        c.endedAt = nowIso();
      }
    }
  });

  // Presence scheduler: community members drift on/offline.
  setInterval(() => {
    mutate((d) => {
      const personas = d.users.filter((u) => u.simulated && u.status === "ACTIVE");
      const online = new Set(d.onlinePersonaIds);
      const target = 8 + Math.floor(Math.random() * 5);
      while (online.size > target) {
        const arr = [...online];
        online.delete(arr[Math.floor(Math.random() * arr.length)]);
      }
      while (online.size < target && online.size < personas.length) {
        const p = personas[Math.floor(Math.random() * personas.length)];
        online.add(p.id);
      }
      d.onlinePersonaIds = [...online];
    });
    emitEvent("presence:update", presenceSnapshot(), { broadcast: true });
  }, 15_000);
}

export function presenceSnapshot() {
  const d = getDB();
  const online = d.onlinePersonaIds
    .map((id) => userById(d, id))
    .filter((u) => !!u && u.status === "ACTIVE")
    .map((u) => toPublic(d, u));
  return { count: online.length + d.users.filter((u) => !u.simulated && u.status === "ACTIVE").length, online };
}

export { COUNTRIES };
