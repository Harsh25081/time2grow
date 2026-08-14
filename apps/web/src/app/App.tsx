import { useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthPage } from "../features/auth/AuthPage";
import { useAuth } from "../features/auth/AuthProvider";
import { AppShell } from "./AppShell";
import { PublicInfoPage } from "./PublicInfoPage";

export function App() {
  const { loading } = useAuth();

  if (loading) {
    return (
      <main className="loading-screen">
        <div className="brand-mark">t2g</div>
        <p>Loading time2grow</p>
      </main>
    );
  }

  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/privacy" element={<PublicInfoPage kind="privacy" />} />
      <Route path="/terms" element={<PublicInfoPage kind="terms" />} />
      <Route path="/support" element={<PublicInfoPage kind="support" />} />
      <Route path="/*" element={<ProtectedApp />} />
    </Routes>
  );
}

function ProtectedApp() {
  const { session, bootstrapError, refreshWorkspace, signOut } = useAuth();

  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  if (bootstrapError) {
    return (
      <WorkspaceLoadError
        message={bootstrapError}
        onRetry={refreshWorkspace}
        onSignOut={signOut}
      />
    );
  }

  return <AppShell />;
}

function WorkspaceLoadError({
  message,
  onRetry,
  onSignOut,
}: {
  message: string;
  onRetry: () => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const [retrying, setRetrying] = useState(false);

  async function retry() {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  }

  return (
    <main className="loading-screen">
      <div className="brand-mark">t2g</div>
      <h1>We could not load your workspace</h1>
      <p className="form-message error">{message}</p>
      <div className="composer-actions">
        <button
          className="primary-action"
          type="button"
          onClick={retry}
          disabled={retrying}
        >
          {retrying ? "Retrying" : "Try again"}
        </button>
        <button className="icon-text-button" type="button" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </main>
  );
}
