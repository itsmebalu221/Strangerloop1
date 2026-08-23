import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { AuditRecord, ReportRecord, Risk } from "../../lib/types";
import { ApiError } from "../../lib/errors";
import { useAuth } from "../../state/auth";
import { useToast } from "../../state/toast";
import { AppShell } from "../../components/shell";
import { Avatar, Badge, Bars, Button, ErrorState, LoadingBlock, Modal, Sparkline } from "../../components/ui";
import { Logo, IconGavel, IconUsers, IconFlag, IconChart, IconSearch, IconWarn, IconArrowLeft } from "../../components/icons";
import { cx, timeAgo } from "../../lib/utils";

interface Overview {
  online: number; searching: number; activeConversations: number; totalUsers: number; newUsers7d: number; dau: number;
  matchRate: number; avgConversationSec: number; openReports: number; banned: number; suspended: number;
}
interface Analytics {
  days: Array<{ date: string; signups: number; searches: number; matches: number; conversations: number; reports: number }>;
  retention: { d1: number; d7: number; d30: number };
  outcomes: { next: number; blocked: number; reported: number; mutualConnections: number };
  scoreHistogram: number[];
}
interface UserRow {
  user: { id: string; username: string; avatarHue: number; country: string; ageRange: string };
  email: string; status: string; role: string; warnCount: number; createdAt: string; lastActiveAt: string; simulated: boolean;
}
interface ReportRow extends ReportRecord {
  reporterName: string; reportedName: string;
  context: Array<{ sender: string; content: string; at: string }>;
  priorViolations: number;
}

const RISK_TONE: Record<Risk, "green" | "amber" | "red" | "gray"> = { LOW: "green", SUSPICIOUS: "amber", HIGH: "amber", SEVERE: "red" };
const STATUS_TONE: Record<string, "green" | "gray" | "red" | "amber"> = { ACTIVE: "green", SUSPENDED: "amber", BANNED: "red", PENDING_VERIFICATION: "gray", DELETED: "gray" };

const TABS = [
  { id: "overview", label: "Overview", icon: <IconChart width={15} height={15} /> },
  { id: "users", label: "Users", icon: <IconUsers width={15} height={15} /> },
  { id: "reports", label: "Reports", icon: <IconFlag width={15} height={15} /> },
  { id: "audit", label: "Audit log", icon: <IconGavel width={15} height={15} /> },
];

export default function AdminPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState("overview");

  return (
    <AppShell wide>
      <div className="anim-fade-up flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mono-label mb-2 flex items-center gap-2 text-coral"><IconGavel width={14} height={14} /> admin console · rbac enforced server-side</div>
          <h1 className="font-display text-[34px] font-bold tracking-tight">Moderation & Analytics</h1>
        </div>
        <Link to="/home"><Button variant="ghost" size="sm"><IconArrowLeft width={14} height={14} /> Back to app</Button></Link>
      </div>

      <div className="mt-6 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={cx("flex items-center gap-2 rounded-full px-4 py-2 text-[13.5px] font-bold transition", tab === t.id ? "bg-ink text-lime" : "border border-line bg-paper text-moss hover:border-ink/40 hover:text-ink")}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "overview" && <OverviewTab />}
        {tab === "users" && <UsersTab actorId={user?.id ?? ""} />}
        {tab === "reports" && <ReportsTab />}
        {tab === "audit" && <AuditTab />}
      </div>
    </AppShell>
  );
}

