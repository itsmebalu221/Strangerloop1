import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Avatar, Badge, Button, LiveDot, Reveal } from "../../components/ui";
import { Logo, IconRadar, IconShield, IconSpark, IconNext, IconLink, IconBlock, IconChat, IconGlobe } from "../../components/icons";
import { cx } from "../../lib/utils";

/* The preview console matches online members against a sample profile
   using the same weights the real engine applies. */
const SAMPLE = {
  interests: ["Programming", "Artificial Intelligence", "PC Gaming", "Startups"],
  langs: ["English", "Hindi"],
  cts: ["Coding", "Gaming", "Casual"],
  age: 24,
  min: 18,
  max: 34,
  country: "India",
};

function scoreOf(p) {
  const shared = p.interests.map((i) => i.name).filter((n) => SAMPLE.interests.includes(n));
  const sharedLang = p.languages.some((l) => SAMPLE.langs.includes(l.name));
  const sharedCt = p.convTypes.some((c) => SAMPLE.cts.includes(c.name));
  const ageNum = parseInt(p.ageRange, 10);
  const ageOk = ageNum >= SAMPLE.min && ageNum <= SAMPLE.max;
  let score = Math.min(shared.length, 2) * 20 + (sharedLang ? 20 : 0) + (sharedCt ? 15 : 0) + (p.country === SAMPLE.country ? 10 : 0) + (ageOk ? 15 : 0) + 20;
  return { score, shared };
}

