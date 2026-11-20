import { Router } from 'express'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { db } from './db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SECRET_PATH = join(__dirname, '..', 'data', 'jwt.secret')

/**
 * Prefer an explicit JWT_SECRET. Failing that, generate one once and keep it on
 * disk, so sessions survive a restart without a shipped default that every
 * install would share.
 */
function resolveSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET
  if (existsSync(SECRET_PATH)) {
    const stored = readFileSync(SECRET_PATH, 'utf8').trim()
    if (stored) return stored
  }
  const generated = randomBytes(48).toString('hex')
  writeFileSync(SECRET_PATH, generated, { mode: 0o600 })
  return generated
}

const JWT_SECRET = resolveSecret()
const TOKEN_TTL = process.env.TOKEN_TTL || '12h'

export const PUBLIC_FIELDS =
  'id, username, full_name, job_title, department, company, email, role, avatar_color, active, team_id'

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: TOKEN_TTL })
}

/** Express middleware: rejects the request unless a valid bearer token is present. */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Not authenticated' })

  try {
    const payload = jwt.verify(token, JWT_SECRET)
    const user = db
      .prepare(`SELECT ${PUBLIC_FIELDS} FROM employees WHERE id = ? AND active = 1`)
      .get(payload.sub)
    if (!user) return res.status(401).json({ error: 'Account not found or inactive' })
    req.user = user
    next()
  } catch {
    return res.status(401).json({ error: 'Session expired, please sign in again' })
  }
}

/** Express middleware factory: allows only the listed roles (and super admins) through. */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' })
    if (req.user.role !== 'super_admin' && !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to do that' })
    }
    next()
  }
}

export const authRouter = Router()

authRouter.post('/login', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  const password = String(req.body?.password || '')

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' })
  }

  const row = db
    .prepare('SELECT * FROM employees WHERE email = ? COLLATE NOCASE')
    .get(email)

  // Same message either way, so the form cannot be used to enumerate accounts.
  const invalid = { error: 'Incorrect email or password' }
  if (!row || !row.password_hash) return res.status(401).json(invalid)
  if (!bcrypt.compareSync(password, row.password_hash)) return res.status(401).json(invalid)
  if (!row.active) return res.status(403).json({ error: 'This account is inactive' })

  const user = db.prepare(`SELECT ${PUBLIC_FIELDS} FROM employees WHERE id = ?`).get(row.id)
  res.json({ token: signToken(user), user })
})

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user })
})

authRouter.post('/change-password', requireAuth, (req, res) => {
  const current = String(req.body?.currentPassword || '')
  const next = String(req.body?.newPassword || '')

  if (next.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' })
  }

  const row = db.prepare('SELECT password_hash FROM employees WHERE id = ?').get(req.user.id)
  if (!bcrypt.compareSync(current, row.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' })
  }

  db.prepare('UPDATE employees SET password_hash = ? WHERE id = ?')
    .run(bcrypt.hashSync(next, 10), req.user.id)
  res.json({ ok: true })
})
