import { Component, useEffect } from "react";
import { HashRouter, Routes, Route, Navigate, useLocation, Link } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./state/auth";
import { ToastProvider } from "./state/toast";
import { Button, Spinner } from "./components/ui";
import { Logo } from "./components/icons";
import WelcomePage from "./features/welcome/WelcomePage";
import { LoginPage, RegisterPage } from "./features/auth/AuthPages";
import HomePage from "./features/home/HomePage";
import SearchingPage from "./features/matching/SearchingPage";
import ChatPage from "./features/chat/ChatPage";
import ConnectionsPage from "./features/connections/ConnectionsPage";
import ProfilePage from "./features/profile/ProfilePage";
import SettingsPage from "./features/settings/SettingsPage";
import AdminPage from "./features/admin/AdminPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 4000 },
  },
});

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  return null;
}

function Splash() {
  return (
    <div className="ambient flex min-h-screen flex-col items-center justify-center gap-4">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink text-lime shadow-pop">
        <Logo width={30} height={30} />
      </span>
      <div className="flex items-center gap-2.5 text-moss">
        <Spinner className="h-4 w-4 text-em" />
        <span className="mono-label text-[10.5px]">tuning the frequency…</span>
      </div>
    </div>
  );
}

function ForbiddenPage() {
  return (
    <div className="ambient flex min-h-screen items-center justify-center px-4">
      <div className="card max-w-sm p-8 text-center">
        <div className="font-display text-[40px] font-bold text-coral">403</div>
        <h1 className="mt-1 font-display text-[20px] font-bold">Admins only</h1>
        <p className="mt-2 text-[13.5px] text-moss">Your account doesn't carry the <span className="font-mono text-[12px]">users:read</span> permission. Backend authorization blocks this regardless of the UI.</p>
        <Link to="/home"><Button variant="primary" className="mt-5 w-full">Back to home</Button></Link>
      </div>
    </div>
  );
}

function ProtectedRoute({ children, admin = false }) {
  const { status, user } = useAuth();
  if (status === "booting" || status === "authenticating" || status === "refreshing") return <Splash />;
  if (status !== "authenticated" || !user) return <Navigate to="/login" replace />;
  if (admin && user.role !== "admin") return <ForbiddenPage />;
  return children;
}

function PublicRoute({ children }) {
  const { status } = useAuth();
  if (status === "booting") return <Splash />;
  if (status === "authenticated") return <Navigate to="/home" replace />;
  return children;
}

function NotFoundPage() {
  return (
    <div className="ambient flex min-h-screen items-center justify-center px-4">
      <div className="card max-w-sm p-8 text-center">
        <div className="font-display text-[40px] font-bold text-em">404</div>
        <h1 className="mt-1 font-display text-[20px] font-bold">Off the frequency</h1>
        <p className="mt-2 text-[13.5px] text-moss">That page doesn't exist. The queue, however, is very real.</p>
        <Link to="/home"><Button variant="lime" className="mt-5 w-full">FIND SOMEONE</Button></Link>
      </div>
    </div>
  );
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="ambient flex min-h-screen items-center justify-center px-4">
          <div className="card max-w-md p-8 text-center">
            <div className="font-display text-[20px] font-bold">The frequency broke</div>
            <p className="mt-2 text-[13.5px] text-moss">An unexpected client error occurred. Reload to rejoin — your data is safe in the engine.</p>
            <Button variant="primary" className="mt-5" onClick={() => window.location.reload()}>Reload app</Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <HashRouter>
            <ErrorBoundary>
              <ScrollToTop />
              <Routes>
                <Route path="/" element={<WelcomePage />} />
                <Route path="/welcome" element={<WelcomePage />} />
                <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
                <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
                <Route path="/home" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
                <Route path="/match" element={<ProtectedRoute><SearchingPage /></ProtectedRoute>} />
                <Route path="/chat/:conversationId" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
                <Route path="/connections" element={<ProtectedRoute><ConnectionsPage /></ProtectedRoute>} />
                <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
                <Route path="/admin" element={<ProtectedRoute admin><AdminPage /></ProtectedRoute>} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </ErrorBoundary>
          </HashRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
