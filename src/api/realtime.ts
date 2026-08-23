/* Socket layer — the realtime transport for the embedded engine.
   Contract is identical to a Socket.IO client: handshake auth via access token,
   event subscriptions, ack-based sends, connection-state lifecycle.
   In the Express deployment this module is replaced by socket.io-client. */

export type SocketState = "disconnected" | "connecting" | "connected" | "reconnecting";

export interface EmitTarget {
  broadcast?: boolean;
  userId?: string;
  conversationId?: string;
}

type Handler = (payload: unknown) => void;
type ServerHandler = (payload: never, userId: string) => Promise<unknown> | unknown;

const handlers = new Map<string, Set<Handler>>();
const serverHandlers = new Map<string, ServerHandler>();
const stateListeners = new Set<(s: SocketState) => void>();

let state: SocketState = "disconnected";
let socketUserId: string | null = null;
let isParticipantOf: ((userId: string, conversationId: string) => boolean) | null = null;

/* Targeted events emitted before the handshake finishes are buffered and
   flushed on connect (mirrors Socket.IO's reconnect delivery semantics). */
const pendingTargeted: Array<{ event: string; payload: unknown; target: EmitTarget }> = [];

function setState(s: SocketState): void {
  state = s;
  stateListeners.forEach((fn) => fn(s));
}

export function onSocketState(fn: (s: SocketState) => void): () => void {
  stateListeners.add(fn);
  fn(state);
  return () => stateListeners.delete(fn);
}

export function getSocketState(): SocketState {
  return state;
}

/* Participant check is injected by the server engine at boot (avoids import cycle). */
export function setParticipantResolver(fn: (userId: string, conversationId: string) => boolean): void {
  isParticipantOf = fn;
}

export async function connectSocket(
  token: string,
  verify: (token: string) => { sub: string } | null
): Promise<{ ok: boolean; userId?: string; error?: string }> {
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

export function disconnectSocket(): void {
  socketUserId = null;
  pendingTargeted.length = 0;
  setState("disconnected");
}

export function getSocketUserId(): string | null {
  return socketUserId;
}

/* Client → server with acknowledgement (throws ApiError-shaped errors). */
export async function socketSend<T = unknown>(event: string, payload: unknown): Promise<T> {
  if (state !== "connected" || !socketUserId) {
    throw Object.assign(new Error("Realtime connection is not established"), { code: "SOCKET_DOWN", status: 0 });
  }
  const fn = serverHandlers.get(event);
  if (!fn) throw Object.assign(new Error(`Unknown socket event: ${event}`), { code: "UNKNOWN_EVENT", status: 400 });
  await sleepish(20 + Math.random() * 60);
  return (await fn(payload as never, socketUserId)) as T;
}

export function registerServerHandler(event: string, fn: ServerHandler): void {
  serverHandlers.set(event, fn);
}

/* Server → client delivery with network jitter + authorization targeting. */
export function emitEvent(event: string, payload: unknown, target: EmitTarget = { broadcast: true }): void {
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

function deliverLocal(event: string, payload: unknown): void {
  const set = handlers.get(event);
  if (set) set.forEach((fn) => fn(payload));
  const star = handlers.get("*");
  if (star) star.forEach((fn) => fn({ event, payload }));
}

export function onEvent(event: string, fn: Handler): () => void {
  if (!handlers.has(event)) handlers.set(event, new Set());
  handlers.get(event)!.add(fn);
  return () => handlers.get(event)?.delete(fn);
}

function sleepish(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
