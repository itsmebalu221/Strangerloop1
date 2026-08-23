import { useEffect, useRef, useState } from "react";
import type { ReactNode, ButtonHTMLAttributes } from "react";
import { cx, initials, hueBg } from "../lib/utils";
import { IconX, IconWarn, IconRefresh } from "./icons";

/* ---------------- Button ---------------- */

type Variant = "primary" | "lime" | "ghost" | "danger" | "dark" | "outline" | "darkghost";

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg" | "xl"; loading?: boolean }) {
  const sizes = {
    sm: "px-3 py-1.5 text-[13px] gap-1.5",
    md: "px-4 py-2.5 text-[14.5px] gap-2",
    lg: "px-6 py-3 text-[15.5px] gap-2",
    xl: "px-8 py-4 text-[17px] gap-2.5",
  };
  const variants: Record<Variant, string> = {
    primary: "bg-ink text-mist hover:bg-pine border border-ink",
    lime: "bg-lime text-ink border border-limedeep/60 shadow-[0_6px_20px_-6px_rgba(168,201,47,0.65)]",
    ghost: "bg-transparent text-ink border border-line hover:border-ink/50 hover:bg-paper",
    outline: "bg-transparent text-mist border border-mist/25 hover:border-lime/60 hover:text-lime",
    danger: "bg-coral text-paper border border-coral hover:bg-[#d13a3f]",
    dark: "bg-paper text-ink border border-line hover:bg-mist",
    darkghost: "bg-white/5 text-mist border border-white/15 hover:border-lime/50 hover:text-lime",
  };
  return (
    <button
      disabled={disabled || loading}
      className={cx(
        "btn-press focus-ring inline-flex items-center justify-center rounded-full font-bold tracking-tight disabled:cursor-not-allowed disabled:opacity-50",
        sizes[size],
        variants[variant],
        className
      )}
      {...rest}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx("animate-spin", className)} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/* ---------------- Avatar ---------------- */

export function Avatar({ name, hue, size = 40, ring = false, online = false }: { name: string; hue: number; size?: number; ring?: boolean; online?: boolean }) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className={cx("flex h-full w-full items-center justify-center rounded-full font-display font-bold text-paper", ring && "ring-2 ring-lime ring-offset-2 ring-offset-ink")}
        style={{ background: hueBg(hue), fontSize: size * 0.38 }}
      >
        {initials(name)}
      </div>
      {online && (
        <span className="absolute -bottom-0.5 -right-0.5 block rounded-full border-2 border-paper bg-em" style={{ width: size * 0.3, height: size * 0.3 }} />
      )}
    </div>
  );
}

/* ---------------- Badge ---------------- */

const BADGE_TONES: Record<string, string> = {
  green: "bg-em/12 text-emdeep border-em/30",
  lime: "bg-lime/25 text-ink border-limedeep/50",
  red: "bg-coral/12 text-coral border-coral/30",
  amber: "bg-amberx/15 text-[#9a6414] border-amberx/40",
  gray: "bg-fog text-moss border-line",
  dark: "bg-ink text-lime border-ink",
  teal: "bg-tealx/12 text-tealx border-tealx/30",
};

export function Badge({ tone = "gray", children, className }: { tone?: keyof typeof BADGE_TONES; children: ReactNode; className?: string }) {
  return (
    <span className={cx("mono-label inline-flex items-center gap-1 rounded-full border px-2 py-[3px] normal-case", BADGE_TONES[tone], className)}>
      {children}
    </span>
  );
}

/* ---------------- Modal ---------------- */

