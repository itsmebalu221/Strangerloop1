import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { onEvent, onSocketState, socketSend, getSocketState } from "../../api/realtime";
import type { SocketState } from "../../api/realtime";
import type { ConversationView, MessageRecord, MessagePayload, TypingPayload, ConvEndedPayload, ConnectionView, ReportCategory } from "../../lib/types";
import { ApiError } from "../../lib/errors";
import { useAuth } from "../../state/auth";
import { useToast } from "../../state/toast";
import { Avatar, Badge, Button, LiveDot, Modal, Spinner } from "../../components/ui";
import { Logo, IconNext, IconLink, IconFlag, IconBlock, IconSend, IconArrowLeft, IconCheck, IconTrash, IconWarn, IconChevronDown, IconSpark } from "../../components/icons";
import { cx, fmtTime } from "../../lib/utils";

const REPORT_CATEGORIES: Array<{ value: ReportCategory; label: string }> = [
  { value: "harassment", label: "Harassment" },
  { value: "spam", label: "Spam" },
  { value: "scam", label: "Scam" },
  { value: "hate", label: "Hate / abuse" },
  { value: "threats", label: "Threats" },
  { value: "sexual", label: "Sexual / explicit content" },
  { value: "impersonation", label: "Impersonation" },
  { value: "underage", label: "Underage safety concern" },
  { value: "other", label: "Other" },
];

const END_COPY: Record<string, string> = {
  NEXT: "You moved on to a new conversation.",
  STRANGER_NEXT: "Your partner moved on. The queue is yours.",
  BLOCK: "This conversation was blocked.",
  REPORT: "This conversation was reported and closed.",
  DISCONNECT: "The connection dropped and the conversation ended.",
};

