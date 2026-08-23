import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { onEvent } from "../api/realtime";
import { useAuth } from "../state/auth";
import { useToast } from "../state/toast";
import { cx, timeAgo } from "../lib/utils";
import type { NotificationRecord } from "../lib/types";
import { Avatar, Badge, LiveDot } from "./ui";
import { Logo, IconBell, IconGear, IconLogout, IconGavel, IconChevronDown } from "./icons";

function useOutside(onOut: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOut();
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [onOut]);
  return ref;
}

export function usePresence() {
  const qc = useQueryClient();
  useEffect(() => onEvent("presence:update", () => qc.invalidateQueries({ queryKey: ["presence"] })), [qc]);
  return useQuery({
    queryKey: ["presence"],
    queryFn: () => api.get<{ count: number; online: import("../lib/types").PublicUser[] }>("/presence"),
    refetchInterval: 25_000,
    staleTime: 10_000,
  });
}

function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const ref = useOutside(() => setOpen(false));
  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<{ items: NotificationRecord[] }>("/notifications"),
    refetchInterval: 30_000,
  });
  useEffect(() => onEvent("notification:new", () => qc.invalidateQueries({ queryKey: ["notifications"] })), [qc]);

  const markAll = useMutation({
    mutationFn: () => api.post("/notifications/read-all"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const markOne = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const items = data?.items ?? [];
  const unread = items.filter((n) => !n.read).length;

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="focus-ring relative rounded-full border border-line bg-paper p-2.5 text-ink transition hover:border-em hover:text-em">
        <IconBell width={18} height={18} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-coral px-1 text-[10px] font-bold text-paper">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="anim-pop absolute right-0 top-full z-50 mt-2 w-[min(90vw,360px)] overflow-hidden rounded-xl border border-line bg-paper shadow-pop">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="font-display text-[14px] font-bold">Notifications</span>
            {unread > 0 && (
              <button onClick={() => markAll.mutate()} className="mono-label text-em hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[380px] overflow-y-auto">
            {items.length === 0 && <p className="px-4 py-8 text-center text-[13px] text-sage">Nothing yet — connections and updates land here.</p>}
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => !n.read && markOne.mutate(n.id)}
                className={cx("block w-full border-b border-line/60 px-4 py-3 text-left transition last:border-0 hover:bg-mist", !n.read && "bg-lime/10")}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={cx("text-[13.5px] font-bold", n.read ? "text-moss" : "text-ink")}>{n.title}</span>
                  <span className="mono-label shrink-0 text-[9.5px] text-sage">{timeAgo(n.createdAt)}</span>
                </div>
                <p className="mt-0.5 text-[12.5px] leading-snug text-moss">{n.body}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { user, logout, logoutAll } = useAuth();
  const { push } = useToast();
  const ref = useOutside(() => setOpen(false));
  if (!user) return null;

  const doLogout = async (all: boolean) => {
    setOpen(false);
    if (all) await logoutAll();
    else await logout();
    push("info", "Signed out", all ? "All devices were signed out." : "See you on the frequency.");
    navigate("/");
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="focus-ring flex items-center gap-2 rounded-full border border-line bg-paper py-1 pl-1 pr-2.5 transition hover:border-em">
        <Avatar name={user.username} hue={user.avatarHue} size={30} />
        <span className="hidden text-[13.5px] font-bold sm:block">{user.username}</span>
        <IconChevronDown width={14} height={14} className={cx("text-sage transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="anim-pop absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-paper shadow-pop">
          <div className="border-b border-line px-4 py-3">
            <div className="text-[13.5px] font-bold">{user.username}</div>
            <div className="mono-label mt-0.5 text-[9.5px] text-sage">{user.email}</div>
          </div>
          <MenuItem onClick={() => { setOpen(false); navigate("/settings"); }} icon={<IconGear width={16} height={16} />} label="Settings" />
          {user.role === "admin" && <MenuItem onClick={() => { setOpen(false); navigate("/admin"); }} icon={<IconGavel width={16} height={16} />} label="Admin console" />}
          <MenuItem onClick={() => doLogout(false)} icon={<IconLogout width={16} height={16} />} label="Log out" />
          <MenuItem onClick={() => doLogout(true)} icon={<IconLogout width={16} height={16} />} label="Log out everywhere" danger />
        </div>
      )}
    </div>
  );
}

function MenuItem({ onClick, icon, label, danger }: { onClick: () => void; icon: ReactNode; label: string; danger?: boolean }) {
  return (
    <button onClick={onClick} className={cx("flex w-full items-center gap-3 px-4 py-2.5 text-[13.5px] font-semibold transition hover:bg-mist", danger ? "text-coral" : "text-ink")}>
      <span className={danger ? "text-coral" : "text-moss"}>{icon}</span>
      {label}
    </button>
  );
}

const navLink = ({ isActive }: { isActive: boolean }) =>
  cx(
    "focus-ring rounded-full px-4 py-2 text-[13.5px] font-bold transition",
    isActive ? "bg-ink text-lime" : "text-moss hover:bg-fog hover:text-ink"
  );

export function AppShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  const presence = usePresence();
  return (
    <div className="ambient noise relative min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line/80 bg-mist/85 backdrop-blur-md">
        <div className={cx("mx-auto flex h-16 items-center justify-between gap-3 px-4 sm:px-6", wide ? "max-w-7xl" : "max-w-6xl")}>
          <Link to="/home" className="focus-ring flex items-center gap-2 rounded-full">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink text-lime">
              <Logo width={20} height={20} />
            </span>
            <span className="font-display text-[19px] font-bold tracking-tight">wavelength</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            <NavLink to="/home" className={navLink} end>
              Meet
            </NavLink>
            <NavLink to="/connections" className={navLink}>
              Connections
            </NavLink>
            <NavLink to="/profile" className={navLink}>
              Profile
            </NavLink>
          </nav>

          <div className="flex items-center gap-2.5">
            <div className="mr-1 hidden items-center gap-2 rounded-full border border-line bg-paper px-3 py-1.5 sm:flex" title="Members online now">
              <LiveDot />
              <span className="mono-label text-[10px] text-moss">{presence.data?.count ?? "…"} online</span>
            </div>
            <NotificationsBell />
            <UserMenu />
          </div>
        </div>
        <nav className="flex items-center gap-1 border-t border-line/60 px-4 py-2 md:hidden">
          <NavLink to="/home" className={navLink} end>
            Meet
          </NavLink>
          <NavLink to="/connections" className={navLink}>
            Connections
          </NavLink>
          <NavLink to="/profile" className={navLink}>
            Profile
          </NavLink>
        </nav>
      </header>
      <main className={cx("mx-auto px-4 py-8 sm:px-6", wide ? "max-w-7xl" : "max-w-6xl")}>{children}</main>
      <footer className="mx-auto max-w-6xl px-6 pb-8 pt-4 text-center">
        <p className="mono-label text-[10px] text-sage">
          wavelength · adults only · <Link to="/settings?tab=safety" className="underline decoration-line hover:text-em">community guidelines</Link> · embedded-engine build
        </p>
      </footer>
    </div>
  );
}


