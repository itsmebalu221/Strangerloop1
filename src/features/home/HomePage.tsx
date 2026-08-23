import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { PublicUser, RecentConversation, ConnectionView } from "../../lib/types";
import { useAuth } from "../../state/auth";
import { useToast } from "../../state/toast";
import { AppShell, usePresence } from "../../components/shell";
import { Avatar, Badge, Button, EmptyState, ErrorState, LoadingBlock, LiveDot } from "../../components/ui";
import { IconRadar, IconGear, IconUsers, IconChat, IconCheck, IconWarn, IconChevronRight, IconShield } from "../../components/icons";
import { timeAgo } from "../../lib/utils";

const STATE_TONE: Record<string, "green" | "gray" | "red" | "amber"> = {
  ACTIVE: "green",
  ENDED: "gray",
  BLOCKED: "red",
  REPORTED: "amber",
};

export default function HomePage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const { push } = useToast();
  const qc = useQueryClient();
  const presence = usePresence();

  const recents = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api.get<{ items: RecentConversation[] }>("/conversations?limit=5"),
  });
  const connections = useQuery({
    queryKey: ["connections"],
    queryFn: () => api.get<{ items: ConnectionView[] }>("/connections"),
  });

  const verify = useMutation({
    mutationFn: () => api.post<{ user: never }>("/auth/verify-email"),
    onSuccess: () => {
      refreshUser();
      push("success", "Email verified", "Your account is fully active.");
    },
  });

  if (!user) return null;

  const prefLabel = user.prefs.genders.includes("anyone") ? "Anyone" : user.prefs.genders.map((g) => g[0].toUpperCase() + g.slice(1)).join(" · ");
  const mutual = (connections.data?.items ?? []).filter((c) => c.status === "mutual").length;

  return (
    <AppShell>
      {!user.emailVerified && (
        <div className="anim-fade-up mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-amberx/50 bg-amberx/10 px-5 py-3.5">
          <IconWarn width={18} height={18} className="text-[#9a6414]" />
          <div className="flex-1 text-[13.5px] font-semibold text-[#8a5a12]">
            Your email isn't verified yet. (This build simulates delivery — one click does it.)
          </div>
          <Button size="sm" variant="primary" loading={verify.isPending} onClick={() => verify.mutate()}>
            <IconCheck width={14} height={14} /> Verify now
          </Button>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        {/* primary column */}
        <div>
          <div className="anim-fade-up">
            <div className="mono-label mb-3 flex items-center gap-2 text-em">
              <LiveDot /> queue open · {presence.data?.count ?? "…"} online
            </div>
            <h1 className="font-display text-[40px] font-bold leading-[1.03] tracking-tight sm:text-[52px]">
              Meet Someone <span className="text-em">New</span>
            </h1>
            <p className="mt-3 max-w-md text-[16px] text-moss">Find a stranger who shares your interests.</p>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              {user.interests.slice(0, 4).map((i) => (
                <span key={i.id} className="chip pointer-events-none !cursor-default">{i.name}</span>
              ))}
              {user.interests.length > 4 && <span className="mono-label text-[10px] text-sage">+{user.interests.length - 4} more</span>}
              <span className="mx-1 h-4 w-px bg-line" />
              {user.languages.slice(0, 2).map((l) => (
                <span key={l.id} className="chip pointer-events-none !cursor-default !border-tealx/40 !text-tealx">{l.name}</span>
              ))}
              <span className="mx-1 h-4 w-px bg-line" />
              <span className="chip pointer-events-none !cursor-default !border-amberx/50 !text-[#9a6414]">{prefLabel}</span>
              <span className="chip pointer-events-none !cursor-default !border-amberx/50 !text-[#9a6414]">{user.prefs.ageMin}–{user.prefs.ageMax === 60 ? "60+" : user.prefs.ageMax}</span>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button variant="lime" size="xl" onClick={() => navigate("/match")} className="group">
                <IconRadar width={22} height={22} className="transition-transform group-hover:rotate-45" />
                FIND SOMEONE
              </Button>
              <div className="flex flex-wrap gap-2">
                <Link to="/settings?tab=matching">
                  <Button variant="ghost"><IconGear width={15} height={15} /> Change preferences</Button>
                </Link>
                <Link to="/connections">
                  <Button variant="ghost"><IconUsers width={15} height={15} /> My Connections</Button>
                </Link>
                <Link to="/settings">
                  <Button variant="ghost">Settings</Button>
                </Link>
              </div>
            </div>
          </div>

          {/* recent conversations */}
          <div className="mt-12">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-[19px] font-bold">Recent conversations</h2>
              <span className="mono-label text-[9.5px] text-sage">latest {recents.data?.items.length ?? 0}</span>
            </div>
            {recents.isLoading && <LoadingBlock label="loading conversations" />}
            {recents.isError && <ErrorState message="Couldn't load your conversations." onRetry={() => recents.refetch()} />}
            {recents.data && recents.data.items.length === 0 && (
              <EmptyState
                icon={<IconChat width={24} height={24} />}
                title="No conversations yet"
                body="Hit FIND SOMEONE — your first stranger is one match away."
                action={<Button variant="lime" onClick={() => navigate("/match")}><IconRadar width={16} height={16} /> Start matching</Button>}
              />
            )}
            {recents.data && recents.data.items.length > 0 && (
              <div className="space-y-2">
                {recents.data.items.map((r, i) => (
                  <button
                    key={r.conversation.id}
                    onClick={() => navigate(`/chat/${r.conversation.id}`)}
                    className="anim-fade-up card group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition hover:-translate-y-0.5 hover:shadow-pop"
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <Avatar name={r.other.username} hue={r.other.avatarHue} size={42} online={r.conversation.state === "ACTIVE"} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-display text-[15px] font-bold">{r.other.username}</span>
                        <Badge tone={STATE_TONE[r.conversation.state]}>{r.conversation.state.toLowerCase()}</Badge>
                      </div>
                      <p className="truncate text-[12.5px] text-moss">
                        {r.lastMessage ? `${r.lastMessage.mine ? "You: " : ""}${r.lastMessage.content}` : "Say hi — the conversation is open."}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="mono-label text-[9.5px] text-sage">{timeAgo(r.lastMessage?.at ?? r.conversation.startedAt)}</span>
                      <IconChevronRight width={15} height={15} className="text-sage transition group-hover:translate-x-0.5 group-hover:text-em" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* side column */}
        <div className="space-y-5">
          <div className="card anim-fade-up p-5" style={{ animationDelay: "80ms" }}>
            <div className="mono-label mb-3 flex items-center gap-2 text-[9.5px] text-sage">
              <LiveDot /> online right now
            </div>
            {(presence.data?.online ?? []).slice(0, 7).map((p: PublicUser) => (
              <div key={p.id} className="flex items-center gap-3 border-b border-line/60 py-2.5 last:border-0">
                <Avatar name={p.username} hue={p.avatarHue} size={34} online />
                <div className="min-w-0">
                  <div className="text-[13.5px] font-bold leading-tight">{p.username}</div>
                  <div className="truncate text-[11.5px] text-moss">{p.interests.slice(0, 2).map((i) => i.name).join(" · ")}</div>
                </div>
                <span className="mono-label ml-auto text-[9px] text-sage">{p.ageRange}</span>
              </div>
            ))}
          </div>

          <div className="card anim-fade-up p-5" style={{ animationDelay: "140ms" }}>
            <div className="mono-label mb-3 text-[9.5px] text-sage">your frequency</div>
            <div className="grid grid-cols-3 divide-x divide-line text-center">
              <div>
                <div className="font-display text-[26px] font-bold text-em">{recents.data?.items.length ?? "—"}</div>
                <div className="mono-label mt-0.5 text-[8.5px] text-sage">chats</div>
              </div>
              <div>
                <div className="font-display text-[26px] font-bold text-em">{connections.data ? connections.data.items.length : "—"}</div>
                <div className="mono-label mt-0.5 text-[8.5px] text-sage">connections</div>
              </div>
              <div>
                <div className="font-display text-[26px] font-bold text-em">{mutual}</div>
                <div className="mono-label mt-0.5 text-[8.5px] text-sage">mutual</div>
              </div>
            </div>
          </div>

          <div className="anim-fade-up rounded-2xl bg-ink p-5 text-mist" style={{ animationDelay: "200ms" }}>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-lime/15 text-lime">
                <IconShield width={18} height={18} />
              </span>
              <div className="font-display text-[15px] font-bold">Stay on the frequency</div>
            </div>
            <p className="mt-2.5 text-[12.5px] leading-relaxed text-mist/65">
              Never share phone numbers, payment links or exact locations. Safety filters watch for it — and{" "}
              <button className="font-bold text-lime underline decoration-lime/40" onClick={() => navigate("/settings?tab=safety")}>here's what we do about it</button>.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