export default function ChatPage() {
  const { conversationId = "" } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { push } = useToast();
  const qc = useQueryClient();

  const convQuery = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () => api.get<ConversationView>(`/conversations/${conversationId}`),
    retry: false,
  });
  const connections = useQuery({
    queryKey: ["connections"],
    queryFn: () => api.get<{ items: ConnectionView[] }>("/connections"),
  });

  const [messages, setMessages] = useState<MessageRecord[] | null>(null);
  const [otherTyping, setOtherTyping] = useState(false);
  const [socketState, setSocketState] = useState<SocketState>(getSocketState());
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [nextBusy, setNextBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [ended, setEnded] = useState<{ reason: string; byOther: boolean } | null>(null);
  const [connectState, setConnectState] = useState<"none" | "pending" | "mutual">("none");
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingAt = useRef(0);

  const view = convQuery.data;
  const other = view?.other;

  /* reset per-conversation state when NEXT (or a deep link) swaps the conversation */
  useEffect(() => {
    setMessages(null);
    setEnded(null);
    setDraft("");
    setOtherTyping(false);
    setConnectState("none");
  }, [conversationId]);

  /* initial message load (cursor pagination: newest page first) */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.get<{ items: MessageRecord[]; nextCursor: string | null }>(`/conversations/${conversationId}/messages?limit=80`);
        if (!cancelled) setMessages(r.items);
      } catch {
        if (!cancelled) setMessages([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  /* socket lifecycle + live events */
  useEffect(() => {
    const offs = [
      onSocketState(setSocketState),
      onEvent("message:new", (p) => {
        const { message } = p as MessagePayload;
        if (message.conversationId !== conversationId) return;
        setMessages((m) => (m && !m.some((x) => x.id === message.id) ? [...m, message] : m));
      }),
      onEvent("message:updated", (p) => {
        const { message } = p as MessagePayload;
        if (message.conversationId !== conversationId) return;
        setMessages((m) => (m ? m.map((x) => (x.id === message.id ? message : x)) : m));
      }),
      onEvent("typing", (p) => {
        const t = p as TypingPayload;
        if (t.conversationId !== conversationId || !other || t.userId !== other.id) return;
        setOtherTyping(t.isTyping);
      }),
      onEvent("conversation:ended", (p) => {
        const e = p as ConvEndedPayload;
        if (e.conversationId !== conversationId) return;
        setOtherTyping(false);
        setEnded({ reason: e.reason ?? "DISCONNECT", byOther: e.byUserId !== null && e.byUserId !== user?.id });
        qc.invalidateQueries({ queryKey: ["conversations"] });
      }),
      onEvent("connection:update", () => qc.invalidateQueries({ queryKey: ["connections"] })),
    ];
    return () => offs.forEach((off) => off());
  }, [conversationId, other?.id, user?.id, qc]);

  /* connection status for this stranger */
  useEffect(() => {
    if (!other || !connections.data) return;
    const row = connections.data.items.find((c) => c.other.id === other.id);
    setConnectState(row ? row.status : "none");
  }, [connections.data, other]);

  /* auto-scroll */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages?.length, otherTyping]);

  /* derive ended state from loaded conversation too */
  useEffect(() => {
    if (view && view.conversation.state !== "ACTIVE" && !ended) {
      setEnded({ reason: view.conversation.endReason ?? "DISCONNECT", byOther: false });
    }
  }, [view, ended]);

  const isActive = !ended && view?.conversation.state === "ACTIVE";

  const send = useCallback(async () => {
    const content = draft.trim();
    if (!content || sending || !isActive) return;
    setSending(true);
    setDraft("");
    try {
      await socketSend("message:send", { conversationId, content });
    } catch (e) {
      setDraft(content);
      const err = e as ApiError;
      if (err.code === "CONVERSATION_ENDED") setEnded({ reason: "DISCONNECT", byOther: true });
      push("error", err.code === "MESSAGE_BLOCKED" ? "Message blocked" : "Couldn't send", err.message);
    } finally {
      setSending(false);
    }
  }, [draft, sending, isActive, conversationId, push]);

  const onDraftChange = (v: string) => {
    setDraft(v);
    if (!isActive) return;
    const now = Date.now();
    if (v && now - lastTypingAt.current > 900) {
      lastTypingAt.current = now;
      socketSend("typing", { conversationId, isTyping: true }).catch(() => undefined);
    }
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      socketSend("typing", { conversationId, isTyping: false }).catch(() => undefined);
    }, 1500);
  };

  const doNext = async () => {
    if (nextBusy) return;
    setNextBusy(true);
    try {
      const r = await api.post<{ status: "matched"; view: ConversationView } | { status: "searching" }>(`/conversations/${conversationId}/next`);
      qc.invalidateQueries({ queryKey: ["conversations"] });
      if (r.status === "matched") {
        qc.setQueryData(["conversation", r.view.conversation.id], r.view);
        navigate(`/chat/${r.view.conversation.id}`, { replace: true });
      } else {
        navigate("/match", { replace: true });
      }
    } catch (e) {
      push("error", "NEXT failed", e instanceof ApiError ? e.message : "Try again");
    } finally {
      setNextBusy(false);
    }
  };

  const connectMut = useMutation({
    mutationFn: () => api.post<{ status: string }>(`/conversations/${conversationId}/connect`),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["connections"] });
      if (r.status === "mutual") {
        setConnectState("mutual");
        push("success", "It's mutual! 🤝", `You and ${other?.username} are now connections.`);
      } else if (r.status === "pending") {
        setConnectState("pending");
        push("info", "Connect request sent", `${other?.username} hasn't tapped CONNECT yet — we'll notify you.`);
      } else {
        push("info", "Already requested", "You've already sent a connect request.");
      }
    },
    onError: (e) => push("error", "Couldn't connect", e instanceof ApiError ? e.message : "Try again"),
  });

  const blockMut = useMutation({
    mutationFn: () => api.post("/blocks", { userId: other?.id }),
    onSuccess: () => {
      setBlockOpen(false);
      qc.invalidateQueries({ queryKey: ["blocks"] });
      push("warn", `${other?.username} blocked`, "They can never match you again. Finding someone new…");
      navigate("/match", { replace: true });
    },
    onError: (e) => push("error", "Couldn't block", e instanceof ApiError ? e.message : "Try again"),
  });

  /* report form state */
  const [category, setCategory] = useState<ReportCategory>("harassment");
  const [details, setDetails] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(true);
  const reportMut = useMutation({
    mutationFn: () => api.post("/reports", { reportedId: other?.id, conversationId, category, details: details || undefined, alsoBlock }),
    onSuccess: () => {
      setReportOpen(false);
      push("success", "Report filed", "Our moderation team will review it. Thanks for keeping the frequency clean.");
      navigate("/home", { replace: true });
    },
    onError: (e) => push("error", "Couldn't file report", e instanceof ApiError ? e.message : "Try again"),
  });

  const deleteMut = useMutation({
    mutationFn: (messageId: string) => api.del(`/conversations/${conversationId}/messages/${messageId}`),
    onError: (e) => push("error", "Couldn't delete", e instanceof ApiError ? e.message : "Messages can be deleted within 2 minutes"),
  });

  const shared = view?.shared ?? [];

  if (convQuery.isLoading || (!messages && !convQuery.isError)) {
    return (
      <div className="chat-ambient flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-mist">
          <Logo width={34} height={34} className="text-lime" />
          <div className="flex items-center gap-3"><Spinner className="h-5 w-5 text-lime" /><span className="mono-label text-[10.5px]">opening conversation…</span></div>
        </div>
      </div>
    );
  }

  if (convQuery.isError || !view || !other) {
    return (
      <div className="chat-ambient flex min-h-screen items-center justify-center px-4">
        <div className="card max-w-sm p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-coral/12 text-coral"><IconWarn width={22} height={22} /></div>
          <h1 className="font-display text-[20px] font-bold">Conversation unavailable</h1>
          <p className="mt-1.5 text-[13.5px] text-moss">You're not a participant of this conversation, or it no longer exists.</p>
          <Link to="/home"><Button variant="primary" className="mt-5 w-full"><IconArrowLeft width={15} height={15} /> Back to home</Button></Link>
        </div>
      </div>
    );
  }

  const onlineOk = socketState === "connected";

  return (
    <div className="chat-ambient noise relative flex h-screen flex-col overflow-hidden">
      {/* header */}
      <header className="relative z-20 border-b border-white/10 bg-deep/70 backdrop-blur-md">
        <div className="mx-auto flex h-[68px] max-w-3xl items-center gap-3 px-4">
          <Link to="/home" className="focus-ring rounded-full border border-white/12 p-2 text-mist transition hover:border-lime/50 hover:text-lime">
            <IconArrowLeft width={17} height={17} />
          </Link>
          <Avatar name={other.username} hue={other.avatarHue} size={40} online={isActive} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-display text-[16.5px] font-bold text-mist">{other.username}</span>
              <span className="mono-label hidden text-[9px] text-mist/45 sm:block">{other.country} · {other.ageRange}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 overflow-hidden">
              {shared.length > 0 ? (
                shared.slice(0, 3).map((i) => (
                  <span key={i.id} className="flex shrink-0 items-center gap-1 rounded-full border border-lime/25 bg-lime/8 px-2 py-[2px] text-[10px] font-bold text-lime">
                    <IconSpark width={9} height={9} /> {i.name}
                  </span>
                ))
              ) : (
                <span className="mono-label text-[9px] text-mist/40">general conversation</span>
              )}
            </div>
          </div>

          <div className={cx("mr-1 hidden items-center gap-1.5 sm:flex")}>
            <span className={cx("h-2 w-2 rounded-full", onlineOk ? "bg-em" : "bg-amberx anim-soft-pulse")} />
            <span className="mono-label text-[9px] text-mist/50">{onlineOk ? "live" : socketState === "connecting" || socketState === "reconnecting" ? "reconnecting" : "offline"}</span>
          </div>

          {!ended && isActive && (
            <div className="relative">
              <button onClick={() => setMenuOpen((o) => !o)} className="focus-ring flex items-center gap-1 rounded-full border border-white/12 px-3 py-2 text-[12.5px] font-bold text-mist transition hover:border-coral/60 hover:text-coral">
                Safety <IconChevronDown width={13} height={13} />
              </button>
              {menuOpen && (
                <div className="anim-pop absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-xl border border-line bg-paper shadow-pop">
                  <button onClick={() => { setMenuOpen(false); setReportOpen(true); }} className="flex w-full items-center gap-2.5 px-4 py-3 text-[13.5px] font-bold text-ink hover:bg-mist">
                    <IconFlag width={15} height={15} className="text-amberx" /> Report {other.username}
                  </button>
                  <button onClick={() => { setMenuOpen(false); setBlockOpen(true); }} className="flex w-full items-center gap-2.5 border-t border-line px-4 py-3 text-[13.5px] font-bold text-coral hover:bg-mist">
                    <IconBlock width={15} height={15} /> Block & end chat
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* messages */}
      <div className="relative z-10 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6">
          {/* starter card */}
          {shared.length > 0 && (
            <div className="anim-fade-up mx-auto mb-6 max-w-md rounded-2xl border border-lime/25 bg-lime/6 px-5 py-4 text-center">
              <div className="mono-label text-[9.5px] text-lime">you both like</div>
              <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                {shared.map((i) => (
                  <span key={i.id} className="rounded-full bg-lime/15 px-3 py-1 text-[12.5px] font-bold text-lime">{i.name}</span>
                ))}
              </div>
              {view.starter && messages && messages.length < 3 && isActive && (
                <button
                  onClick={() => onDraftChange(view.starter!)}
                  className="mt-3 w-full rounded-xl border border-lime/30 bg-deep/50 px-4 py-2.5 text-[13.5px] font-semibold text-mist transition hover:border-lime hover:text-lime"
                >
                  💬 {view.starter}
                </button>
              )}
            </div>
          )}
          {messages && messages.length === 0 && isActive && (
            <p className="anim-fade-up mb-4 text-center text-[13px] text-mist/45">
              You're connected — say hi. Shared interests above make decent openers.
            </p>
          )}

          <div className="space-y-2.5">
            {(messages ?? []).map((m) => {
              if (m.senderId === "system") {
                return (
                  <div key={m.id} className="anim-fade-up mx-auto max-w-md rounded-xl border border-amberx/40 bg-amberx/10 px-4 py-2.5 text-center text-[12px] font-semibold text-amberx">
                    {m.content}
                  </div>
                );
              }
              const mine = m.senderId === user?.id;
              const fresh = Date.now() - new Date(m.createdAt).getTime() < 120_000;
              return (
                <div key={m.id} className={cx("anim-fade-up group flex items-end gap-2", mine ? "justify-end" : "justify-start")}>
                  {!mine && <Avatar name={other.username} hue={other.avatarHue} size={26} />}
                  <div className={cx("relative max-w-[78%] rounded-2xl px-4 py-2.5 text-[14.5px] leading-relaxed", mine ? "rounded-br-md bg-lime text-ink" : "rounded-bl-md border border-white/10 bg-pine text-mist")}>
                    {m.deletedAt ? (
                      <span className={cx("italic", mine ? "text-ink/50" : "text-mist/45")}>message deleted</span>
                    ) : (
                      m.content
                    )}
                    <div className={cx("mt-1 flex items-center gap-2 text-[9.5px]", mine ? "justify-end text-ink/50" : "text-mist/40")}>
                      <span className="font-mono">{fmtTime(m.createdAt)}</span>
                      {mine && !m.deletedAt && fresh && (
                        <button onClick={() => deleteMut.mutate(m.id)} className="opacity-0 transition group-hover:opacity-100 hover:text-coral" title="Delete message">
                          <IconTrash width={11} height={11} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {otherTyping && (
              <div className="anim-fade-up flex items-end gap-2">
                <Avatar name={other.username} hue={other.avatarHue} size={26} />
                <div className="rounded-2xl rounded-bl-md border border-white/10 bg-pine px-4 py-3.5">
                  <span className="flex gap-1.5">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="typing-dot h-1.5 w-1.5 rounded-full bg-lime" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </span>
                </div>
              </div>
            )}
          </div>
          <div ref={bottomRef} />
        </div>
      </div>

      {/* ended banner OR composer */}
      {ended ? (
        <div className="relative z-20 border-t border-white/10 bg-deep/80 backdrop-blur-md">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-5">
            <div>
              <div className="font-display text-[16px] font-bold text-mist">{END_COPY[ended.reason] ?? "Conversation ended."}</div>
              <div className="mono-label mt-1 text-[9.5px] text-mist/45">state: {ended.reason === "BLOCK" ? "BLOCKED" : ended.reason === "REPORT" ? "REPORTED" : "ENDED"}</div>
            </div>
            <div className="flex gap-2">
              <Button variant="lime" onClick={() => navigate("/match")} loading={nextBusy}>
                <IconNext width={16} height={16} /> Find someone new
              </Button>
              <Button variant="outline" onClick={() => navigate("/home")}>Home</Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative z-20 border-t border-white/10 bg-deep/80 backdrop-blur-md">
          <div className="mx-auto max-w-3xl px-4 py-3.5">
            <div className="flex items-center gap-2">
              <Button variant="lime" size="lg" onClick={doNext} loading={nextBusy} className="shrink-0 !rounded-2xl" title="End this chat and instantly match with someone new">
                <IconNext width={18} height={18} /> NEXT
              </Button>
              <Button
                variant={connectState === "mutual" ? "darkghost" : "outline"}
                size="lg"
                className="shrink-0 !rounded-2xl"
                onClick={() => connectMut.mutate()}
                disabled={connectState !== "none" || connectMut.isPending}
                title="Connect if they tap CONNECT too — mutual only"
              >
                {connectState === "mutual" ? <><IconCheck width={16} height={16} className="text-lime" /> Connected</> : connectState === "pending" ? "Requested…" : <><IconLink width={16} height={16} /> CONNECT</>}
              </Button>
              <div className="relative flex-1">
                <input
                  className="input input-dark !rounded-2xl pr-24"
                  placeholder="Type a message…"
                  value={draft}
                  maxLength={1000}
                  onChange={(e) => onDraftChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />
                <button
                  onClick={() => void send()}
                  disabled={!draft.trim() || sending}
                  className="focus-ring absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl bg-lime text-ink transition hover:bg-[#c8e53f] disabled:opacity-35"
                >
                  {sending ? <Spinner className="h-4 w-4" /> : <IconSend width={17} height={17} />}
                </button>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between px-1">
              <span className="mono-label text-[8.5px] text-mist/35">enter to send · be kind · safety filters active</span>
              <span className={cx("mono-label text-[8.5px]", draft.length > 900 ? "text-amberx" : "text-mist/35")}>{draft.length}/1000</span>
            </div>
          </div>
        </div>
      )}

      {/* report modal */}
      <Modal open={reportOpen} onClose={() => setReportOpen(false)} title={`Report ${other.username}`}>
        <div className="space-y-4">
          <p className="text-[13px] text-moss">Reports are reviewed by moderators. The conversation ends immediately and recent messages are attached as context.</p>
          <div>
            <span className="mono-label mb-1.5 block text-moss">Category</span>
            <div className="grid grid-cols-2 gap-1.5">
              {REPORT_CATEGORIES.map((c) => (
                <button key={c.value} onClick={() => setCategory(c.value)} className={cx("rounded-lg border px-3 py-2 text-left text-[12.5px] font-bold transition", category === c.value ? "border-coral bg-coral/10 text-coral" : "border-line bg-paper text-moss hover:border-coral/50")}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="mono-label mb-1.5 block text-moss">Details (optional)</span>
            <textarea className="input min-h-[70px] resize-none" maxLength={500} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="What happened?" />
          </div>
          <label className="flex cursor-pointer items-center gap-2.5 text-[13.5px] font-semibold">
            <input type="checkbox" checked={alsoBlock} onChange={(e) => setAlsoBlock(e.target.checked)} className="h-4 w-4 accent-[#e5484d]" />
            Also block this member
          </label>
          <Button variant="danger" size="lg" className="w-full" loading={reportMut.isPending} onClick={() => reportMut.mutate()}>
            <IconFlag width={16} height={16} /> Submit report
          </Button>
        </div>
      </Modal>

      {/* block modal */}
      <Modal open={blockOpen} onClose={() => setBlockOpen(false)} title={`Block ${other.username}?`}>
        <div className="space-y-4">
          <p className="text-[13.5px] leading-relaxed text-moss">
            Blocking ends this conversation now and prevents {other.username} from ever matching you again. You can unblock from <strong>Settings → Privacy</strong>.
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setBlockOpen(false)}>Cancel</Button>
            <Button variant="danger" className="flex-1" loading={blockMut.isPending} onClick={() => blockMut.mutate()}>
              <IconBlock width={15} height={15} /> Block
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export { LiveDot, Badge };