function OverviewTab() {
  const ov = useQuery({ queryKey: ["admin-overview"], queryFn: () => api.get<Overview>("/admin/overview"), refetchInterval: 20_000 });
  const an = useQuery({ queryKey: ["admin-analytics"], queryFn: () => api.get<Analytics>("/admin/analytics") });

  if (ov.isLoading) return <LoadingBlock label="crunching numbers" />;
  if (ov.isError || !ov.data) return <ErrorState message="Couldn't load overview." onRetry={() => ov.refetch()} />;
  const o = ov.data;
  const days = an.data?.days ?? [];

  const cards: Array<[string, string | number, string]> = [
    ["Online now", o.online, "live"],
    ["Searching", o.searching, "in queue"],
    ["Active conversations", o.activeConversations, "right now"],
    ["DAU", o.dau, "of " + o.totalUsers + " members"],
    ["New users · 7d", o.newUsers7d, "signups"],
    ["Match rate", o.matchRate + "%", "matches / searches"],
    ["Avg conversation", o.avgConversationSec + "s", "ended sessions"],
    ["Open reports", o.openReports, o.suspended + " suspended · " + o.banned + " banned"],
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map(([label, value, sub], i) => (
          <div key={label} className="anim-fade-up card p-4" style={{ animationDelay: `${i * 40}ms` }}>
            <div className="mono-label text-[9px] text-sage">{label}</div>
            <div className="mt-1.5 font-display text-[28px] font-bold leading-none text-ink">{value}</div>
            <div className="mono-label mt-1.5 text-[8.5px] text-em">{sub}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-display text-[15px] font-bold">Signups · 14 days</span>
            <Badge tone="gray">seeded baseline + live events</Badge>
          </div>
          <Sparkline values={days.map((d) => d.signups)} className="h-16 w-full" />
          <div className="mt-4 mb-2 flex items-center justify-between">
            <span className="font-display text-[15px] font-bold">Matches per day</span>
          </div>
          <Bars values={days.slice(-7).map((d) => d.matches)} labels={days.slice(-7).map((d) => d.date.slice(8))} />
        </div>
        <div className="space-y-4">
          <div className="card p-5">
            <span className="font-display text-[15px] font-bold">Retention</span>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {an.data ? ([["D1", an.data.retention.d1], ["D7", an.data.retention.d7], ["D30", an.data.retention.d30]] as const).map(([l, v]) => (
                <div key={l} className="rounded-xl border border-line bg-mist/60 p-3 text-center">
                  <div className="font-display text-[22px] font-bold text-em">{v}%</div>
                  <div className="mono-label text-[8.5px] text-sage">{l}</div>
                </div>
              )) : <LoadingBlock />}
            </div>
          </div>
          <div className="card p-5">
            <span className="font-display text-[15px] font-bold">Conversation outcomes</span>
            {an.data ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <OutcomeRow label="NEXT (either side)" value={an.data.outcomes.next} color="var(--color-em)" />
                <OutcomeRow label="Mutual connections" value={an.data.outcomes.mutualConnections} color="var(--color-limedeep)" />
                <OutcomeRow label="Ended by block" value={an.data.outcomes.blocked} color="var(--color-coral)" />
                <OutcomeRow label="Ended by report" value={an.data.outcomes.reported} color="var(--color-amberx)" />
              </div>
            ) : <LoadingBlock />}
          </div>
          <div className="card p-5">
            <span className="font-display text-[15px] font-bold">Match score histogram</span>
            {an.data ? (
              <div className="mt-3 flex items-end gap-2">
                {an.data.scoreHistogram.map((v, i) => (
                  <div key={i} className="flex-1 text-center">
                    <div className="mx-auto w-full rounded-t-md bg-em transition-all" style={{ height: `${Math.max(6, (v / Math.max(...an.data.scoreHistogram, 1)) * 64)}px`, opacity: 0.4 + 0.15 * i }} />
                    <div className="mono-label mt-1 text-[8px] text-sage">{["<40", "40s", "60s", "80s", "100+"][i]}</div>
                  </div>
                ))}
              </div>
            ) : <LoadingBlock />}
          </div>
        </div>
      </div>
    </div>
  );
}

function OutcomeRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-line bg-mist/60 p-3">
      <div className="font-display text-[22px] font-bold" style={{ color }}>{value}</div>
      <div className="mono-label text-[8.5px] text-sage">{label}</div>
    </div>
  );
}

