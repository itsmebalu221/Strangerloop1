# Wavelength — Interest-Based Stranger Chat

A complete V1 of an interest-based random stranger chat platform: real matching engine, real-time chat, safety & moderation, RBAC admin console — running on an **embedded server engine** inside this static build.

## ⚠️ What is real here, and what is not

This workspace ships a static `dist/index.html` — there is **no Node process, MySQL server, or mail provider available in this environment**. Per the project's own engineering rules, nothing is faked silently:

| Concern | Status in this build |
|---|---|
| Layered backend (`routes → middleware → controllers → services → repositories → DB`) | ✅ Implemented as `src/server/*` + `src/api/client.ts` (the REST seam). Same contract, same layering as the Express target. |
| Passwords | ✅ Salted + stretched hashes (Argon2id stand-in). Never stored plaintext, never returned. |
| Access / refresh tokens | ✅ Short-lived signed access tokens (15 min) + rotating refresh tokens (30 d) with **family reuse detection**, revocable sessions, logout-all. Demo-grade signature — the Express deployment swaps in `jsonwebtoken` with env secrets. |
| Database | ⚠️ Repository layer persists to `localStorage` instead of MySQL/Prisma (documented swap point in `src/server/db.ts`). Migrations/seed scripts cannot run here. |
| Socket.IO | ⚠️ `src/api/realtime.ts` implements the identical contract (handshake auth, rooms, acks, presence) in-process; swap for `socket.io-client`. |
| Matching, chat, NEXT, connect, block, report, moderation, admin RBAC, analytics, audit | ✅ Fully implemented business logic — concurrency-safe queue entries, cursor pagination, throttling, idempotent operations, transactions-as-single-mutations. |
| Email delivery (verification, password reset) | ⚠️ Simulated — verification is one-click; reset issues a real one-time token surfaced in the UI (dev mode). |
| Jest/Supertest, Docker, OpenAPI, ESLint/Prettier configs | ❌ Not implemented in this environment — cannot execute here. Contract + mapping documented below. |

**Demo accounts** (dev seeds, shown on the login screen): `aarav@demo.dev / Aarav#1234` (member) · `admin@demo.dev / Admin#2026` (admin). Online "community members" are engine personas so matching/chat are exercisable end-to-end; they are flagged `simulated` in the data layer and as "engine" in the admin UI.

## Architecture map → Express deployment

```
src/api/client.ts        →  Express routes + controllers (same paths /api/v1/*, same envelopes)
src/api/realtime.ts      →  socket.io-client / Socket.IO server layer
src/server/auth.service  →  AuthService (JWT from env, Argon2id, nodemailer for reset/verify)
src/server/matching.*    →  MatchingService + MatchingScoreService + QueueService (SELECT … FOR UPDATE)
src/server/chat.service  →  ChatService + socket handlers (membership checks per event)
src/server/safety.*      →  SafetyService + ModerationService
src/server/admin.service →  AdminService + RBAC permission tables + audit_logs
src/server/profile.*     →  ProfileService (retention-policy deletion)
src/server/db.ts         →  Prisma repositories + migrations; localStorage adapter → MySQL
```

Every screen talks only to `api.*` / `socketSend` — the swap is contained to those two modules.

## API contract (served by the embedded engine today)

`POST /auth/register|login|refresh|logout|logout-all|verify-email|forgot-password|reset-password` · `GET /auth/me` · `GET/PATCH /profile` · `GET/PATCH /preferences` · `DELETE /account` · `POST /matching/search|cancel` · `GET /matching/status` · `GET /conversations` · `GET /conversations/:id(/messages)` · `POST /conversations/:id/next|connect` · `POST /blocks` · `GET /blocks` · `DELETE /blocks/:userId` · `POST /reports` · `GET /connections` · `DELETE /connections/:userId` · `GET /notifications` · `GET /presence` · `GET /admin/overview|analytics|users|reports|audit` · socket events: `message:send`, `typing`, `message:new`, `conversation:ended`, `match:found`, `queue:status`, `presence:update`, `notification:new`, `connection:update`.

Envelope: `{ success, data, meta, requestId }` / `{ success:false, error:{code,message}, requestId }` · rate-limited buckets per endpoint · proper 4xx/5xx codes.

## Try it

1. Log in with a dev seed (or register — 18+ age gate enforced server-side).
2. **FIND SOMEONE** → watch fallback levels 1→5 → matched by score → chat.
3. Send messages (try pasting a `gift card` pitch or a URL — moderation reacts), type to see indicators, delete a message within 2 min.
4. **NEXT** (near-instant rematch), **CONNECT** (mutual-only), **BLOCK**, **REPORT** (try "Threats" — auto-suspension + escalation).
5. Log in as admin → overview metrics, manage users (warn/suspend/ban/restore), resolve reports, audit log.
6. Settings → Privacy: revoke sessions, log out everywhere, delete account (type-to-confirm, anonymized).

## Business rules enforced by the engine

No self-matching · blocked pairs never match · banned/suspended/deleted accounts excluded everywhere · one WAITING queue entry per user (idempotent join) · match + conversation created atomically · messages authorized per-conversation, throttled (≤7/10 s), ≤1000 chars, sanitized · connections are mutual-only and expose zero contact data · every admin action audit-logged · account deletion anonymizes identity and destroys auth material while retaining reports per policy.
