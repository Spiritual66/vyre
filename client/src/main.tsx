import React, { useState, lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { AuthProvider } from './contexts/AuthContext.tsx'
import './index.css'

// Admin panel is only needed on /admin — code-split so normal users never download it.
const AdminLogin = lazy(() => import('./components/Admin/AdminLogin.tsx'))
const AdminApp = lazy(() => import('./components/Admin/AdminApp.tsx'))

function AdminRoot() {
  const [adminToken, setAdminToken] = useState<string | null>(() => {
    const t = localStorage.getItem('admin_token');
    if (!t) return null;
    // Basic JWT expiry check (decode payload)
    try {
      const payload = JSON.parse(atob(t.split('.')[1]));
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        localStorage.removeItem('admin_token');
        return null;
      }
      if (payload.role !== 'admin') { localStorage.removeItem('admin_token'); return null; }
      return t;
    } catch {
      localStorage.removeItem('admin_token');
      return null;
    }
  });

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    setAdminToken(null);
  };

  if (!adminToken) return <AdminLogin onLogin={setAdminToken} />;
  return <AdminApp onLogout={handleLogout} />;
}

const isAdmin = window.location.pathname.startsWith('/admin');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isAdmin ? (
      <Suspense fallback={null}><AdminRoot /></Suspense>
    ) : (
      <AuthProvider>
        <App />
      </AuthProvider>
    )}
  </React.StrictMode>,
)