function UsersTab({ actorId }: { actorId: string }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [note, setNote] = useState("");
  const { push } = useToast();
  const qc = useQueryClient();

  const users = useQuery({ queryKey: ["admin-users", q, status], queryFn: () => api.get<{ items: UserRow[] }>(`/admin/users?q=${encodeURIComponent(q)}${status ? `&status=${status}` : ""}`) });
  const detail = useQuery({
    queryKey: ["admin-user-detail", selected?.user.id],
    queryFn: () => api.get<{ moderationHistory: Array<{ action: string; reason: string; risk: string; createdAt: string }>; reportsAgainst: ReportRecord[]; activeSessions: number; conversationCount: number }>("/admin/users/" + selected!.user.id),
    enabled: !!selected,
  });

  const act = useMutation({
    mutationFn: (vars: { id: string; action: string }) => api.post(`/admin/users/${vars.id}/action`, { action: vars.action, note: note || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-user-detail"] });
      push("success", "Action applied", "Audit log updated.");
      setNote("");
    },
    onError: (e) => push("error", "Action failed", e instanceof ApiError ? e.message : "Missing permission?"),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <IconSearch width={15} height={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sage" />
          <input className="input !pl-10" placeholder="Search username or email…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {["ACTIVE", "SUSPENDED", "BANNED"].map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      {users.isLoading && <LoadingBlock label="loading members" />}
      {users.isError && <ErrorState message="Couldn't load users." onRetry={() => users.refetch()} />}
      {users.data && (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="mono-label border-b border-line text-[8.5px] text-sage">
                <th className="px-4 py-3">member</th><th className="px-4 py-3">email</th><th className="px-4 py-3">status</th>
                <th className="px-4 py-3">warns</th><th className="px-4 py-3">last active</th><th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.data.items.map((u) => (
                <tr key={u.user.id} className="cursor-pointer border-b border-line/60 transition last:border-0 hover:bg-mist" onClick={() => { setSelected(u); setNote(""); }}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={u.user.username} hue={u.user.avatarHue} size={30} />
                      <div>
                        <div className="text-[13.5px] font-bold">{u.user.username} {u.simulated && <Badge tone="teal" className="ml-1">engine</Badge>}</div>
                        <div className="mono-label text-[8.5px] text-sage">{u.user.country} · {u.user.ageRange}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[12.5px] text-moss">{u.email}</td>
                  <td className="px-4 py-3"><Badge tone={STATUS_TONE[u.status] ?? "gray"}>{u.status.toLowerCase()}</Badge></td>
                  <td className="px-4 py-3">
                    {u.warnCount > 0 ? <span className="flex items-center gap-1 text-[12.5px] font-bold text-amberx"><IconWarn width={12} height={12} />{u.warnCount}</span> : <span className="text-[12.5px] text-sage">—</span>}
                  </td>
                  <td className="px-4 py-3 mono-label text-[9px] text-sage">{timeAgo(u.lastActiveAt)}</td>
                  <td className="px-4 py-3 text-right text-[12px] font-bold text-em">manage →</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected ? `Manage ${selected.user.username}` : ""} width="max-w-lg">
        {selected && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              <Badge tone={STATUS_TONE[selected.status] ?? "gray"}>{selected.status.toLowerCase()}</Badge>
              <Badge tone={selected.role === "admin" ? "dark" : "gray"}>{selected.role}</Badge>
              <Badge tone="gray">{detail.data?.conversationCount ?? "…"} conversations</Badge>
              <Badge tone="gray">{detail.data?.activeSessions ?? "…"} sessions</Badge>
            </div>
            <div>
              <div className="mono-label mb-2 text-[9px] text-sage">moderation history</div>
              <div className="max-h-36 space-y-1.5 overflow-y-auto rounded-xl border border-line bg-mist/50 p-3">
                {(detail.data?.moderationHistory ?? []).length === 0 && <p className="text-[12px] text-sage">Clean record.</p>}
                {detail.data?.moderationHistory.map((m, i) => (
                  <div key={i} className="flex items-center gap-2 text-[12px]">
                    <Badge tone={RISK_TONE[m.risk as Risk] ?? "gray"}>{m.action}</Badge>
                    <span className="truncate text-moss">{m.reason}</span>
                    <span className="mono-label ml-auto shrink-0 text-[8.5px] text-sage">{timeAgo(m.createdAt)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="mono-label mb-2 text-[9px] text-sage">note (optional, sent to the member where relevant)</div>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. keep it respectful in chats" />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Button variant="ghost" size="sm" loading={act.isPending} onClick={() => act.mutate({ id: selected.user.id, action: "warn" })}>Warn</Button>
              <Button variant="ghost" size="sm" loading={act.isPending} onClick={() => act.mutate({ id: selected.user.id, action: "suspend" })}>Suspend 7d</Button>
              <Button variant="danger" size="sm" loading={act.isPending} onClick={() => act.mutate({ id: selected.user.id, action: "ban" })}>Ban</Button>
              <Button variant="primary" size="sm" loading={act.isPending} onClick={() => act.mutate({ id: selected.user.id, action: "restore" })}>Restore</Button>
            </div>
            <p className="mono-label text-[8.5px] text-sage">signed in as {actorId.slice(0, 8)}… · every action is audit-logged</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

function ReportsTab() {
  const [status, setStatus] = useState("open");
  const [selected, setSelected] = useState<ReportRow | null>(null);
  const [note, setNote] = useState("");
  const { push } = useToast();
  const qc = useQueryClient();

  const reports = useQuery({ queryKey: ["admin-reports", status], queryFn: () => api.get<{ items: ReportRow[] }>(`/admin/reports?status=${status}`) });

  const act = useMutation({
    mutationFn: (vars: { id: string; action: string }) => api.post(`/admin/reports/${vars.id}/action`, { action: vars.action, note: note || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-reports"] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
      setSelected(null);
      setNote("");
      push("success", "Report resolved", "Action applied and audit-logged.");
    },
    onError: (e) => push("error", "Action failed", e instanceof ApiError ? e.message : "Missing permission?"),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {["open", "escalated", "actioned", "dismissed"].map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={cx("rounded-full px-4 py-2 text-[13px] font-bold capitalize transition", status === s ? "bg-ink text-lime" : "border border-line bg-paper text-moss hover:text-ink")}>
            {s}
          </button>
        ))}
      </div>
      {reports.isLoading && <LoadingBlock label="loading reports" />}
      {reports.isError && <ErrorState message="Couldn't load reports." onRetry={() => reports.refetch()} />}
      {reports.data && reports.data.items.length === 0 && (
        <div className="card px-6 py-12 text-center">
          <div className="font-display text-[17px] font-bold">Queue clear ✨</div>
          <p className="mt-1 text-[13px] text-moss">No {status} reports right now.</p>
        </div>
      )}
      {reports.data?.items.map((r) => (
        <button key={r.id} onClick={() => { setSelected(r); setNote(""); }} className="card flex w-full flex-wrap items-center gap-3 px-4 py-3.5 text-left transition hover:-translate-y-0.5 hover:shadow-pop">
          <Badge tone={RISK_TONE[r.risk]}>{r.risk}</Badge>
          <Badge tone="gray" className="capitalize">{r.category}</Badge>
          <span className="text-[13.5px] font-bold">{r.reporterName} <span className="text-sage">→</span> {r.reportedName}</span>
          {r.autoAction !== "ALLOW" && <Badge tone="amber">auto: {r.autoAction.replace(/_/g, " ")}</Badge>}
          <span className="mono-label ml-auto text-[9px] text-sage">{timeAgo(r.createdAt)}</span>
        </button>
      ))}

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected ? `Report · ${selected.category}` : ""} width="max-w-xl">
        {selected && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              <Badge tone={RISK_TONE[selected.risk]}>{selected.risk}</Badge>
              <Badge tone="gray">{selected.reporterName} reported {selected.reportedName}</Badge>
              <Badge tone={selected.priorViolations > 0 ? "amber" : "green"}>{selected.priorViolations} prior violations</Badge>
            </div>
            {selected.details && (
              <div className="rounded-xl border border-line bg-mist/60 px-4 py-3 text-[13px] italic text-moss">“{selected.details}”</div>
            )}
            <div>
              <div className="mono-label mb-2 text-[9px] text-sage">conversation context (last messages)</div>
              <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-xl border border-line bg-mist/50 p-3">
                {selected.context.length === 0 && <p className="text-[12px] text-sage">No messages attached.</p>}
                {selected.context.map((m, i) => (
                  <div key={i} className="text-[12.5px]">
                    <span className="font-bold">{m.sender}:</span> <span className="text-moss">{m.content}</span>
                  </div>
                ))}
              </div>
            </div>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Moderator note (optional)" />
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" loading={act.isPending} onClick={() => act.mutate({ id: selected.id, action: "dismiss" })}>Dismiss</Button>
              <Button variant="ghost" size="sm" loading={act.isPending} onClick={() => act.mutate({ id: selected.id, action: "warn" })}>Warn member</Button>
              <Button variant="ghost" size="sm" loading={act.isPending} onClick={() => act.mutate({ id: selected.id, action: "suspend" })}>Suspend 7d</Button>
              <Button variant="danger" size="sm" loading={act.isPending} onClick={() => act.mutate({ id: selected.id, action: "ban" })}>Ban</Button>
              <Button variant="primary" size="sm" loading={act.isPending} onClick={() => act.mutate({ id: selected.id, action: "escalate" })}>Escalate</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function AuditTab() {
  const audit = useQuery({ queryKey: ["admin-audit"], queryFn: () => api.get<{ items: AuditRecord[] }>("/admin/audit") });
  if (audit.isLoading) return <LoadingBlock label="loading audit log" />;
  if (audit.isError || !audit.data) return <ErrorState message="Couldn't load audit log." onRetry={() => audit.refetch()} />;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[560px] text-left">
        <thead>
          <tr className="mono-label border-b border-line text-[8.5px] text-sage">
            <th className="px-4 py-3">when</th><th className="px-4 py-3">actor</th><th className="px-4 py-3">action</th><th className="px-4 py-3">details</th>
          </tr>
        </thead>
        <tbody>
          {audit.data.items.length === 0 && (
            <tr><td colSpan={4} className="px-4 py-10 text-center text-[13px] text-sage">No admin actions yet.</td></tr>
          )}
          {audit.data.items.map((a) => (
            <tr key={a.id} className="border-b border-line/60 last:border-0">
              <td className="mono-label px-4 py-3 text-[9px] text-sage">{timeAgo(a.createdAt)}</td>
              <td className="px-4 py-3 text-[13px] font-bold">{a.actorName}</td>
              <td className="px-4 py-3"><Badge tone="dark">{a.action}</Badge></td>
              <td className="px-4 py-3 text-[12.5px] text-moss">{a.details ?? a.target ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
