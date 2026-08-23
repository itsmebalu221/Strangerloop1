import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { ApiError } from "../../lib/errors";
import { useAuth } from "../../state/auth";
import { useToast } from "../../state/toast";
import { AppShell } from "../../components/shell";
import { Avatar, Badge, Button, ErrorState, Field, LoadingBlock, Modal, Toggle } from "../../components/ui";
import { IconCheck, IconShield, IconBlock, IconKey, IconTrash, IconWarn, IconLogout, IconSpark, IconRadar } from "../../components/icons";
import { cx, timeAgo } from "../../lib/utils";

const TABS = [
  { id: "profile", label: "Profile" },
  { id: "matching", label: "Matching" },
  { id: "privacy", label: "Privacy" },
  { id: "notifications", label: "Notifications" },
  { id: "safety", label: "Safety" },
];

export default function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "profile";

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <div className="anim-fade-up">
          <div className="mono-label mb-2 text-em">tune everything</div>
          <h1 className="font-display text-[36px] font-bold tracking-tight">Settings</h1>
        </div>
        <div className="mt-6 flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setParams({ tab: t.id })}
              className={cx("rounded-full px-4 py-2 text-[13.5px] font-bold transition", tab === t.id ? "bg-ink text-lime" : "border border-line bg-paper text-moss hover:border-ink/40 hover:text-ink")}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="mt-6">
          {tab === "profile" && <ProfileTab />}
          {tab === "matching" && <MatchingTab />}
          {tab === "privacy" && <PrivacyTab />}
          {tab === "notifications" && <NotificationsTab />}
          {tab === "safety" && <SafetyTab />}
        </div>
      </div>
    </AppShell>
  );
}

function useReference() {
  return useQuery({ queryKey: ["reference"], queryFn: () => api.get("/reference") });
}