function MatchConsole() {
  const { data } = useQuery({
    queryKey: ["presence"],
    queryFn: () => api.get("/presence"),
    refetchInterval: 20_000,
  });
  const [rows, setRows] = useState([]);
  const [phase, setPhase] = useState("scan");
  const [idx, setIdx] = useState(0);

  const online = useMemo(() => data?.online ?? [], [data]);

  useEffect(() => {
    if (!online.length) return;
    setPhase("scan");
    const t1 = setTimeout(() => setPhase("scored"), 1150);
    const t2 = setTimeout(() => {
      const p = online[idx % online.length];
      const { score, shared } = scoreOf(p);
      setRows((r) => [{ id: Date.now(), name: p.username, hue: p.avatarHue, tags: p.interests.slice(0, 2).map((i) => i.name), score, shared }, ...r].slice(0, 4));
      setIdx((i) => i + 1);
    }, 2100);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [idx, online]);

  const current = online.length ? online[idx % online.length] : null;
  const currentScore = current ? scoreOf(current).score : 0;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-pine/60 bg-deep text-mist shadow-pop">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <LiveDot />
          <span className="mono-label text-[10.5px] text-lime">live match engine</span>
        </div>
        <span className="mono-label text-[9.5px] text-mist/50">queue · scoring · fallback L1–L5</span>
      </div>

      <div className="px-5 py-4">
        {current ? (
          <div key={current.id} className="anim-fade-up">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Avatar name={current.username} hue={current.avatarHue} size={44} />
                <span className="radar-ring absolute inset-0 rounded-full border-2 border-lime/70" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-[16px] font-bold">{current.username}</span>
                  <span className="mono-label text-[9.5px] text-mist/50">{current.country}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {current.interests.slice(0, 3).map((i) => (
                    <span key={i.id} className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10.5px] font-semibold text-mist/80">
                      {i.name}
                    </span>
                  ))}
                </div>
              </div>
              <div className="text-right">
                <div className={cx("font-display text-[26px] font-bold leading-none", phase === "scored" ? "text-lime" : "text-mist/40")}>
                  {phase === "scored" ? currentScore : "··"}
                </div>
                <div className="mono-label text-[8.5px] text-mist/45">/ 120 pts</div>
              </div>
            </div>
            <div className="mt-3.5 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-lime transition-all duration-1000 ease-out"
                style={{ width: phase === "scored" ? `${(currentScore / 120) * 100}%` : "6%" }}
              />
            </div>
            <div className="mono-label mt-2 flex items-center justify-between text-[9.5px] text-mist/50">
              <span>{phase === "scan" ? "scanning shared interests…" : "match reserved · opening conversation"}</span>
              <span className={cx(phase === "scored" && "text-lime")}>{phase === "scored" ? "CONNECTED ✓" : "SEARCHING"}</span>
            </div>
          </div>
        ) : (
          <div className="flex h-28 items-center justify-center gap-3 text-mist/50">
            <IconRadar width={22} height={22} className="anim-soft-pulse" />
            <span className="mono-label text-[10.5px]">warming up the queue…</span>
          </div>
        )}

        <div className="mt-4 space-y-1.5 border-t border-white/10 pt-3">
          {rows.length === 0 && <p className="mono-label text-[9.5px] text-mist/35">recent matches appear here</p>}
          {rows.map((r, i) => (
            <div key={r.id} className={cx("flex items-center gap-2.5 rounded-lg px-2 py-1.5", i === 0 && "flash-row")}>
              <Avatar name={r.name} hue={r.hue} size={22} />
              <span className="text-[12px] font-bold">{r.name}</span>
              <span className="truncate text-[11px] text-mist/50">{r.tags.join(" · ")}</span>
              <span className="mono-label ml-auto shrink-0 text-[10px] text-lime">{r.score} pts</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const WEIGHTS = [
  ["Shared interest", "+20"],
  ["Same language", "+20"],
  ["Age compatible", "+15"],
  ["Gender pref. aligned", "+20"],
  ["Conversation type", "+15"],
  ["Same country", "+10"],
];

export default function WelcomePage() {
  const presence = useQuery({ queryKey: ["presence"], queryFn: () => api.get("/presence"), refetchInterval: 20_000 });
  const reference = useQuery({ queryKey: ["reference"], queryFn: () => api.get("/reference") });
  const interests = reference.data?.interests ?? [];
  const online = presence.data?.count ?? null;

  return (
    <div className="ambient noise relative min-h-screen overflow-hidden">
      <div className="dotgrid pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(80%_60%_at_50%_20%,black,transparent)]" />

      <header className="relative mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink text-lime">
            <Logo width={20} height={20} />
          </span>
          <span className="font-display text-[19px] font-bold tracking-tight">wavelength</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link to="/login">
            <Button variant="ghost" size="sm">Log in</Button>
          </Link>
          <Link to="/register">
            <Button variant="lime" size="sm">Create account</Button>
          </Link>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-4 sm:px-6">
        {/* opening — the live engine, not a hero trio */}
        <section className="grid items-center gap-10 pb-16 pt-8 lg:grid-cols-[1.02fr_0.98fr] lg:pt-14">
          <div className="anim-fade-up">
            <div className="mb-5 inline-flex items-center gap-2.5 rounded-full border border-line bg-paper px-3.5 py-1.5 shadow-lift">
              <LiveDot />
              <span className="mono-label text-[10.5px] text-moss">
                {online !== null ? `${online} members on the frequency` : "interest-based stranger chat"}
              </span>
            </div>
            <h1 className="font-display text-[42px] font-bold leading-[1.02] tracking-tight sm:text-[58px]">
              Meet a stranger
              <br />
              on your{" "}
              <span className="relative inline-block text-em">
                wavelength.
                <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 200 12" fill="none">
                  <path d="M3 8c20-6 34-6 52 0s34 6 52 0 34-6 52 0 22 4 38 0" stroke="var(--color-lime)" strokeWidth="4.5" strokeLinecap="round" />
                </svg>
              </span>
            </h1>
            <p className="mt-6 max-w-md text-[16.5px] leading-relaxed text-moss">
              No roulette. Our matching engine scores every candidate on shared interests, language, age and
              conversation style — then connects you with the best one online. Talk, hit{" "}
              <strong className="text-ink">NEXT</strong>, or make it a <strong className="text-ink">CONNECTION</strong>.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/register">
                <Button variant="lime" size="xl">
                  <IconRadar width={20} height={20} /> FIND SOMEONE
                </Button>
              </Link>
              <Link to="/login">
                <Button variant="ghost" size="xl">I have an account</Button>
              </Link>
            </div>
            <div className="mt-10 grid max-w-md grid-cols-3 divide-x divide-line border-y border-line py-4">
              {[
                [String(interests.length || 35), "interests"],
                ["5", "fallback levels"],
                ["120", "max match score"],
              ].map(([v, l]) => (
                <div key={l} className="px-4 first:pl-0">
                  <div className="font-display text-[24px] font-bold text-ink">{v}</div>
                  <div className="mono-label mt-0.5 text-[9.5px] text-sage">{l}</div>
                </div>
              ))}
            </div>
          </div>

          <Reveal delay={120}>
            <MatchConsole />
            <div className="mt-4 flex flex-wrap gap-1.5">
              {WEIGHTS.map(([k, v]) => (
                <span key={k} className="chip pointer-events-none !cursor-default !py-1 text-[11.5px]">
                  <span className="font-mono text-em">{v}</span> {k}
                </span>
              ))}
            </div>
          </Reveal>
        </section>

        {/* interest ticker */}
        <section className="relative border-y border-line/70 bg-paper/70 py-4">
          <div className="flex overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)]">
            <div className="anim-marquee flex shrink-0 gap-2.5 pr-2.5">
              {[...interests, ...interests].map((i, n) => (
                <span key={`${i.id}-${n}`} className="chip pointer-events-none whitespace-nowrap !cursor-default text-[12.5px]">
                  <IconSpark width={12} height={12} className="text-em" />
                  {i.name}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* how it works — numbered ledger, not card grid */}
        <section className="mx-auto max-w-4xl py-16">
          <Reveal>
            <div className="mono-label mb-2 text-em">how matching works</div>
            <h2 className="font-display text-[30px] font-bold tracking-tight sm:text-[38px]">From signal to stranger in four moves.</h2>
          </Reveal>
          <div className="mt-8">
            {[
              { n: "01", icon: <IconSpark width={18} height={18} />, t: "Build your signal", d: "Pick your interests, languages and the kinds of conversations you actually want — coding, gaming, debate, casual." },
              { n: "02", icon: <IconGlobe width={18} height={18} />, t: "Tune the dial", d: "Set who you want to meet: gender preference and an age range. The engine respects both sides' dials." },
              { n: "03", icon: <IconRadar width={18} height={18} />, t: "FIND SOMEONE", d: "The queue scores every candidate out of 120 points and relaxes criteria across 5 levels — you never hit a dead end." },
              { n: "04", icon: <IconChat width={18} height={18} />, t: "Talk, then choose", d: "Real-time chat with starters built from your shared interests. NEXT to keep searching, CONNECT to keep them, BLOCK or REPORT anytime." },
            ].map((s, i) => (
              <Reveal key={s.n} delay={i * 90}>
                <div className="group flex items-start gap-5 border-t border-line py-5 transition last:border-b hover:bg-paper/70 sm:gap-8 sm:px-4">
                  <span className="font-display text-[15px] font-bold text-limedeep">{s.n}</span>
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-paper text-em transition group-hover:border-em">
                    {s.icon}
                  </span>
                  <div>
                    <h3 className="font-display text-[18px] font-bold">{s.t}</h3>
                    <p className="mt-1 max-w-xl text-[14px] leading-relaxed text-moss">{s.d}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* safety */}
        <section className="pb-20">
          <Reveal>
            <div className="relative overflow-hidden rounded-2xl bg-ink px-6 py-8 text-mist sm:px-10">
              <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-lime/10 blur-2xl" />
              <div className="flex flex-wrap items-center gap-x-10 gap-y-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-lime/15 text-lime">
                    <IconShield width={22} height={22} />
                  </span>
                  <div>
                    <div className="font-display text-[16px] font-bold">Adults only, age-gated</div>
                    <div className="text-[12.5px] text-mist/60">18+ at registration, age shown as ranges — never your birthday.</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-lime/15 text-lime">
                    <IconBlock width={22} height={22} />
                  </span>
                  <div>
                    <div className="font-display text-[16px] font-bold">Block & report, enforced</div>
                    <div className="text-[12.5px] text-mist/60">Server-side: blocked members can never match you again.</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-lime/15 text-lime">
                    <IconNext width={22} height={22} />
                  </span>
                  <div>
                    <div className="font-display text-[16px] font-bold">NEXT is instant</div>
                    <div className="text-[12.5px] text-mist/60">Leave any conversation and the queue picks up immediately.</div>
                  </div>
                </div>
                <div className="ml-auto hidden items-center gap-2 lg:flex">
                  <IconLink width={16} height={16} className="text-lime" />
                  <span className="mono-label text-[10px] text-mist/50">connections never expose contact info</span>
                </div>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="relative border-t border-line/70 py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-2 text-moss">
            <Logo width={16} height={16} />
            <span className="mono-label text-[10px]">wavelength · meet on your frequency</span>
          </div>
          <div className="flex items-center gap-4">
            <Badge tone="gray">18+</Badge>
            <Link to="/register" className="mono-label text-[10.5px] text-em hover:underline">join the queue →</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
