import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { db } from '../db.js'
import { PUBLIC_FIELDS, requireRole } from '../auth.js'

export const employeesRouter = Router()

/** GET /api/employees?search=&department=&active=1 */
employeesRouter.get('/', (req, res) => {
  const { search, department } = req.query
  const where = []
  const params = []

  if (req.query.active !== 'all') {
    where.push('active = 1')
  }
  if (department) {
    where.push('department = ?')
    params.push(department)
  }
  if (search) {
    where.push('(full_name LIKE ? OR email LIKE ? OR job_title LIKE ?)')
    const like = `%${search}%`
    params.push(like, like, like)
  }

  const sql = `SELECT ${PUBLIC_FIELDS} FROM employees
               ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY department, full_name`
  res.json(db.prepare(sql).all(...params))
})

/** GET /api/employees/departments — grouped counts, used by the assignee sidebar. */
employeesRouter.get('/departments', (_req, res) => {
  res.json(db.prepare(`
    SELECT department AS name, COUNT(*) AS count
    FROM employees WHERE active = 1
    GROUP BY department ORDER BY department`).all())
})

employeesRouter.get('/:id', (req, res) => {
  const emp = db.prepare(`SELECT ${PUBLIC_FIELDS} FROM employees WHERE id = ?`).get(req.params.id)
  if (!emp) return res.status(404).json({ error: 'Employee not found' })

  const workload = db.prepare(`
    SELECT c.name AS column_name, COUNT(*) AS count
    FROM tasks t LEFT JOIN board_columns c ON c.id = t.column_id
    WHERE t.assignee_id = ? GROUP BY c.name`).all(req.params.id)

  res.json({ ...emp, workload })
})

/** PATCH /api/employees/:id — admins may change role / active / job details. */
employeesRouter.patch('/:id', requireRole('admin'), (req, res) => {
  const allowed = ['full_name', 'job_title', 'department', 'role', 'active']
  const sets = []
  const params = []

  for (const field of allowed) {
    if (req.body[field] !== undefined) {
      sets.push(`${field} = ?`)
      params.push(field === 'active' ? (req.body[field] ? 1 : 0) : req.body[field])
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' })

  params.push(req.params.id)
  db.prepare(`UPDATE employees SET ${sets.join(', ')} WHERE id = ?`).run(...params)
  res.json(db.prepare(`SELECT ${PUBLIC_FIELDS} FROM employees WHERE id = ?`).get(req.params.id))
})

/** POST /api/employees/:id/reset-password — admin-issued temporary password. */
employeesRouter.post('/:id/reset-password', requireRole('admin'), (req, res) => {
  const password = String(req.body?.password || '')
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' })
  }
  const info = db.prepare('UPDATE employees SET password_hash = ? WHERE id = ?')
    .run(bcrypt.hashSync(password, 10), req.params.id)
  if (!info.changes) return res.status(404).json({ error: 'Employee not found' })
  res.json({ ok: true })
})
