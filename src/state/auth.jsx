import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, getTokens, clearTokens, onSessionExpired, authEngine } from "../api/client";
import { connectSocket, disconnectSocket } from "../api/realtime";

/* Auth status: booting | unauthenticated | authenticating | authenticated | refreshing | logging_out */

const AuthContext = createContext(null);

async function handshake() {
  const tokens = getTokens();
  if (tokens) {
    await connectSocket(tokens.accessToken, authEngine.verifyAccess);
  }
}

export function AuthProvider({ children }) {
  const [status, setStatus] = useState("booting");
  const [user, setUserState] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const tokens = getTokens();
      if (!tokens) {
        if (!cancelled) setStatus("unauthenticated");
        return;
      }
      try {
        const { user: me } = await api.get("/auth/me");
        if (cancelled) return;
        setUserState(me);
        setStatus("authenticated");
        await handshake();
      } catch {
        if (!cancelled) {
          clearTokens();
          setStatus("unauthenticated");
        }
      }
    })();
    const off = onSessionExpired(() => {
      disconnectSocket();
      setUserState(null);
      setStatus("unauthenticated");
    });
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  const login = useCallback(async (email, password) => {
    setStatus("authenticating");
    try {
      const { user: u } = await api.post("/auth/login", { email, password });
      setUserState(u);
      setStatus("authenticated");
      await handshake();
      return u;
    } catch (e) {
      setStatus("unauthenticated");
      throw e;
    }
  }, []);

  const register = useCallback(async (input) => {
    setStatus("authenticating");
    try {
      const { user: u } = await api.post("/auth/register", input);
      setUserState(u);
      setStatus("authenticated");
      await handshake();
      return u;
    } catch (e) {
      setStatus("unauthenticated");
      throw e;
    }
  }, []);

  const logout = useCallback(async () => {
    setStatus("logging_out");
    try {
      await api.post("/auth/logout");
    } finally {
      disconnectSocket();
      setUserState(null);
      setStatus("unauthenticated");
    }
  }, []);

  const logoutAll = useCallback(async () => {
    setStatus("logging_out");
    try {
      await api.post("/auth/logout-all");
    } finally {
      disconnectSocket();
      setUserState(null);
      setStatus("unauthenticated");
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const { user: me } = await api.get("/auth/me");
      setUserState(me);
    } catch {
      /* session expired path is handled by the client */
    }
  }, []);

  const value = useMemo(
    () => ({ status, user, login, register, logout, logoutAll, refreshUser, setUser: setUserState }),
    [status, user, login, register, logout, logoutAll, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
