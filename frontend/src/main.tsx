import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import Dashboard    from './pages/Dashboard'
import Flows        from './pages/Flows'
import FlowEditor   from './pages/FlowEditor'
import Sources      from './pages/Sources'
import SourceDetail from './pages/SourceDetail'
import Login        from './pages/Login'

import './index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000 } },
})

function Nav() {
  const { user, logout } = useAuth()
  return (
    <nav className="nav">
      <div className="nav-brand">
        <span className="nav-logo">⬡</span>
        <span className="nav-name">THREATFLOW</span>
        <span className="nav-ver"> v0.1</span>
      </div>
      <div className="nav-links">
        <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Dashboard</NavLink>
        <NavLink to="/sources" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Sorgenti</NavLink>
        <NavLink to="/flows" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Flow Editor</NavLink>
      </div>
      <div className="nav-status">
        <span className="status-dot" />
        <span className="status-txt">pipeline live</span>
        {user && (
          <>
            <span style={{ width: 1, height: 16, background: 'var(--bd1)', margin: '0 8px' }} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t2)' }}>{user.display_name}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--cyan)', background: 'var(--cyanx)', border: '1px solid rgba(0,212,255,.2)', borderRadius: 2, padding: '1px 6px' }}>{user.role}</span>
            <button onClick={logout} style={{ background: 'none', border: '1px solid var(--bd1)', borderRadius: 2, padding: '3px 8px', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t3)', cursor: 'pointer', marginLeft: 4 }}>logout</button>
          </>
        )}
      </div>
    </nav>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', fontFamily:'var(--mono)', color:'var(--t3)' }}>autenticazione...</div>
  return user ? <>{children}</> : <Navigate to="/login" replace />
}

function AppRoutes() {
  const { user } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<ProtectedRoute><Nav /><Dashboard /></ProtectedRoute>} />
      <Route path="/sources" element={<ProtectedRoute><Nav /><Sources /></ProtectedRoute>} />
      <Route path="/sources/:id" element={<ProtectedRoute><Nav /><SourceDetail /></ProtectedRoute>} />
      <Route path="/flows" element={<ProtectedRoute><Nav /><Flows /></ProtectedRoute>} />
      <Route path="/flows/:id" element={<ProtectedRoute><Nav /><FlowEditor /></ProtectedRoute>} />
    </Routes>

  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
