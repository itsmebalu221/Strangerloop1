import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { cx } from "../lib/utils";

export type ToastKind = "success" | "error" | "info" | "warn";

interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
}

interface ToastContextValue {
  push: (kind: ToastKind, title: string, body?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 1;

const KIND_STYLES: Record<ToastKind, string> = {
  success: "border-em/40 bg-em text-paper",
  error: "border-coral/40 bg-coral text-paper",
  warn: "border-amberx/50 bg-ink text-lime",
  info: "border-pine/30 bg-ink text-paper",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: ToastKind, title: string, body?: string) => {
    const id = nextId++;
    setToasts((t) => [...t.slice(-3), { id, kind, title, body }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4600);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[90] flex w-[min(92vw,360px)] flex-col gap-2">
        {toasts.map((t) => (
          <button
            key={t.id}
            onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
            className={cx(
              "anim-slide-right pointer-events-auto rounded-xl border px-4 py-3 text-left shadow-pop backdrop-blur transition-transform hover:scale-[1.01]",
              KIND_STYLES[t.kind]
            )}
          >
            <div className="text-[14px] font-bold leading-tight">{t.title}</div>
            {t.body && <div className="mt-0.5 text-[12.5px] leading-snug opacity-85">{t.body}</div>}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
