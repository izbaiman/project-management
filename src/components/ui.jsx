import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './icons.jsx'

export { Icon }

export function initials(name) {
  if (!name) return '?'
  const parts = String(name).trim().split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?'
}

export function Avatar({ name, color, size = 'sm', title }) {
  if (!name) {
    return (
      <span className={`avatar avatar-${size} avatar-empty`} title={title || 'Unassigned'}>
        ?
      </span>
    )
  }
  return (
    <span
      className={`avatar avatar-${size}`}
      style={{ background: color || '#6366f1' }}
      title={title || name}
    >
      {initials(name)}
    </span>
  )
}

export const TASK_TYPES = ['task', 'bug', 'story', 'epic']
export const PRIORITIES = ['highest', 'high', 'medium', 'low', 'lowest']
const PRIORITY_ICON = {
  highest: 'prioHighest', high: 'prioHigh', medium: 'prioMedium', low: 'prioLow', lowest: 'prioLowest',
}

export function TypeIcon({ type }) {
  const t = TASK_TYPES.includes(type) ? type : 'task'
  return (
    <span className={`type-icon type-${t}`} title={t}>
      <Icon name={t} size={12} strokeWidth={2.4} />
    </span>
  )
}

export function PriorityIcon({ priority }) {
  const p = PRIORITY_ICON[priority] ? priority : 'medium'
  return (
    <span className={`prio-icon prio-${p}`} title={`${p} priority`}>
      <Icon name={PRIORITY_ICON[p]} size={14} strokeWidth={2.4} />
    </span>
  )
}

const ROLE_NAMES = { member: 'Member', manager: 'Manager', admin: 'Admin', super_admin: 'Super admin' }

export function RoleBadge({ role }) {
  return (
    <span className={`badge role-badge role-${role}`}>
      {role !== 'member' && <Icon name={role === 'manager' ? 'users' : 'shield'} size={11} strokeWidth={2.4} />}
      {ROLE_NAMES[role] || role}
    </span>
  )
}

export function Spinner() {
  return <div className="spinner" role="status" aria-label="Loading" />
}

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return createPortal(
    <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' modal-wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          {typeof title === 'string' ? <h2>{title}</h2> : title}
          <div className="spacer" />
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/* --------------------------------------------------------------- toasts -- */

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const push = useCallback((message, variant) => {
    const id = crypto.randomUUID()
    setToasts(t => [...t, { id, message, variant }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3600)
  }, [])

  const toast = {
    show: msg => push(msg),
    error: msg => push(msg, 'error'),
  }

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {toasts.length > 0 && createPortal(
        <div className="toast-stack">
          {toasts.map(t => (
            <div key={t.id} className={`toast${t.variant === 'error' ? ' toast-error' : ''}`}>
              {t.message}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext) || { show: () => {}, error: () => {} }
}

/* ---------------------------------------------------------------- theme -- */

const THEME_KEY = 'topedge_pm_theme'

export function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'light')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  return [theme, () => setTheme(t => (t === 'light' ? 'dark' : 'light'))]
}

/** "3 days ago" style formatting for comment and activity timestamps. */
export function timeAgo(value) {
  if (!value) return ''
  const then = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z')
  const seconds = Math.floor((Date.now() - then.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const units = [
    ['minute', 60], ['hour', 3600], ['day', 86400],
    ['week', 604800], ['month', 2592000], ['year', 31536000],
  ]
  let label = 'year'
  let size = 31536000
  for (let i = 0; i < units.length; i++) {
    if (seconds < (units[i + 1]?.[1] ?? Infinity)) { [label, size] = units[i]; break }
  }
  const n = Math.floor(seconds / size)
  return `${n} ${label}${n === 1 ? '' : 's'} ago`
}
