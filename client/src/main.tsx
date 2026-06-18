import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { AuthProvider } from './contexts/AuthContext.tsx'
import AdminLogin from './components/Admin/AdminLogin.tsx'
import AdminApp from './components/Admin/AdminApp.tsx'
import './index.css'

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
      <AdminRoot />
    ) : (
      <AuthProvider>
        <App />
      </AuthProvider>
    )}
  </React.StrictMode>,
)
