import { useCallback, useEffect, useState } from 'react'
import { Link, Outlet, useNavigate } from 'react-router-dom'
import { api } from './api.js'
import { useAuth } from './context/AuthContext.jsx'
import { Sidebar } from './components/Sidebar.jsx'
import { Avatar, Modal, Spinner, useTheme, useToast } from './components/ui.jsx'

function AccountMenu() {
  const { user, logout } = useAuth()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [changing, setChanging] = useState(false)
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [error, setError] = useState('')

  const submit = async e => {
    e.preventDefault()
    if (form.next !== form.confirm) return setError('The new passwords do not match')
    if (form.next.length < 8) return setError('Use at least 8 characters')
    try {
      await api.changePassword(form.current, form.next)
      toast.show('Password updated')
      setChanging(false)
      setForm({ current: '', next: '', confirm: '' })
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <>
      <button
        className="btn btn-ghost"
        onClick={() => setOpen(o => !o)}
        title={`${user.full_name} — ${user.job_title}`}
      >
        <Avatar name={user.full_name} color={user.avatar_color} size="md" />
      </button>

      {open && (
        <Modal title="Your account" onClose={() => setOpen(false)}>
          <div className="row mb-12">
            <Avatar name={user.full_name} color={user.avatar_color} size="xl" />
            <div>
              <h2>{user.full_name}</h2>
              <div className="muted">{user.job_title}</div>
              <div className="tiny dim">{user.department} · {user.email}</div>
              <span className="badge badge-accent mt-8">{user.role}</span>
            </div>
          </div>

          {changing ? (
            <form onSubmit={submit}>
              {error && <div className="error-banner">{error}</div>}
              <div className="field">
                <label htmlFor="cur">Current password</label>
                <input id="cur" className="input" type="password" value={form.current}
                  onChange={e => setForm(f => ({ ...f, current: e.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="new">New password</label>
                <input id="new" className="input" type="password" value={form.next}
                  onChange={e => setForm(f => ({ ...f, next: e.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="conf">Confirm new password</label>
                <input id="conf" className="input" type="password" value={form.confirm}
                  onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))} />
              </div>
              <div className="row">
                <button className="btn btn-primary">Update password</button>
                <button type="button" className="btn btn-ghost" onClick={() => setChanging(false)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="row">
              <button className="btn" onClick={() => setChanging(true)}>Change password</button>
              <button className="btn btn-danger" onClick={logout}>Sign out</button>
            </div>
          )}
        </Modal>
      )}
    </>
  )
}

function NewProjectModal({ employees, onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', key: '', description: '', leadId: '', color: '#6366f1' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async e => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      onCreated(await api.createProject({
        name: form.name.trim(),
        key: form.key.trim().toUpperCase(),
        description: form.description.trim() || null,
        leadId: form.leadId ? Number(form.leadId) : null,
        color: form.color,
      }))
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Modal
      title="New project"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>Create</button>
        </>
      }
    >
      <form onSubmit={submit}>
        {error && <div className="error-banner">{error}</div>}
        <div className="field">
          <label htmlFor="p-name">Name</label>
          <input id="p-name" className="input" autoFocus value={form.name}
            onChange={e => {
              const name = e.target.value
              setForm(f => ({
                ...f,
                name,
                // Suggest a key from the name until the user types their own.
                key: f.key && f.key !== suggestKey(f.name) ? f.key : suggestKey(name),
              }))
            }} />
        </div>
        <div className="field">
          <label htmlFor="p-key">Key</label>
          <input id="p-key" className="input" value={form.key} maxLength={10}
            onChange={e => setForm(f => ({ ...f, key: e.target.value.toUpperCase() }))} />
          <span className="hint">Used as the task prefix, e.g. {form.key || 'ABC'}-14</span>
        </div>
        <div className="field">
          <label htmlFor="p-desc">Description</label>
          <textarea id="p-desc" className="textarea" value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
        </div>
        <div className="field">
          <label htmlFor="p-lead">Project lead</label>
          <select id="p-lead" className="select" value={form.leadId}
            onChange={e => setForm(f => ({ ...f, leadId: e.target.value }))}>
            <option value="">No lead</option>
            {employees.map(e => (
              <option key={e.id} value={e.id}>{e.full_name} — {e.job_title}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="p-color">Colour</label>
          <input id="p-color" type="color" value={form.color}
            onChange={e => setForm(f => ({ ...f, color: e.target.value }))} />
        </div>
      </form>
    </Modal>
  )
}

const suggestKey = name =>
  name.replace(/[^a-zA-Z ]/g, '').split(/\s+/).filter(Boolean)
    .map(w => w[0]).join('').toUpperCase().slice(0, 4) ||
  name.replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase()

export function AppShell() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [theme, toggleTheme] = useTheme()

  const [projects, setProjects] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creatingProject, setCreatingProject] = useState(false)

  const load = useCallback(async () => {
    try {
      const [p, e] = await Promise.all([api.projects(), api.employees()])
      setProjects(p)
      setEmployees(e)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="loading-page"><Spinner /></div>

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="topbar-brand">
          <span className="brand-mark">TE</span>
          Top Edge PM
        </Link>
        <div className="topbar-spacer" />
        <button className="btn btn-ghost btn-icon" onClick={toggleTheme}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
        <span className="tiny dim">{user.department}</span>
        <AccountMenu />
      </header>

      {error && <div className="error-banner" style={{ margin: 12 }}>{error}</div>}

      <div className="app-body">
        <Sidebar
          projects={projects}
          setProjects={setProjects}
          onNewProject={() => setCreatingProject(true)}
        />
        <Outlet context={{ projects, setProjects, employees, reload: load }} />
      </div>

      {creatingProject && (
        <NewProjectModal
          employees={employees}
          onClose={() => setCreatingProject(false)}
          onCreated={project => {
            setProjects(list => [...list, project])
            setCreatingProject(false)
            navigate(`/projects/${project.id}/board`)
          }}
        />
      )}
    </div>
  )
}
