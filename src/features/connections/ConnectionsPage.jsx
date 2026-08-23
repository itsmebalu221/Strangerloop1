import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { ApiError } from "../../lib/errors";
import { onEvent } from "../../api/realtime";
import { useToast } from "../../state/toast";
import { AppShell } from "../../components/shell";
import { Avatar, Badge, Button, EmptyState, ErrorState, LoadingBlock, Modal } from "../../components/ui";
import { IconUsers, IconLink, IconRadar, IconTrash, IconClock, IconSpark } from "../../components/icons";
import { timeAgo } from "../../lib/utils";

export default function ConnectionsPage() {
  const qc = useQueryClient();
  const { push } = useToast();
  const [toRemove, setToRemove] = useState(null);

  useEffect(() => onEvent("connection:update", () => qc.invalidateQueries({ queryKey: ["connections"] })), [qc]);

  const q = useQuery({
    queryKey: ["connections"],
    queryFn: () => api.get("/connections"),
  });

  const removeMut = useMutation({
    mutationFn: (otherId) => api.del(`/connections/${otherId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["connections"] });
      setToRemove(null);
      push("info", "Connection removed", "They won't be notified.");
    },
    onError: (e) => push("error", "Couldn't remove", e instanceof ApiError ? e.message : "Try again"),
  });

  const items = q.data?.items ?? [];
  const pending = items.filter((c) => c.status === "pending");
  const mutual = items.filter((c) => c.status === "mutual");

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <div className="anim-fade-up flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="mono-label mb-2 text-em">your people</div>
            <h1 className="font-display text-[36px] font-bold tracking-tight">My Connections</h1>
          </div>
          <Badge tone={mutual.length ? "green" : "gray"}>{mutual.length} mutual · {pending.length} pending</Badge>
        </div>

        <div className="mt-8">
          {q.isLoading && <LoadingBlock label="loading connections" />}
          {q.isError && <ErrorState message="Couldn't load your connections." onRetry={() => q.refetch()} />}

          {q.data && items.length === 0 && (
            <EmptyState
              icon={<IconUsers width={24} height={24} />}
              title="No connections yet"
              body="When you and a stranger both tap CONNECT, they land here — no contact info exchanged, ever."
              action={
                <Link to="/match">
                  <Button variant="lime"><IconRadar width={16} height={16} /> FIND SOMEONE</Button>
                </Link>
              }
            />
          )}

          {pending.length > 0 && (
            <section className="mb-8">
              <div className="mono-label mb-3 text-[9.5px] text-sage">waiting on them</div>
              <div className="space-y-2">
                {pending.map((c) => (
                  <div key={c.connectionId} className="card flex items-center gap-3.5 px-4 py-3.5">
                    <Avatar name={c.other.username} hue={c.other.avatarHue} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-display text-[15px] font-bold">{c.other.username}</span>
                        <Badge tone="amber"><IconClock width={10} height={10} /> pending</Badge>
                      </div>
                      <p className="truncate text-[12.5px] text-moss">{c.sharedInterests.slice(0, 3).join(" · ") || "no shared interests yet"}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removeMut.mutate(c.other.id)}>Cancel</Button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {mutual.length > 0 && (
            <section>
              <div className="mono-label mb-3 text-[9.5px] text-sage">mutual connections</div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {mutual.map((c, i) => (
                  <div key={c.connectionId} className="anim-fade-up card group p-4 transition hover:-translate-y-0.5 hover:shadow-pop" style={{ animationDelay: `${i * 50}ms` }}>
                    <div className="flex items-start gap-3">
                      <Avatar name={c.other.username} hue={c.other.avatarHue} size={46} />
                      <div className="min-w-0 flex-1">
                        <div className="font-display text-[16px] font-bold">{c.other.username}</div>
                        <div className="mono-label mt-0.5 text-[9px] text-sage">{c.other.country} · {c.other.ageRange}</div>
                      </div>
                      <button onClick={() => setToRemove(c)} className="rounded-full p-1.5 text-sage opacity-0 transition hover:bg-coral/10 hover:text-coral group-hover:opacity-100" title="Remove connection">
                        <IconTrash width={15} height={15} />
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {c.sharedInterests.slice(0, 3).map((s) => (
                        <span key={s} className="flex items-center gap-1 rounded-full bg-fog px-2 py-0.5 text-[11px] font-bold text-pine">
                          <IconSpark width={9} height={9} className="text-em" /> {s}
                        </span>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-line/70 pt-2.5">
                      <span className="mono-label text-[9px] text-sage">
                        <IconLink width={10} height={10} className="mr-1 inline" />
                        connected {timeAgo(c.acceptedAt ?? c.createdAt)}
                      </span>
                      <Badge tone="green">mutual</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      <Modal open={!!toRemove} onClose={() => setToRemove(null)} title={`Remove ${toRemove?.other.username}?`}>
        <p className="text-[13.5px] text-moss">You'll disappear from each other's connection lists. You can still match randomly in the future.</p>
        <div className="mt-5 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={() => setToRemove(null)}>Keep</Button>
          <Button variant="danger" className="flex-1" loading={removeMut.isPending} onClick={() => toRemove && removeMut.mutate(toRemove.other.id)}>
            <IconTrash width={15} height={15} /> Remove
          </Button>
        </div>
      </Modal>
    </AppShell>
  );
}