function ChipSelect({ all, selected, onToggle, max = 12 }) {
  return (
    <div className="flex flex-wrap gap-2">
      {all.map((x) => (
        <button key={x.id} type="button" className={cx("chip", selected.includes(x.id) && "chip-on")} onClick={() => onToggle(x.id)} disabled={!selected.includes(x.id) && selected.length >= max}>
          {selected.includes(x.id) && <IconCheck width={12} height={12} />}
          {x.name}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Profile tab ---------------- */

function ProfileTab() {
  const { user, refreshUser } = useAuth();
  const { push } = useToast();
  const ref = useReference();
  const [username, setUsername] = useState(user?.username ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [gender, setGender] = useState(user?.gender ?? "undisclosed");
  const [country, setCountry] = useState(user?.country ?? "");
  const [hue, setHue] = useState(user?.avatarHue ?? 150);
  const [interests, setInterests] = useState(user?.interests.map((i) => i.id) ?? []);
  const [langs, setLangs] = useState(user?.languages.map((l) => l.id) ?? []);
  const [cts, setCts] = useState(user?.convTypes.map((c) => c.id) ?? []);

  const save = useMutation({
    mutationFn: () => api.patch("/profile", { username, bio, gender, country, avatarHue: hue, interestIds: interests, languageIds: langs, convTypeIds: cts }),
    onSuccess: async () => {
      await refreshUser();
      push("success", "Profile updated", "Your public signal changed.");
    },
    onError: (e) => push("error", "Couldn't save", e instanceof ApiError ? e.message : "Try again"),
  });

  const byCategory = useMemo(() => {
    const map = new Map();
    for (const i of ref.data?.interests ?? []) {
      if (!map.has(i.category)) map.set(i.category, []);
      map.get(i.category).push(i);
    }
    return [...map.entries()];
  }, [ref.data]);

  if (!user) return null;

  const toggle = (arr, set, id, min = 1) => {
    if (arr.includes(id)) {
      if (arr.length > min) set(arr.filter((x) => x !== id));
    } else set([...arr, id]);
  };

  return (
    <div className="anim-fade-up card space-y-6 p-6 sm:p-7">
      <div className="flex items-center gap-4">
        <Avatar name={username || user.username} hue={hue} size={64} />
        <div className="flex-1">
          <Field label="Avatar color">
            <input type="range" min={0} max={359} value={hue} onChange={(e) => setHue(Number(e.target.value))} className="w-full accent-[#0f8a6a]" />
          </Field>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Username">
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} />
        </Field>
        <Field label="Country">
          <input className="input" value={country} onChange={(e) => setCountry(e.target.value)} />
        </Field>
        <Field label="Gender">
          <select className="input" value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="nonbinary">Non-binary / Other</option>
            <option value="undisclosed">Prefer not to say</option>
          </select>
        </Field>
        <Field label="Email" hint="Private — never shown to strangers">
          <input className="input opacity-60" value={user.email} disabled />
        </Field>
      </div>
      <Field label="Bio" hint={`${bio.length}/240`}>
        <textarea className="input min-h-[74px] resize-none" maxLength={240} value={bio} onChange={(e) => setBio(e.target.value)} />
      </Field>
      <div>
        <div className="mono-label mb-2 text-[9.5px] text-sage">interests · {interests.length}</div>
        {byCategory.map(([cat, list]) => (
          <div key={cat} className="mb-3">
            <div className="mono-label mb-1.5 text-[8.5px] text-em/70">{cat}</div>
            <ChipSelect all={list} selected={interests} onToggle={(id) => toggle(interests, setInterests, id)} />
          </div>
        ))}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <div className="mono-label mb-2 text-[9.5px] text-sage">languages</div>
          <ChipSelect all={ref.data?.languages ?? []} selected={langs} onToggle={(id) => toggle(langs, setLangs, id)} max={6} />
        </div>
        <div>
          <div className="mono-label mb-2 text-[9.5px] text-sage">conversation types</div>
          <ChipSelect all={ref.data?.conversationTypes ?? []} selected={cts} onToggle={(id) => toggle(cts, setCts, id)} max={6} />
        </div>
      </div>
      <div className="flex justify-end border-t border-line pt-4">
        <Button variant="primary" size="lg" loading={save.isPending} onClick={() => save.mutate()}>
          <IconCheck width={16} height={16} /> Save profile
        </Button>
      </div>
    </div>
  );
}

/* ---------------- Matching tab ---------------- */

function MatchingTab() {
  const { user, refreshUser } = useAuth();
  const { push } = useToast();
  const ref = useReference();
  const [genders, setGenders] = useState(user?.prefs.genders ?? ["anyone"]);
  const [ageMin, setAgeMin] = useState(user?.prefs.ageMin ?? 18);
  const [ageMax, setAgeMax] = useState(user?.prefs.ageMax ?? 34);
  const [langs, setLangs] = useState(user?.prefs.languageIds ?? []);
  const [cts, setCts] = useState(user?.prefs.convTypeIds ?? []);

  const save = useMutation({
    mutationFn: () => api.patch("/preferences", { genders, ageMin, ageMax, languageIds: langs, convTypeIds: cts }),
    onSuccess: async () => {
      await refreshUser();
      push("success", "Preferences saved", "The queue will use your new dial.");
    },
    onError: (e) => push("error", "Couldn't save", e instanceof ApiError ? e.message : "Try again"),
  });

  if (!user) return null;
  const toggle = (arr, set, id) => set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

  return (
    <div className="anim-fade-up space-y-5">
      <div className="card space-y-6 p-6 sm:p-7">
        <div>
          <h2 className="font-display text-[20px] font-bold">Who do you want to meet?</h2>
          <p className="mt-1 text-[13.5px] text-moss">Both sides' preferences are respected by the engine — a match means both dials agree.</p>
        </div>
        <div>
          <div className="mono-label mb-2 text-[9.5px] text-sage">gender preference</div>
          <div className="flex flex-wrap gap-2">
            {[["anyone", "Anyone"], ["male", "Male"], ["female", "Female"], ["nonbinary", "Other"]].map(([v, l]) => (
              <button
                key={v}
                type="button"
                className={cx("chip", genders.includes(v) && "chip-on")}
                onClick={() => {
                  if (v === "anyone") setGenders(["anyone"]);
                  else {
                    const rest = genders.filter((g) => g !== "anyone");
                    setGenders(rest.includes(v) ? (rest.filter((x) => x !== v).length ? rest.filter((x) => x !== v) : ["anyone"]) : [...rest, v]);
                  }
                }}
              >
                {genders.includes(v) && <IconCheck width={12} height={12} />}
                {l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mono-label mb-2 text-[9.5px] text-sage">age range · {ageMin}–{ageMax === 60 ? "60+" : ageMax}</div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="From"><input className="input" type="number" min={18} max={ageMax} value={ageMin} onChange={(e) => setAgeMin(Math.max(18, Math.min(Number(e.target.value) || 18, ageMax)))} /></Field>
            <Field label="To"><input className="input" type="number" min={ageMin} max={60} value={ageMax} onChange={(e) => setAgeMax(Math.min(60, Math.max(Number(e.target.value) || 60, ageMin)))} /></Field>
          </div>
        </div>
        <div>
          <div className="mono-label mb-2 text-[9.5px] text-sage">preferred languages (empty = any)</div>
          <ChipSelect all={ref.data?.languages ?? []} selected={langs} onToggle={(id) => toggle(langs, setLangs, id)} max={6} />
        </div>
        <div>
          <div className="mono-label mb-2 text-[9.5px] text-sage">conversation types you're open to (empty = any)</div>
          <ChipSelect all={ref.data?.conversationTypes ?? []} selected={cts} onToggle={(id) => toggle(cts, setCts, id)} max={6} />
        </div>
        <div className="flex justify-end border-t border-line pt-4">
          <Button variant="primary" size="lg" loading={save.isPending} onClick={() => save.mutate()}>
            <IconRadar width={16} height={16} /> Save preferences
          </Button>
        </div>
      </div>

      <div className="card p-5">
        <div className="mono-label mb-3 text-[9.5px] text-sage">how your score is built · max 120</div>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            ["+20", "per shared interest (×2 cap)"],
            ["+20", "a shared language"],
            ["+15", "age ranges agree both ways"],
            ["+20", "gender preferences align"],
            ["+15", "a shared conversation type"],
            ["+10", "same country"],
          ].map(([v, l]) => (
            <div key={l} className="flex items-center gap-3 rounded-lg border border-line bg-mist/60 px-3 py-2">
              <span className="font-mono text-[13px] font-bold text-em">{v}</span>
              <span className="text-[12.5px] font-semibold text-moss">{l}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[12px] text-sage">If level 1 finds nobody, the engine relaxes age → interests → conversation type across 5 levels. Blocked and banned members are always excluded.</p>
      </div>
    </div>
  );
}

/* ---------------- Privacy tab ---------------- */

function PrivacyTab() {
  const { user, logoutAll, logout } = useAuth();
  const { push } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typed, setTyped] = useState("");

  const blocks = useQuery({ queryKey: ["blocks"], queryFn: () => api.get("/blocks") });
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: () => api.get("/auth/sessions") });

  const unblock = useMutation({
    mutationFn: (id) => api.del(`/blocks/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["blocks"] });
      push("info", "Unblocked", "They can match you again.");
    },
  });
  const revoke = useMutation({
    mutationFn: (id) => api.post(`/auth/sessions/${id}/revoke`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      push("info", "Session revoked");
    },
  });
  const deleteMut = useMutation({
    mutationFn: () => api.del("/account"),
    onSuccess: async () => {
      setConfirmOpen(false);
      await logout();
      push("warn", "Account deleted", "Identity anonymized, auth material destroyed. Reports retained per policy.");
      navigate("/");
    },
    onError: (e) => push("error", "Couldn't delete", e instanceof ApiError ? e.message : "Try again"),
  });

  if (!user) return null;

  return (
    <div className="anim-fade-up space-y-5">
      <div className="card p-6">
        <h2 className="font-display text-[19px] font-bold">Blocked members</h2>
        <p className="mt-1 text-[13px] text-moss">Blocking is instant, server-enforced and always available — it is never a premium feature.</p>
        <div className="mt-4">
          {blocks.isLoading && <LoadingBlock label="loading blocks" />}
          {blocks.isError && <ErrorState message="Couldn't load blocks." onRetry={() => blocks.refetch()} />}
          {blocks.data && blocks.data.items.length === 0 && <p className="rounded-xl border border-dashed border-line px-4 py-5 text-center text-[13px] text-sage">Nobody blocked. Keep it that way ✌️</p>}
          {blocks.data?.items.map((b) => (
            <div key={b.blockedUser.id} className="flex items-center gap-3 border-b border-line/70 py-3 last:border-0">
              <Avatar name={b.blockedUser.username} hue={b.blockedUser.avatarHue} size={36} />
              <div className="flex-1">
                <div className="text-[14px] font-bold">{b.blockedUser.username}</div>
                <div className="mono-label text-[9px] text-sage">blocked {timeAgo(b.createdAt)}</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => unblock.mutate(b.blockedUser.id)}>Unblock</Button>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-6">
        <h2 className="flex items-center gap-2 font-display text-[19px] font-bold"><IconKey width={17} height={17} className="text-em" /> Active sessions</h2>
        <p className="mt-1 text-[13px] text-moss">Refresh tokens rotate on every use; reuse of an old token revokes the whole family.</p>
        <div className="mt-4">
          {sessions.data?.sessions.map((s) => (
            <div key={s.id} className="flex items-center gap-3 border-b border-line/70 py-3 last:border-0">
              <div className="flex-1">
                <div className="text-[13.5px] font-bold">{s.device}</div>
                <div className="mono-label text-[9px] text-sage">created {timeAgo(s.createdAt)} · last seen {timeAgo(s.lastSeenAt)}</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => revoke.mutate(s.id)}><IconLogout width={13} height={13} /> Revoke</Button>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <Button variant="ghost" size="sm" onClick={async () => { await logoutAll(); navigate("/"); }}>
            <IconLogout width={14} height={14} /> Log out from all devices
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-coral/40 bg-coral/5 p-6">
        <h2 className="flex items-center gap-2 font-display text-[19px] font-bold text-coral"><IconWarn width={18} height={18} /> Danger zone</h2>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-moss">
          Deleting your account anonymizes your identity (username, email, bio, birthday), destroys sessions and tokens, and removes connections.
          Reports and moderation records are retained for safety review, as required.
        </p>
        <Button variant="danger" className="mt-4" onClick={() => { setTyped(""); setConfirmOpen(true); }}>
          <IconTrash width={15} height={15} /> Delete my account
        </Button>
      </div>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Delete account permanently?">
        <p className="text-[13.5px] text-moss">
          Type <strong className="font-mono text-ink">{user.username}</strong> to confirm. This cannot be undone.
        </p>
        <input className="input mt-4" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={user.username} />
        <div className="mt-5 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={() => setConfirmOpen(false)}>Keep my account</Button>
          <Button variant="danger" className="flex-1" disabled={typed !== user.username} loading={deleteMut.isPending} onClick={() => deleteMut.mutate()}>
            <IconBlock width={15} height={15} /> Delete forever
          </Button>
        </div>
      </Modal>
    </div>
  );
}

/* ---------------- Notifications tab ---------------- */

const NOTIF_KEYS = [
  { key: "connect_notify", label: "Connection notifications", desc: "When someone accepts your CONNECT or requests you." },
  { key: "connect_activity", label: "Connection activity", desc: "Mutual matches, conversation endings, queue updates." },
  { key: "safety_alerts", label: "Safety alerts", desc: "Warnings and moderation notices (always on)." },
  { key: "product_updates", label: "Product updates", desc: "Occasional news about matching improvements." },
];

function NotificationsTab() {
  const [prefs, setPrefs] = useState(() => {
    try {
      const raw = localStorage.getItem("wavelength.notifPrefs");
      return raw ? JSON.parse(raw) : { connect_notify: true, connect_activity: true, safety_alerts: true, product_updates: false };
    } catch {
      return { connect_notify: true, connect_activity: true, safety_alerts: true, product_updates: false };
    }
  });
  const set = (k, v) => {
    const next = { ...prefs, [k]: v };
    setPrefs(next);
    localStorage.setItem("wavelength.notifPrefs", JSON.stringify(next));
  };

  return (
    <div className="anim-fade-up card divide-y divide-line/70 p-6">
      <div className="pb-4">
        <h2 className="font-display text-[19px] font-bold">Notifications</h2>
        <p className="mt-1 text-[13px] text-moss">Device-level delivery preferences for this embedded build. In-app notifications always land in the bell.</p>
      </div>
      {NOTIF_KEYS.map((n) => (
        <div key={n.key} className="flex items-center justify-between gap-4 py-4">
          <div>
            <div className="text-[14px] font-bold">{n.label} {n.key === "safety_alerts" && <Badge tone="red" className="ml-1">required</Badge>}</div>
            <div className="text-[12.5px] text-moss">{n.desc}</div>
          </div>
          <Toggle on={prefs[n.key]} onChange={(v) => n.key !== "safety_alerts" && set(n.key, v)} />
        </div>
      ))}
    </div>
  );
}

/* ---------------- Safety tab ---------------- */

function SafetyTab() {
  return (
    <div className="anim-fade-up space-y-5">
      <div className="card p-6">
        <h2 className="flex items-center gap-2 font-display text-[19px] font-bold"><IconShield width={18} height={18} className="text-em" /> Community guidelines</h2>
        <ul className="mt-4 space-y-2.5">
          {[
            "Adults only. Anyone under 18 is removed on discovery.",
            "No harassment, hate, threats or sexual solicitation — automated filters and human moderators both enforce this.",
            "No scams: gift cards, crypto pitches and 'guaranteed returns' end conversations.",
            "Don't fish for contact details. Connections stay on-platform by design.",
            "Respect the NEXT. Nobody owes anyone a conversation.",
          ].map((g, i) => (
            <li key={i} className="flex gap-3 text-[14px] leading-relaxed text-moss">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-em" /> {g}
            </li>
          ))}
        </ul>
      </div>

      <div className="card p-6">
        <h2 className="font-display text-[19px] font-bold">How moderation works</h2>
        <p className="mt-1 text-[13.5px] text-moss">Every message passes a classifier before delivery. Risk levels and the actions they trigger:</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {[
            ["LOW", "green", "Delivered normally"],
            ["SUSPICIOUS", "amber", "Delivered + silently flagged"],
            ["HIGH", "amber", "Delivered with an in-chat safety warning"],
            ["SEVERE", "red", "Blocked before delivery + auto-escalated to moderators"],
          ].map(([lvl, tone, desc]) => (
            <div key={lvl} className="flex items-center gap-3 rounded-xl border border-line bg-mist/60 px-4 py-3">
              <Badge tone={tone}>{lvl}</Badge>
              <span className="text-[12.5px] font-semibold text-moss">{desc}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[12.5px] text-sage">Repeated SEVERE violations trigger automatic 24h suspensions. Human review can dismiss, warn, suspend or ban — every action is audit-logged.</p>
      </div>

      <div className="card p-6">
        <h2 className="font-display text-[19px] font-bold">Need to report someone?</h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-moss">
          Use the <strong>Safety</strong> menu inside any chat. Reports end the conversation immediately, attach the last messages as context, and never reveal your identity to the other member. Severe categories (threats, underage concerns) auto-suspend the reported account pending review.
        </p>
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-em/30 bg-em/6 px-4 py-3">
          <IconSpark width={15} height={15} className="text-em" />
          <span className="text-[13px] font-semibold text-emdeep">Blocks are always free and instant — safety is never monetized.</span>
        </div>
      </div>
    </div>
  );
}
