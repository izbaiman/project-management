import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'
import { AppShell } from './App.jsx'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import { Spinner, ToastProvider } from './components/ui.jsx'
import { Login } from './pages/Login.jsx'
import { Dashboard } from './pages/Dashboard.jsx'
import { Board } from './pages/Board.jsx'
import { Backlog } from './pages/Backlog.jsx'
import { Team } from './pages/Team.jsx'
import { Evaluations } from './pages/Evaluations.jsx'
import { Teams } from './pages/Teams.jsx'

function Root() {
  const { user, loading } = useAuth()

  if (loading) return <div className="loading-page"><Spinner /></div>
  if (!user) return <Login />

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="team" element={<Team />} />
        <Route path="teams" element={<Teams />} />
        <Route path="evaluations" element={<Evaluations />} />
        <Route path="projects/:projectId/board" element={<Board />} />
        <Route path="projects/:projectId/backlog" element={<Backlog />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Root />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
)
