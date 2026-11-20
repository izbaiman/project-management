import { useCallback, useEffect, useState } from 'react'
import { Link, Outlet, useNavigate } from 'react-router-dom'
import { api } from './api.js'
import { useAuth } from './context/AuthContext.jsx'
import { Sidebar } from './components/Sidebar.jsx'
import { Avatar, Icon, Modal, RoleBadge, Spinner, useTheme, useToast } from './components/ui.jsx'

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
        className="account-chip"
        onClick={() => setOpen(o => !o)}
        title={`${user.full_name} — ${user.job_title}`}
        aria-label="Your account"
      >
        <Avatar name={user.full_name} color={user.avatar_color} size="md" />
        <span className="account-chip-text">
          <span className="account-chip-name">{user.full_name}</span>
          <span className="account-chip-sub">{user.department}</span>
        </span>
        <Icon name="chevronDown" size={14} className="dim" />
      </button>

      {open && (
        <Modal title="Your account" onClose={() => setOpen(false)}>
          <div className="profile-card mb-12">
            <Avatar name={user.full_name} color={user.avatar_color} size="xl" />
            <div style={{ minWidth: 0 }}>
              <h2>{user.full_name}</h2>
              <div className="muted">{user.job_title}</div>
              <div className="tiny dim truncate">{user.department} · {user.email}</div>
              <span className="mt-8" style={{ display: 'inline-block' }}><RoleBadge role={user.role} /></span>
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
              <button className="btn" onClick={() => setChanging(true)}>
                <Icon name="key" size={15} /> Change password
              </button>
              <button className="btn btn-danger" onClick={logout}>
                <Icon name="logout" size={15} /> Sign out
              </button>
            </div>
          )}
        </Modal>
      )}
    </>
  )
}

function NewProjectModal({ employees, onClose, onCreated }) {
  const { user } = useAuth()
  const departments = [...new Set(employees.map(e => e.department).filter(Boolean))].sort()
  const [form, setForm] = useState({
    name: '', key: '', description: '', leadId: '', color: '#6366f1',
    department: departments.includes(user.department) ? user.department : '',
  })
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
        department: form.department || null,
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
          <label htmlFor="p-dept">Department</label>
          <select id="p-dept" className="select" value={form.department}
            onChange={e => setForm(f => ({ ...f, department: e.target.value }))}>
            <option value="">Cross-department</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <span className="hint">The department that owns this project.</span>
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
  const navigate = useNavigate()
  const [theme, toggleTheme] = useTheme()

  const [projects, setProjects] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creatingProject, setCreatingProject] = useState(false)
  const [navOpen, setNavOpen] = useState(false)

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
        <button className="btn btn-ghost btn-icon menu-toggle" onClick={() => setNavOpen(o => !o)}
          aria-label="Open navigation" aria-expanded={navOpen}>
          <Icon name="menu" size={20} />
        </button>
        <Link to="/" className="topbar-brand">
          <span className="brand-mark">TE</span>
          <span>Top Edge <span className="brand-sub">PM</span></span>
        </Link>
        <div className="topbar-spacer" />
        <button className="btn btn-ghost btn-icon" onClick={toggleTheme}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
          <Icon name={theme === 'light' ? 'moon' : 'sun'} size={18} />
        </button>
        <AccountMenu />
      </header>

      {error && <div className="error-banner" style={{ margin: 12 }}>{error}</div>}

      <div className="app-body">
        <Sidebar
          projects={projects}
          setProjects={setProjects}
          onNewProject={() => setCreatingProject(true)}
          open={navOpen}
          onClose={() => setNavOpen(false)}
        />
        <Outlet context={{ projects, setProjects, employees, reload: load, newProject: () => setCreatingProject(true) }} />
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
