import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { ApiError } from "../../lib/errors";
import { useAuth } from "../../state/auth";
import { useToast } from "../../state/toast";
import { Button, Field } from "../../components/ui";
import { Logo, IconArrowLeft, IconChevronRight, IconKey, IconCheck, IconEye } from "../../components/icons";
import { ageFromDob, cx } from "../../lib/utils";

const COUNTRIES = ["India", "United States", "United Kingdom", "Germany", "Japan", "Brazil", "Singapore", "Canada", "Spain", "Turkey", "Nigeria", "UAE", "Australia", "France"];
const GENDERS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "nonbinary", label: "Non-binary / Other" },
  { value: "undisclosed", label: "Prefer not to say" },
];

function AuthFrame({ children, side }) {
  return (
    <div className="ambient noise relative flex min-h-screen">
      <div className="relative hidden w-[44%] flex-col justify-between overflow-hidden bg-ink p-10 text-mist lg:flex">
        <div className="dotgrid pointer-events-none absolute inset-0 opacity-[0.15]" />
        <Link to="/" className="relative flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-lime text-ink">
            <Logo width={22} height={22} />
          </span>
          <span className="font-display text-[21px] font-bold">wavelength</span>
        </Link>
        <div className="relative">{side}</div>
        <p className="mono-label relative text-[10px] text-mist/40">adults only · blocks & reports enforced server-side</p>
      </div>
      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <div className="anim-fade-up w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}

function errText(e) {
  if (e instanceof ApiError) return e.message;
  return "Something went wrong — try again";
}

/* ================= LOGIN ================= */

export function LoginPage() {
  const { status, login } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState("login");
  const [forgotNote, setForgotNote] = useState(null);
  const [devToken, setDevToken] = useState(null);
  const [newPassword, setNewPassword] = useState("");

  if (status === "authenticated") return <Navigate to="/home" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const u = await login(email, password);
      push("success", `Welcome back, ${u.username}`, "You're on the frequency.");
      navigate("/home");
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post("/auth/forgot-password", { email });
      setForgotNote(r.note);
      setDevToken(r.devToken);
      if (r.devToken) setMode("reset");
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/reset-password", { token: devToken, password: newPassword });
      push("success", "Password updated", "All sessions were signed out. Log in with your new password.");
      setMode("login");
      setPassword("");
      setNewPassword("");
      setDevToken(null);
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame
      side={
        <div>
          <h2 className="font-display text-[34px] font-bold leading-tight">
            The queue is <span className="text-lime">live</span>.
            <br />
            Your frequency is waiting.
          </h2>
          <p className="mt-4 max-w-sm text-[14.5px] leading-relaxed text-mist/65">
            Sign back in to rejoin matching with your interests, preferences and connections exactly as you left them.
          </p>
        </div>
      }
    >
      <Link to="/" className="mb-6 inline-flex items-center gap-2 text-[13px] font-bold text-moss hover:text-ink lg:hidden">
        <IconArrowLeft width={15} height={15} /> wavelength
      </Link>
      <div className="card p-7 sm:p-8">
        <h1 className="font-display text-[26px] font-bold tracking-tight">
          {mode === "login" ? "Welcome back" : mode === "forgot" ? "Reset your password" : "Choose a new password"}
        </h1>
        <p className="mt-1 text-[13.5px] text-moss">
          {mode === "login" ? "Log in to find your next conversation." : mode === "forgot" ? "We'll email you a one-time reset link." : "One-time link verified — set a strong new password."}
        </p>

        {error && <div className="anim-shake mt-4 rounded-xl border border-coral/40 bg-coral/8 px-4 py-3 text-[13px] font-semibold text-coral">{error}</div>}
        {forgotNote && mode === "forgot" && <div className="mt-4 rounded-xl border border-em/40 bg-em/8 px-4 py-3 text-[13px] font-semibold text-emdeep">{forgotNote}</div>}

        {mode === "login" && (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field label="Email">
              <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
            </Field>
            <Field label="Password">
              <div className="relative">
                <input className="input pr-11" type={showPw ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
                <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-sage hover:text-ink">
                  <IconEye width={17} height={17} />
                </button>
              </div>
            </Field>
            <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
              Log in <IconChevronRight width={16} height={16} />
            </Button>
            <div className="flex items-center justify-between text-[13px] font-semibold">
              <button type="button" onClick={() => { setMode("forgot"); setError(null); }} className="text-em hover:underline">Forgot password?</button>
              <Link to="/register" className="text-moss hover:text-ink">Create account →</Link>
            </div>
          </form>
        )}

        {mode === "forgot" && (
          <div className="mt-6 space-y-4">
            <Field label="Email">
              <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </Field>
            <Button variant="primary" size="lg" className="w-full" loading={busy} onClick={forgot}>
              <IconKey width={16} height={16} /> Send reset link
            </Button>
            <button onClick={() => setMode("login")} className="w-full text-center text-[13px] font-semibold text-moss hover:text-ink">← Back to log in</button>
          </div>
        )}

        {mode === "reset" && (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-amberx/50 bg-amberx/10 px-4 py-3 text-[12px] font-semibold text-[#8a5a12]">
              No email provider in this embedded build — your one-time token was issued directly. It expires in 30 minutes and works once.
            </div>
            <Field label="New password" hint="8+ characters, at least one letter and one number">
              <input className="input" type="password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New strong password" />
            </Field>
            <Button variant="primary" size="lg" className="w-full" loading={busy} onClick={reset}>
              <IconCheck width={16} height={16} /> Update password
            </Button>
            <button onClick={() => setMode("login")} className="w-full text-center text-[13px] font-semibold text-moss hover:text-ink">← Back to log in</button>
          </div>
        )}
      </div>

      <div className="card mt-4 border-dashed p-4">
        <div className="mono-label mb-2.5 text-[9.5px] text-sage">dev seeds · embedded engine</div>
        <div className="flex flex-wrap gap-2">
          <button
            className="chip"
            onClick={() => { setMode("login"); setEmail("aarav@demo.dev"); setPassword("Aarav#1234"); setError(null); }}
          >
            member · aarav@demo.dev
          </button>
          <button
            className="chip"
            onClick={() => { setMode("login"); setEmail("admin@demo.dev"); setPassword("Admin#2026"); setError(null); }}
          >
            admin · admin@demo.dev
          </button>
        </div>
      </div>
    </AuthFrame>
  );
}

/* ================= REGISTER ================= */

const STEPS = ["Account", "Your signal", "Preferences"];

export function RegisterPage() {
  const { status, register } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const reference = useQuery({ queryKey: ["reference"], queryFn: () => api.get("/reference") });

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [f, setF] = useState({ email: "", username: "", password: "", dob: "", gender: "", country: "", bio: "" });
  const [interests, setInterests] = useState([]);
  const [langs, setLangs] = useState([]);
  const [cts, setCts] = useState([]);
  const [genders, setGenders] = useState(["anyone"]);
  const [ageMin, setAgeMin] = useState(18);
  const [ageMax, setAgeMax] = useState(34);

  const ref = reference.data;
  const age = f.dob ? ageFromDob(f.dob) : null;

  const byCategory = useMemo(() => {
    const map = new Map();
    for (const i of ref?.interests ?? []) {
      if (!map.has(i.category)) map.set(i.category, []);
      map.get(i.category).push(i);
    }
    return [...map.entries()];
  }, [ref]);

  if (status === "authenticated") return <Navigate to="/home" replace />;

  const toggle = (arr, set, id, max = 12) => {
    if (arr.includes(id)) set(arr.filter((x) => x !== id));
    else if (arr.length < max) set([...arr, id]);
  };

  const next = () => {
    setError(null);
    if (step === 0) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email)) return setError("Enter a valid email address.");
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(f.username)) return setError("Username: 3–20 letters, numbers or underscores.");
      if (f.password.length < 8 || !/[a-zA-Z]/.test(f.password) || !/\d/.test(f.password)) return setError("Password needs 8+ characters with a letter and a number.");
      if (age === null) return setError("Date of birth is required.");
      if (age < 18) return setError("Wavelength is for adults — you must be 18 or older.");
      if (!f.gender) return setError("Pick the option that fits you best.");
      if (!f.country) return setError("Pick your country.");
    }
    if (step === 1) {
      if (interests.length < 1) return setError("Pick at least one interest (3+ recommended).");
      if (langs.length < 1) return setError("Pick at least one language.");
      if (cts.length < 1) return setError("Pick at least one conversation type.");
    }
    setStep((s) => s + 1);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await register({
        email: f.email,
        password: f.password,
        username: f.username,
        dob: f.dob,
        gender: f.gender,
        country: f.country,
        bio: f.bio || undefined,
        interestIds: interests,
        languageIds: langs,
        convTypeIds: cts,
      });
      push("success", "Profile live 🎉", "Preferences saved — go find someone.");
      navigate("/home");
    } catch (e) {
      setError(errText(e));
      if (e instanceof ApiError && /email|username/i.test(e.message)) setStep(0);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ambient noise relative min-h-screen">
      <header className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink text-lime">
            <Logo width={20} height={20} />
          </span>
          <span className="font-display text-[19px] font-bold">wavelength</span>
        </Link>
        <Link to="/login" className="text-[13.5px] font-bold text-moss hover:text-ink">Log in →</Link>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-20 sm:px-6">
        {/* stepper */}
        <div className="mb-8 flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex flex-1 items-center gap-2">
              <span
                className={cx(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 font-display text-[13px] font-bold transition",
                  i < step ? "border-em bg-em text-paper" : i === step ? "border-ink bg-ink text-lime" : "border-line bg-paper text-sage"
                )}
              >
                {i < step ? <IconCheck width={14} height={14} /> : i + 1}
              </span>
              <span className={cx("mono-label hidden text-[9.5px] sm:block", i === step ? "text-ink" : "text-sage")}>{s}</span>
              {i < STEPS.length - 1 && <div className={cx("h-0.5 flex-1 rounded", i < step ? "bg-em" : "bg-line")} />}
            </div>
          ))}
        </div>

        <div className="card p-6 sm:p-9">
          {error && <div className="anim-shake mb-5 rounded-xl border border-coral/40 bg-coral/8 px-4 py-3 text-[13px] font-semibold text-coral">{error}</div>}

          {step === 0 && (
            <div className="anim-fade-up space-y-5">
              <div>
                <h1 className="font-display text-[28px] font-bold tracking-tight">Create your signal</h1>
                <p className="mt-1 text-[14px] text-moss">Strangers see your username, age range and interests — never your email or exact birthday.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Email">
                  <input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="you@example.com" />
                </Field>
                <Field label="Username" hint="3–20 chars · this is your public identity">
                  <input className="input" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} placeholder="e.g. nightly_coder" />
                </Field>
                <Field label="Password" hint="8+ chars, letter + number">
                  <input className="input" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder="••••••••" />
                </Field>
                <Field label="Date of birth" error={age !== null && age < 18 ? "You must be 18 or older" : null}>
                  <input className="input" type="date" value={f.dob} max={new Date(Date.now() - 18 * 365.25 * 86400000).toISOString().slice(0, 10)} onChange={(e) => setF({ ...f, dob: e.target.value })} />
                </Field>
                <Field label="Gender">
                  <select className="input" value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}>
                    <option value="">Select…</option>
                    {GENDERS.map((g) => (
                      <option key={g.value} value={g.value}>{g.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Country">
                  <select className="input" value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })}>
                    <option value="">Select…</option>
                    {COUNTRIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Bio (optional)" hint="Shown on your public profile · max 240 chars">
                <textarea className="input min-h-[74px] resize-none" maxLength={240} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} placeholder="One line about what you're into…" />
              </Field>
              <div className="flex justify-end">
                <Button variant="lime" size="lg" onClick={next}>
                  Continue <IconChevronRight width={16} height={16} />
                </Button>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="anim-fade-up space-y-7">
              <div>
                <h1 className="font-display text-[28px] font-bold tracking-tight">What's your frequency?</h1>
                <p className="mt-1 text-[14px] text-moss">
                  Interests power the match score. Pick <strong>3–10</strong> for the best matches ·{" "}
                  <span className={cx("font-bold", interests.length >= 3 ? "text-em" : "text-amberx")}>{interests.length} selected</span>
                </p>
              </div>
              {byCategory.map(([cat, list]) => (
                <div key={cat}>
                  <div className="mono-label mb-2 text-[9.5px] text-sage">{cat}</div>
                  <div className="flex flex-wrap gap-2">
                    {list.map((i) => (
                      <button key={i.id} className={cx("chip", interests.includes(i.id) && "chip-on")} onClick={() => toggle(interests, setInterests, i.id)}>
                        {interests.includes(i.id) && <IconCheck width={12} height={12} />}
                        {i.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <div className="mono-label mb-2 text-[9.5px] text-sage">Languages you speak</div>
                  <div className="flex flex-wrap gap-2">
                    {(ref?.languages ?? []).map((l) => (
                      <button key={l.id} className={cx("chip", langs.includes(l.id) && "chip-on")} onClick={() => toggle(langs, setLangs, l.id, 6)}>
                        {l.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mono-label mb-2 text-[9.5px] text-sage">Conversation types</div>
                  <div className="flex flex-wrap gap-2">
                    {(ref?.conversationTypes ?? []).map((c) => (
                      <button key={c.id} className={cx("chip", cts.includes(c.id) && "chip-on")} onClick={() => toggle(cts, setCts, c.id, 6)}>
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex justify-between">
                <Button variant="ghost" size="lg" onClick={() => setStep(0)}>
                  <IconArrowLeft width={16} height={16} /> Back
                </Button>
                <Button variant="lime" size="lg" onClick={next}>
                  Continue <IconChevronRight width={16} height={16} />
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="anim-fade-up space-y-7">
              <div>
                <h1 className="font-display text-[28px] font-bold tracking-tight">Who do you want to meet?</h1>
                <p className="mt-1 text-[14px] text-moss">These preferences shape your queue. You can retune them anytime in Settings.</p>
              </div>
              <div>
                <div className="mono-label mb-2 text-[9.5px] text-sage">Gender preference</div>
                <div className="flex flex-wrap gap-2">
                  {[["anyone", "Anyone"], ["male", "Male"], ["female", "Female"], ["nonbinary", "Other"]].map(([v, l]) => (
                    <button
                      key={v}
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
                <div className="mono-label mb-2 text-[9.5px] text-sage">Age range · {ageMin}–{ageMax === 60 ? "60+" : ageMax}</div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="From">
                    <input className="input" type="number" min={18} max={ageMax} value={ageMin} onChange={(e) => setAgeMin(Math.max(18, Math.min(Number(e.target.value) || 18, ageMax)))} />
                  </Field>
                  <Field label="To">
                    <input className="input" type="number" min={ageMin} max={60} value={ageMax} onChange={(e) => setAgeMax(Math.min(60, Math.max(Number(e.target.value) || 60, ageMin)))} />
                  </Field>
                </div>
              </div>
              <div className="rounded-xl border border-em/30 bg-em/6 px-4 py-3 text-[13px] font-semibold text-emdeep">
                {interests.length} interests · {langs.length} languages · {cts.length} conversation types — locked in.
              </div>
              <div className="flex justify-between">
                <Button variant="ghost" size="lg" onClick={() => setStep(1)}>
                  <IconArrowLeft width={16} height={16} /> Back
                </Button>
                <Button variant="lime" size="lg" loading={busy} onClick={submit}>
                  Join the queue →
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
