import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthPage } from '../features/auth/AuthPage';
import { useAuth } from '../features/auth/AuthProvider';
import { AppShell } from './AppShell';

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
      <Route path="/*" element={<ProtectedApp />} />
    </Routes>
  );
}

function ProtectedApp() {
  const { session } = useAuth();

  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  return <AppShell />;
}
