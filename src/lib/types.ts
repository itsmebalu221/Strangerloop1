/* Shared domain types — mirrored 1:1 by the embedded server engine and the REST/Socket contract. */

export type Gender = "male" | "female" | "nonbinary" | "undisclosed";
export type GenderPref = Gender | "anyone";
export type UserStatus = "ACTIVE" | "PENDING_VERIFICATION" | "SUSPENDED" | "BANNED" | "DELETED";
export type Role = "user" | "admin";
export type ConvState = "ACTIVE" | "ENDED" | "BLOCKED" | "REPORTED";
export type EndReason = "NEXT" | "STRANGER_NEXT" | "BLOCK" | "REPORT" | "DISCONNECT" | null;
export type QueueStatus = "WAITING" | "MATCHED" | "CANCELLED" | "EXPIRED";
export type Risk = "LOW" | "SUSPICIOUS" | "HIGH" | "SEVERE";
export type ModActionKind =
  | "ALLOW" | "WARN" | "FLAG" | "BLOCK_CONTENT" | "RESTRICT" | "SUSPEND" | "BAN" | "ESCALATE";
export type ReportCategory =
  | "harassment" | "spam" | "scam" | "hate" | "threats" | "sexual" | "impersonation" | "underage" | "other";
export type ReportStatus = "open" | "dismissed" | "actioned" | "escalated";
export type AdminAction = "dismiss" | "warn" | "suspend" | "ban" | "restore" | "escalate";

export interface Interest { id: string; name: string; category: string }
export interface Language { id: string; code: string; name: string }
export interface ConvType { id: string; name: string }

export interface Preferences {
  genders: GenderPref[];
  ageMin: number;
  ageMax: number;
  languageIds: string[];
  convTypeIds: string[];
}

export interface PublicUser {
  id: string;
  username: string;
  ageRange: string;
  gender: Gender;
  country: string;
  bio: string | null;
  avatarHue: number;
  interests: Interest[];
  languages: Language[];
  convTypes: ConvType[];
  simulated?: boolean;
}

export interface SelfUser extends PublicUser {
  email: string;
  emailVerified: boolean;
  role: Role;
  status: UserStatus;
  prefs: Preferences;
  warnCount: number;
  createdAt: string;
}

export interface UserRecord {
  id: string;
  email: string;
  username: string;
  usernameLower: string;
  passHash: string;
  salt: string;
  role: Role;
  status: UserStatus;
  emailVerified: boolean;
  createdAt: string;
  deletedAt: string | null;
  gender: Gender;
  dob: string;
  country: string;
  bio: string | null;
  avatarHue: number;
  languageIds: string[];
  interestIds: string[];
  convTypeIds: string[];
  prefs: Preferences;
  suspendedUntil: string | null;
  warnCount: number;
  lastActiveAt: string;
  simulated?: boolean;
}

export interface SessionRecord {
  id: string;
  userId: string;
  device: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  sessionId: string;
  familyId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  replacedBy: string | null;
}

export interface QueueEntry {
  id: string;
  userId: string;
  status: QueueStatus;
  level: number;
  joinedAt: string;
  resolvedAt: string | null;
}

export interface MatchRecord {
  id: string;
  seekerId: string;
  candidateId: string;
  score: number;
  level: number;
  createdAt: string;
}

export interface ConversationRecord {
  id: string;
  participantIds: [string, string];
  state: ConvState;
  endReason: EndReason;
  startedAt: string;
  endedAt: string | null;
  lastMessageAt: string | null;
  sharedInterestIds: string[];
  starterPrompt: string | null;
}

export interface MessageRecord {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
  deletedAt: string | null;
}

export interface ConnectionRecord {
  id: string;
  aId: string;
  bId: string;
  status: "pending" | "mutual";
  requestedBy: string;
  createdAt: string;
  acceptedAt: string | null;
}

export interface BlockRecord { id: string; blockerId: string; blockedId: string; createdAt: string }

export interface ReportRecord {
  id: string;
  reporterId: string;
  reportedId: string;
  conversationId: string | null;
  category: ReportCategory;
  details: string | null;
  risk: Risk;
  autoAction: ModActionKind;
  status: ReportStatus;
  createdAt: string;
  adminNote: string | null;
  actedBy: string | null;
}

export interface ModerationRecord {
  id: string;
  userId: string;
  actorId: string;
  action: ModActionKind;
  reason: string;
  risk: Risk;
  createdAt: string;
}

export interface NotificationRecord {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export interface AuditRecord {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  target: string | null;
  details: string | null;
  createdAt: string;
}

export interface AnalyticsDay {
  date: string;
  signups: number;
  searches: number;
  matches: number;
  conversations: number;
  reports: number;
}

export interface ConversationView {
  conversation: ConversationRecord;
  other: PublicUser;
  shared: Interest[];
  starter: string | null;
}

export interface RecentConversation extends ConversationView {
  lastMessage: { content: string; mine: boolean; at: string } | null;
}

/* ---- realtime payloads ---- */
export interface MatchFoundPayload { conversation: ConversationRecord; other: PublicUser; shared: Interest[] }
export interface QueueStatusPayload { status: "searching" | "matched" | "cancelled" | "expired"; level?: number }
export interface MessagePayload { message: MessageRecord }
export interface TypingPayload { conversationId: string; userId: string; isTyping: boolean }
export interface ConvEndedPayload { conversationId: string; reason: EndReason; byUserId: string | null }
export interface PresencePayload { count: number; online: PublicUser[] }

export interface ReferenceData {
  interests: Interest[];
  languages: Language[];
  conversationTypes: ConvType[];
}

export interface ConnectionView {
  connectionId: string;
  other: PublicUser;
  status: "pending" | "mutual";
  sharedInterests: string[];
  createdAt: string;
  acceptedAt: string | null;
  initiatedByMe: boolean;
}

export interface DB {
  v: number;
  interests: Interest[];
  languages: Language[];
  conversationTypes: ConvType[];
  users: UserRecord[];
  sessions: SessionRecord[];
  refreshTokens: RefreshTokenRecord[];
  queue: QueueEntry[];
  matches: MatchRecord[];
  conversations: ConversationRecord[];
  messages: MessageRecord[];
  connections: ConnectionRecord[];
  blocks: BlockRecord[];
  reports: ReportRecord[];
  moderation: ModerationRecord[];
  notifications: NotificationRecord[];
  audit: AuditRecord[];
  analyticsDays: AnalyticsDay[];
  passwordResetTokens: { tokenHash: string; userId: string; expiresAt: string; usedAt: string | null }[];
  onlinePersonaIds: string[];
}
