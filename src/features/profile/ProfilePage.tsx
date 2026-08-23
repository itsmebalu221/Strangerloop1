import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { ConnectionView, RecentConversation } from "../../lib/types";
import { useAuth } from "../../state/auth";
import { AppShell } from "../../components/shell";
import { Avatar, Badge, Button, Reveal } from "../../components/ui";
import { IconGear, IconEye, IconShield, IconSpark, IconGlobe, IconChat } from "../../components/icons";

export default function ProfilePage() {
  const { user } = useAuth();
  const connections = useQuery({ queryKey: ["connections"], queryFn: () => api.get<{ items: ConnectionView[] }>("/connections") });
  const recents = useQuery({ queryKey: ["conversations"], queryFn: () => api.get<{ items: RecentConversation[] }>("/conversations?limit=50") });

  if (!user) return null;

  const chatCount = recents.data?.items.length ?? 0;
  const connCount = connections.data?.items.length ?? 0;

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <div className="anim-fade-up flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="mono-label mb-2 text-em">public identity</div>
            <h1 className="font-display text-[36px] font-bold tracking-tight">Your Profile</h1>
          </div>
          <Link to="/settings">
            <Button variant="ghost"><IconGear width={15} height={15} /> Edit in Settings</Button>
          </Link>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-[300px_1fr]">
          <Reveal>
            <div className="card overflow-hidden">
              <div className="relative h-24 bg-ink">
                <div className="dotgrid absolute inset-0 opacity-20" />
                <div className="absolute -bottom-10 left-5">
                  <Avatar name={user.username} hue={user.avatarHue} size={84} ring />
                </div>
              </div>
              <div className="px-5 pb-5 pt-12">
                <div className="font-display text-[24px] font-bold">{user.username}</div>
                <div className="mono-label mt-1 text-[9.5px] text-sage">{user.ageRange} · {user.country}</div>
                <p className="mt-3 min-h-[36px] text-[13.5px] leading-relaxed text-moss">{user.bio ?? "No bio yet — strangers only see your interests until you add one."}</p>
                <div className="mt-4 grid grid-cols-2 divide-x divide-line border-t border-line pt-3 text-center">
                  <div>
                    <div className="font-display text-[22px] font-bold text-em">{chatCount}</div>
                    <div className="mono-label text-[8.5px] text-sage">conversations</div>
                  </div>
                  <div>
                    <div className="font-display text-[22px] font-bold text-em">{connCount}</div>
                    <div className="mono-label text-[8.5px] text-sage">connections</div>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>

          <div className="space-y-5">
            <Reveal delay={80}>
              <div className="card p-5">
                <div className="mono-label mb-3 flex items-center gap-2 text-[9.5px] text-sage">
                  <IconEye width={13} height={13} /> what strangers see
                </div>
                <div className="mb-4">
                  <div className="mono-label mb-1.5 text-[9px] text-em">interests</div>
                  <div className="flex flex-wrap gap-1.5">
                    {user.interests.map((i) => (
                      <span key={i.id} className="chip chip-on !cursor-default">
                        <IconSpark width={11} height={11} /> {i.name}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="mono-label mb-1.5 text-[9px] text-tealx">languages</div>
                    <div className="flex flex-wrap gap-1.5">
                      {user.languages.map((l) => (
                        <span key={l.id} className="rounded-full border border-tealx/40 bg-tealx/8 px-2.5 py-1 text-[12px] font-bold text-tealx">{l.name}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="mono-label mb-1.5 text-[9px] text-[#9a6414]">conversation types</div>
                    <div className="flex flex-wrap gap-1.5">
                      {user.convTypes.map((c) => (
                        <span key={c.id} className="rounded-full border border-amberx/50 bg-amberx/10 px-2.5 py-1 text-[12px] font-bold text-[#9a6414]">{c.name}</span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2 border-t border-line pt-3.5 text-[12.5px] font-semibold text-moss">
                  <IconGlobe width={14} height={14} className="text-em" /> Age shown as a range ({user.ageRange}) — your birthday is never public.
                </div>
              </div>
            </Reveal>

            <Reveal delay={140}>
              <div className="rounded-2xl bg-ink p-5 text-mist">
                <div className="mono-label mb-3 flex items-center gap-2 text-[9.5px] text-lime">
                  <IconShield width={13} height={13} /> never shown to strangers
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {["Email", "Exact birthday", "Exact location", "IP address", "Session data", "Auth secrets"].map((x) => (
                    <div key={x} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[12px] font-bold text-mist/80">
                      <span className="mr-1.5 text-coral">✕</span>{x}
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[12px] leading-relaxed text-mist/55">
                  Public identity is username + age range + interests. Matching runs on internal signals only.
                </p>
              </div>
            </Reveal>

            <Reveal delay={200}>
              <div className="card flex items-center gap-3 p-4">
                <IconChat width={18} height={18} className="text-em" />
                <p className="text-[13px] font-semibold text-moss">
                  Want a different signal? Retune interests and preferences anytime —{" "}
                  <Link to="/settings?tab=matching" className="text-em underline decoration-em/40">matching settings</Link>.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
