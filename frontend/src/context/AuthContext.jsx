import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken]           = useState(() => localStorage.getItem("accessToken") ?? "");
  const [currentUser, setCurrentUser] = useState(null);
  const [problems, setProblems]     = useState([]);
  const [examMode, setExamMode]     = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [authLoading, setAuthLoading]     = useState(false);
  const [authError, setAuthError]         = useState("");

  const navigate = useNavigate();

  // ── helpers ───────────────────────────────────────────────────────────────

  const loadSession = useCallback(async (currentToken, user) => {
    const list = await api("/api/problems", {
      headers: { Authorization: `Bearer ${currentToken}` },
    });
    setProblems(list?.data ?? []);

    if (user?.role !== "teacher") {
      const examRes = await api("/api/admin/exam-mode", {
        headers: { Authorization: `Bearer ${currentToken}` },
      }).catch(() => null);
      setExamMode(Boolean(examRes?.data?.enabled));
    }
  }, []);

  const refreshProblems = useCallback(async () => {
    if (!token) return;
    try {
      const list = await api("/api/problems", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setProblems(list?.data ?? []);
    } catch { /* ignore */ }
  }, [token]);

  // ── bootstrap ────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      setBootstrapping(true);
      setAuthError("");
      try {
        if (!token) return;
        const me = await api("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setCurrentUser(me);
        await loadSession(token, me);
      } catch (err) {
        // Try silent refresh if we have a refreshToken stored
        const refreshToken = localStorage.getItem("refreshToken");
        if (refreshToken) {
          try {
            const refreshed = await api("/api/auth/refresh", {
              method: "POST",
              body: JSON.stringify({ refreshToken }),
            });
            const newToken = refreshed.accessToken;
            localStorage.setItem("accessToken", newToken);
            setToken(newToken);
            const me = await api("/api/auth/me", {
              headers: { Authorization: `Bearer ${newToken}` },
            });
            setCurrentUser(me);
            await loadSession(newToken, me);
            return;
          } catch {
            // refresh also failed — fall through to clear session
          }
        }
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        setToken("");
        setCurrentUser(null);
        setAuthError(err.message || "Session initialization failed.");
      } finally {
        setBootstrapping(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── exam-mode polling (students only, every 10 s) ─────────────────────────

  useEffect(() => {
    if (!token || currentUser?.role === "teacher") return;
    const interval = setInterval(async () => {
      try {
        const res = await api("/api/admin/exam-mode", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setExamMode(Boolean(res?.data?.enabled));
      } catch { /* ignore */ }
    }, 10_000);
    return () => clearInterval(interval);
  }, [token, currentUser?.role]);

  // ── auth actions ──────────────────────────────────────────────────────────

  async function handleSignIn({ email, password }) {
    setAuthLoading(true);
    setAuthError("");
    try {
      const login = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      const nextToken   = login.accessToken;
      const refreshTok  = login.refreshToken;
      const user        = login.user ?? null;
      localStorage.setItem("accessToken",  nextToken);
      if (refreshTok) localStorage.setItem("refreshToken", refreshTok);
      setToken(nextToken);
      setCurrentUser(user);
      await loadSession(nextToken, user);
      navigate("/");
    } catch (err) {
      setAuthError(err.message || "Login failed.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleRegister({ name, email, password, role }) {
    setAuthLoading(true);
    setAuthError("");
    try {
      const registered = await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password, role }),
      });
      const nextToken  = registered.accessToken;
      const refreshTok = registered.refreshToken;
      const user       = registered.user ?? null;
      localStorage.setItem("accessToken",  nextToken);
      if (refreshTok) localStorage.setItem("refreshToken", refreshTok);
      setToken(nextToken);
      setCurrentUser(user);
      await loadSession(nextToken, user);
      navigate("/");
    } catch (err) {
      setAuthError(err.message || "Registration failed.");
    } finally {
      setAuthLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    setToken("");
    setCurrentUser(null);
    setProblems([]);
    setExamMode(false);
    navigate("/");
  }

  const value = {
    token,
    currentUser,
    problems,
    examMode,
    bootstrapping,
    authLoading,
    authError,
    setAuthError,
    handleSignIn,
    handleRegister,
    handleLogout,
    refreshProblems,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
