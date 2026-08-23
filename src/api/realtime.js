/* Socket layer — the realtime transport for the embedded engine.
   Contract is identical to a Socket.IO client: handshake auth via access token,
   event subscriptions, ack-based sends, connection-state lifecycle.
   In the Express deployment this module is replaced by socket.io-client. */

const handlers = new Map();
const serverHandlers = new Map();
const stateListeners = new Set();
const pendingTargeted = [];

let state = "disconnected";
let socketUserId = null;
let isParticipantOf = null;

function setState(s) {
  state = s;
  stateListeners.forEach((fn) => fn(s));
}

export function onSocketState(fn) {
  stateListeners.add(fn);
  fn(state);
  return () => stateListeners.delete(fn);
}

export function getSocketState() {
  return state;
}

/* Participant check is injected by the server engine at boot (avoids import cycle). */
export function setParticipantResolver(fn) {
  isParticipantOf = fn;
}

export async function connectSocket(token, verify) {
  setState("connecting");
  await sleepish(120 + Math.random() * 180);
  const claims = verify(token);
  if (!claims) {
    setState("disconnected");
    return { ok: false, error: "Socket handshake rejected: invalid access token" };
  }
  socketUserId = claims.sub;
  setState("connected");
  if (pendingTargeted.length) {
    const queued = pendingTargeted.splice(0, pendingTargeted.length);
    setTimeout(() => {
      for (const q of queued) emitEvent(q.event, q.payload, q.target);
    }, 60);
  }
  return { ok: true, userId: claims.sub };
}

export function disconnectSocket() {
  socketUserId = null;
  pendingTargeted.length = 0;
  setState("disconnected");
}

export function getSocketUserId() {
  return socketUserId;
}

/* Client → server with acknowledgement (throws ApiError-shaped errors). */
export async function socketSend(event, payload) {
  if (state !== "connected" || !socketUserId) {
    throw Object.assign(new Error("Realtime connection is not established"), { code: "SOCKET_DOWN", status: 0 });
  }
  const fn = serverHandlers.get(event);
  if (!fn) throw Object.assign(new Error(`Unknown socket event: ${event}`), { code: "UNKNOWN_EVENT", status: 400 });
  await sleepish(20 + Math.random() * 60);
  return await fn(payload, socketUserId);
}

export function registerServerHandler(event, fn) {
  serverHandlers.set(event, fn);
}

/* Server → client delivery with network jitter + authorization targeting. */
export function emitEvent(event, payload, target = { broadcast: true }) {
  if (state !== "connected" || !socketUserId) {
    if (target.broadcast) deliverLocal(event, payload); // presence etc. still flow pre-auth
    return;
  }
  let allowed = false;
  if (target.broadcast) allowed = true;
  else if (target.userId) allowed = target.userId === socketUserId;
  else if (target.conversationId && isParticipantOf) allowed = isParticipantOf(socketUserId, target.conversationId);
  if (!allowed) {
    if (!target.broadcast && pendingTargeted.length < 24) pendingTargeted.push({ event, payload, target });
    return;
  }
  setTimeout(() => deliverLocal(event, payload), 24 + Math.random() * 90);
}

function deliverLocal(event, payload) {
  const set = handlers.get(event);
  if (set) set.forEach((fn) => fn(payload));
  const star = handlers.get("*");
  if (star) star.forEach((fn) => fn({ event, payload }));
}

export function onEvent(event, fn) {
  if (!handlers.has(event)) handlers.set(event, new Set());
  handlers.get(event).add(fn);
  return () => handlers.get(event)?.delete(fn);
}

function sleepish(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
