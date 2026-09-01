import { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'

export function Login() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <span className="brand-mark">TE</span>
          <div>
            <h1 style={{ fontSize: 17 }}>Top Edge PM</h1>
            <div className="tiny dim">Project management</div>
          </div>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="field">
          <label htmlFor="email">Work email</label>
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

        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
        </div>

        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
          disabled={busy || !email || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="hint center mt-16">
          Imported accounts start with the shared password set during seeding.<br />
          Change it from the account menu after your first sign-in.
        </p>
      </form>
    </div>
  )
}
