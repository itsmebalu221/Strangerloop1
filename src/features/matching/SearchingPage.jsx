import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { onEvent } from "../../api/realtime";
import { useAuth } from "../../state/auth";
import { useToast } from "../../state/toast";
import { AppShell, usePresence } from "../../components/shell";
import { Avatar, Badge, Button, LiveDot } from "../../components/ui";
import { IconRadar, IconX, IconSpark, Logo } from "../../components/icons";
import { ApiError } from "../../lib/errors";
import { fmtDuration } from "../../lib/utils";

const LEVEL_COPY = {
  1: "Matching shared interests & conversation style…",
  2: "Relaxing the age window a little…",
  3: "Broadening interests — staying on-language…",
  4: "Prioritizing language & region compatibility…",
  5: "Scanning everyone online for the best fit…",
};

export default function SearchingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const presence = usePresence();
  const [level, setLevel] = useState(1);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState(null);
  const [matched, setMatched] = useState(null);
  const startedRef = useRef(Date.now());

  // Start (or resume) the search exactly once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const st = await api.get("/matching/status");
        if (st.status !== "searching") {
          await api.post("/matching/search");
          startedRef.current = Date.now();
        } else {
          startedRef.current = Date.now() - st.elapsedMs;
          if (!cancelled) setLevel(st.level);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Couldn't join the queue.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Live queue events.
  useEffect(() => {
    const offStatus = onEvent("queue:status", (p) => {
      if (p.status === "searching" && p.level) setLevel(p.level);
    });
    const offMatch = onEvent("match:found", (p) => {
      setMatched(p);
    });
    return () => {
      offStatus();
      offMatch();
    };
  }, []);

  // Elapsed timer.
  useEffect(() => {
    const t = setInterval(() => setElapsed(Date.now() - startedRef.current), 1000);
    return () => clearInterval(t);
  }, []);

  // Transition to chat after the interstitial.
  useEffect(() => {
    if (!matched) return;
    const t = setTimeout(() => navigate(`/chat/${matched.conversation.id}`, { replace: true }), 1700);
    return () => clearTimeout(t);
  }, [matched, navigate]);

  const cancel = async () => {
    try {
      await api.post("/matching/cancel");
    } catch {
      /* best effort */
    }
    navigate("/home");
  };

  if (matched) {
    return <MatchInterstitial other={matched.other} sharedNames={matched.shared.map((s) => s.name)} />;
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-xl pb-10 text-center">
        <div className="mono-label mt-2 flex items-center justify-center gap-2 text-em">
          <LiveDot /> {presence.data?.count ?? "…"} members online
        </div>
        <h1 className="mt-3 font-display text-[38px] font-bold tracking-tight sm:text-[46px]">
          Finding someone<span className="anim-soft-pulse">…</span>
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-[15px] text-moss">{LEVEL_COPY[level]}</p>

        {/* radar */}
        <div className="relative mx-auto mt-10 h-64 w-64">
          {[0, 1, 2].map((i) => (
            <span key={i} className="radar-ring absolute inset-0 rounded-full border-2 border-em/50" style={{ animationDelay: `${i * 0.7}s` }} />
          ))}
          <div className="absolute inset-0 animate-[spin_3.2s_linear_infinite]">
            <div className="absolute left-1/2 top-1/2 h-1/2 w-[2.5px] origin-top -translate-x-1/2 rounded-full bg-gradient-to-b from-lime to-transparent" />
          </div>
          <div className="absolute inset-8 rounded-full border border-line bg-paper shadow-lift" />
          <div className="absolute inset-16 flex items-center justify-center rounded-full bg-ink text-lime">
            <IconRadar width={34} height={34} />
          </div>
          {/* orbiting interest chips */}
          {(user?.interests ?? []).slice(0, 4).map((interest, i) => (
            <div
              key={interest.id}
              className="anim-floaty absolute"
              style={{
                top: `${[4, 70, 18, 82][i]}%`,
                left: `${[68, 84, -6, 8][i]}%`,
                "--rot": `${[-8, 6, 4, -5][i]}deg`,
                animationDelay: `${i * 0.9}s`,
              }}
            >
              <span className="chip !cursor-default whitespace-nowrap !bg-ink !text-lime !border-pine shadow-pop">
                <IconSpark width={11} height={11} /> {interest.name}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-9 flex items-center justify-center gap-3">
          <Badge tone="dark">
            <Logo width={11} height={11} /> engine level {level} / 5
          </Badge>
          <Badge tone="gray">searching {fmtDuration(elapsed)}</Badge>
        </div>

        {error && <p className="anim-shake mt-5 rounded-xl border border-coral/40 bg-coral/8 px-4 py-3 text-[13.5px] font-bold text-coral">{error}</p>}

        <div className="mt-8 flex justify-center">
          <Button variant="ghost" size="lg" onClick={cancel}>
            <IconX width={16} height={16} /> Cancel search
          </Button>
        </div>
        <p className="mono-label mt-6 text-[9.5px] text-sage">
          fallback relaxes automatically · you'll never get a dead end while members are online
        </p>
      </div>
    </AppShell>
  );
}

function MatchInterstitial({ other, sharedNames }) {
  return (
    <div className="ambient noise relative flex min-h-screen items-center justify-center px-4">
      <div className="card anim-pop w-full max-w-sm p-8 text-center">
        <div className="mono-label mb-4 flex items-center justify-center gap-2 text-em">
          <LiveDot /> match found
        </div>
        <h1 className="font-display text-[34px] font-bold tracking-tight">You're connected!</h1>
        <div className="mt-6 flex justify-center">
          <Avatar name={other.username} hue={other.avatarHue} size={84} ring />
        </div>
        <div className="mt-4 font-display text-[24px] font-bold">{other.username}</div>
        <div className="mono-label mt-1 text-[10px] text-sage">{other.country} · {other.ageRange}</div>
        {sharedNames.length > 0 && (
          <div className="mt-4">
            <div className="mono-label mb-2 text-[9px] text-sage">you both like</div>
            <div className="flex flex-wrap justify-center gap-1.5">
              {sharedNames.map((n) => (
                <span key={n} className="chip chip-on !cursor-default">
                  <IconSpark width={11} height={11} /> {n}
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="mono-label mt-7 text-[10px] text-em">opening chat…</div>
      </div>
    </div>
  );
}
