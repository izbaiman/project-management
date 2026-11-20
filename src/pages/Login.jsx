import { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { Icon } from '../components/ui.jsx'

const FEATURES = [
  ['board', 'Drag-and-drop boards for every department'],
  ['list', 'Sprint planning with a shared backlog'],
  ['users', 'Assign work by dropping a teammate on a task'],
]

export function Login() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async e => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login(email.trim(), password)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <aside className="login-hero" aria-hidden="true">
        <div className="login-brand">
          <span className="brand-mark brand-mark-lg">TE</span>
          <span className="login-hero-name">Top Edge PM</span>
        </div>
        <div>
          <h1 className="login-hero-title">Plan, track and ship work together.</h1>
          <ul className="login-features">
            {FEATURES.map(([icon, text]) => (
              <li key={text}><span className="login-feature-icon"><Icon name={icon} size={16} /></span>{text}</li>
            ))}
          </ul>
        </div>
        <div className="login-hero-foot">Top Edge Technologies</div>
      </aside>

      <main className="login-main">
        <form className="login-card" onSubmit={submit}>
          <div className="login-brand login-brand-mobile">
            <span className="brand-mark">TE</span>
            <strong>Top Edge PM</strong>
          </div>
          <h2 className="login-title">Sign in</h2>
          <p className="login-sub">Use your Top Edge work email.</p>

          {error && <div className="error-banner" role="alert">{error}</div>}

          <div className="field">
            <label htmlFor="email">Work email</label>
            <div className="input-icon">
              <Icon name="mail" size={16} />
              <input
                id="email"
                className="input"
                type="email"
                autoComplete="username"
                autoFocus
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="name@topedgetechnologies.com"
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <div className="input-icon">
              <Icon name="key" size={16} />
              <input
                id="password"
                className="input"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="input-action"
                onClick={() => setShowPassword(s => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                <Icon name={showPassword ? 'eyeOff' : 'eye'} size={16} />
              </button>
            </div>
          </div>

          <button className="btn btn-primary btn-lg btn-block" disabled={busy || !email || !password}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="hint center mt-16">
            First time here? Your account starts with the shared password from IT.
            Change it from the account menu after you sign in.
          </p>
        </form>
      </main>
    </div>
  )
}