export function Modal({ open, onClose, title, children, width = "max-w-md", dark = false }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: string; dark?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/60 p-4 backdrop-blur-[3px] sm:items-center" onMouseDown={onClose}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className={cx("anim-pop w-full rounded-2xl border shadow-pop", width, dark ? "border-white/15 bg-pine text-mist" : "border-line bg-paper")}
      >
        <div className={cx("flex items-center justify-between border-b px-5 py-4", dark ? "border-white/10" : "border-line")}>
          <h3 className="font-display text-[17px] font-bold">{title}</h3>
          <button onClick={onClose} className="focus-ring rounded-full p-1.5 opacity-60 transition hover:opacity-100">
            <IconX width={18} height={18} />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/* ---------------- Form field ---------------- */

export function Field({ label, error, hint, children }: { label: string; error?: string | null; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mono-label mb-1.5 block text-moss">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-[12px] text-sage">{hint}</span>}
      {error && (
        <span className="mt-1 flex items-center gap-1 text-[12.5px] font-semibold text-coral">
          <IconWarn width={13} height={13} /> {error}
        </span>
      )}
    </label>
  );
}

/* ---------------- Toggle ---------------- */

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="focus-ring flex items-center gap-3" aria-pressed={on}>
      <span className={cx("relative h-6 w-11 rounded-full border transition-colors", on ? "border-em bg-em" : "border-line bg-fog")}>
        <span className={cx("absolute top-[2.5px] h-[17px] w-[17px] rounded-full bg-paper shadow transition-all", on ? "left-[23px]" : "left-[3px]")} />
      </span>
      {label && <span className="text-[14px] font-semibold">{label}</span>}
    </button>
  );
}

/* ---------------- Empty / Error states ---------------- */

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="anim-fade-up flex flex-col items-center rounded-2xl border border-dashed border-line bg-paper/60 px-6 py-12 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-fog text-moss">{icon}</div>
      <div className="font-display text-[17px] font-bold">{title}</div>
      <p className="mt-1 max-w-xs text-[13.5px] text-moss">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="anim-fade-up flex flex-col items-center rounded-2xl border border-coral/30 bg-coral/5 px-6 py-10 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-coral/15 text-coral">
        <IconWarn width={22} height={22} />
      </div>
      <div className="font-display text-[16px] font-bold text-ink">Something went wrong</div>
      <p className="mt-1 max-w-sm text-[13.5px] text-moss">{message}</p>
      {onRetry && (
        <Button variant="ghost" size="sm" className="mt-4" onClick={onRetry}>
          <IconRefresh width={15} height={15} /> Try again
        </Button>
      )}
    </div>
  );
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-14 text-moss">
      <Spinner className="h-5 w-5 text-em" />
      <span className="mono-label">{label}</span>
    </div>
  );
}

/* ---------------- Scroll reveal ---------------- */

export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          obs.disconnect();
        }
      },
      { threshold: 0.12 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} className={cx("reveal", inView && "is-in", className)} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/* ---------------- Charts (dependency-free SVG) ---------------- */

export function Sparkline({ values, className, stroke = "var(--color-em)", fill = true }: { values: number[]; className?: string; stroke?: string; fill?: boolean }) {
  const w = 160;
  const h = 44;
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const pts = values.map((v, i) => [ (i / (values.length - 1)) * w, h - 4 - ((v - min) / (max - min || 1)) * (h - 8) ]);
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} preserveAspectRatio="none">
      {fill && <path d={`${path} L${w},${h} L0,${h} Z`} fill={stroke} opacity="0.1" />}
      <path d={path} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3" fill={stroke} />
    </svg>
  );
}

export function Bars({ values, labels, color = "var(--color-em)" }: { values: number[]; labels: string[]; color?: string }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex h-32 items-end gap-2">
      {values.map((v, i) => (
        <div key={i} className="group flex flex-1 flex-col items-center gap-1.5">
          <div className="relative w-full rounded-t-md transition-all duration-500 group-hover:opacity-80" style={{ height: `${Math.max(4, (v / max) * 100)}%`, background: color, opacity: 0.55 + 0.45 * (v / max) }}>
            <span className="mono-label absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] opacity-0 transition group-hover:opacity-100">{v}</span>
          </div>
          <span className="mono-label text-[9px] text-sage">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------------- misc ---------------- */

export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cx("relative inline-flex h-2.5 w-2.5", className)}>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-em opacity-60" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-em" />
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="mono-label rounded-md border border-line bg-mist px-1.5 py-0.5 text-[10px]">{children}</kbd>;
}
