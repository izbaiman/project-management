import { Router } from 'express'
import { db, GAP, rankBetween, logActivity } from '../db.js'
import { requireRole } from '../auth.js'

export const projectsRouter = Router()

const projectSelect = `
  SELECT p.*, e.full_name AS lead_name, e.avatar_color AS lead_color,
         (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS task_count,
         (SELECT COUNT(*) FROM tasks t JOIN board_columns c ON c.id = t.column_id
           WHERE t.project_id = p.id AND c.is_done = 1) AS done_count
  FROM projects p LEFT JOIN employees e ON e.id = p.lead_id`

/** GET /api/projects */
projectsRouter.get('/', (req, res) => {
  const showArchived = req.query.archived === 'all'
  res.json(db.prepare(
    `${projectSelect} ${showArchived ? '' : 'WHERE p.archived = 0'} ORDER BY p.position`
  ).all())
})

/** GET /api/projects/:id — project plus its columns and sprints. */
projectsRouter.get('/:id', (req, res) => {
  const project = db.prepare(`${projectSelect} WHERE p.id = ?`).get(req.params.id)
  if (!project) return res.status(404).json({ error: 'Project not found' })

  project.columns = db.prepare(
    'SELECT * FROM board_columns WHERE project_id = ? ORDER BY position').all(project.id)
  project.sprints = db.prepare(
    'SELECT * FROM sprints WHERE project_id = ? ORDER BY position').all(project.id)
  res.json(project)
})

/**
 * POST /api/projects — managers, admins and super admins create projects.
 * Department boards are made by the seed, never through this endpoint.
 */
projectsRouter.post('/', requireRole('admin', 'manager'), (req, res) => {
  const name = String(req.body?.name || '').trim()
  const key = String(req.body?.key || '').trim().toUpperCase()

  if (!name) return res.status(400).json({ error: 'Project name is required' })
  if (!/^[A-Z][A-Z0-9]{1,9}$/.test(key)) {
    return res.status(400).json({ error: 'Key must be 2-10 letters/digits starting with a letter' })
  }
  if (db.prepare('SELECT 1 FROM projects WHERE key = ?').get(key)) {
    return res.status(409).json({ error: `Project key ${key} is already taken` })
  }

  const last = db.prepare('SELECT MAX(position) AS p FROM projects').get().p
  const info = db.prepare(`
    INSERT INTO projects (key, name, description, lead_id, color, position, kind, department)
    VALUES (?, ?, ?, ?, ?, ?, 'project', ?)`).run(
    key, name,
    req.body.description || null,
    req.body.leadId || null,
    req.body.color || '#6366f1',
    (last ?? 0) + GAP,
    String(req.body.department || '').trim() || null,
  )
  const projectId = Number(info.lastInsertRowid)

  const defaults = ['Backlog', 'To Do', 'In Progress', 'In Review', 'Done']
  const insertColumn = db.prepare(
    'INSERT INTO board_columns (project_id, name, position, is_done) VALUES (?, ?, ?, ?)')
  defaults.forEach((n, i) =>
    insertColumn.run(projectId, n, (i + 1) * GAP, n === 'Done' ? 1 : 0))

  logActivity({ projectId, actorId: req.user.id, action: 'project.created', detail: name })
  res.status(201).json(db.prepare(`${projectSelect} WHERE p.id = ?`).get(projectId))
})

/** PATCH /api/projects/:id */
projectsRouter.patch('/:id', requireRole('admin', 'manager'), (req, res) => {
  const allowed = ['name', 'description', 'lead_id', 'color', 'archived', 'department']
  const sets = []
  const params = []

  for (const field of allowed) {
    const camel = field.replace(/_(\w)/g, (_, c) => c.toUpperCase())
    const value = req.body[field] !== undefined ? req.body[field] : req.body[camel]
    if (value !== undefined) {
      sets.push(`${field} = ?`)
      params.push(field === 'archived' ? (value ? 1 : 0) : value)
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' })

  params.push(req.params.id)
  const info = db.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`).run(...params)
  if (!info.changes) return res.status(404).json({ error: 'Project not found' })
  res.json(db.prepare(`${projectSelect} WHERE p.id = ?`).get(req.params.id))
})

/** PATCH /api/projects/:id/move — drag-reorder in the sidebar. */
projectsRouter.patch('/:id/move', (req, res) => {
  const { beforeId, afterId } = req.body
  const posOf = id => id
    ? db.prepare('SELECT position FROM projects WHERE id = ?').get(id)?.position ?? null
    : null

  const position = rankBetween(posOf(beforeId), posOf(afterId))
  const info = db.prepare('UPDATE projects SET position = ? WHERE id = ?')
    .run(position, req.params.id)
  if (!info.changes) return res.status(404).json({ error: 'Project not found' })
  res.json({ id: Number(req.params.id), position })
})

/** DELETE /api/projects/:id — cascades to columns, sprints and tasks. */
projectsRouter.delete('/:id', requireRole('admin'), (req, res) => {
  const p = db.prepare('SELECT kind FROM projects WHERE id = ?').get(req.params.id)
  if (p?.kind === 'department') return res.status(400).json({ error: 'Department boards can’t be deleted' })
  const info = db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id)
  if (!info.changes) return res.status(404).json({ error: 'Project not found' })
  res.json({ ok: true })
})

// ---------------------------------------------------------------- columns ----

/** POST /api/projects/:id/columns */
projectsRouter.post('/:id/columns', requireRole('admin', 'manager'), (req, res) => {
  const name = String(req.body?.name || '').trim()
  if (!name) return res.status(400).json({ error: 'Column name is required' })

  const last = db.prepare('SELECT MAX(position) AS p FROM board_columns WHERE project_id = ?')
    .get(req.params.id).p
  const info = db.prepare(`
    INSERT INTO board_columns (project_id, name, position, wip_limit, is_done)
    VALUES (?, ?, ?, ?, ?)`).run(
    req.params.id, name, (last ?? 0) + GAP,
    req.body.wipLimit ?? null, req.body.isDone ? 1 : 0,
  )
  res.status(201).json(
    db.prepare('SELECT * FROM board_columns WHERE id = ?').get(Number(info.lastInsertRowid)))
})

export const columnsRouter = Router()

/** PATCH /api/columns/:id */
columnsRouter.patch('/:id', requireRole('admin', 'manager'), (req, res) => {
  const sets = []
  const params = []
  if (req.body.name !== undefined) { sets.push('name = ?'); params.push(String(req.body.name).trim()) }
  if (req.body.wipLimit !== undefined) { sets.push('wip_limit = ?'); params.push(req.body.wipLimit || null) }
  if (req.body.isDone !== undefined) { sets.push('is_done = ?'); params.push(req.body.isDone ? 1 : 0) }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' })

  params.push(req.params.id)
  const info = db.prepare(`UPDATE board_columns SET ${sets.join(', ')} WHERE id = ?`).run(...params)
  if (!info.changes) return res.status(404).json({ error: 'Column not found' })
  res.json(db.prepare('SELECT * FROM board_columns WHERE id = ?').get(req.params.id))
})

/** PATCH /api/columns/:id/move — drag-reorder the board columns themselves. */
columnsRouter.patch('/:id/move', (req, res) => {
  const { beforeId, afterId } = req.body
  const posOf = id => id
    ? db.prepare('SELECT position FROM board_columns WHERE id = ?').get(id)?.position ?? null
    : null

  const position = rankBetween(posOf(beforeId), posOf(afterId))
  const info = db.prepare('UPDATE board_columns SET position = ? WHERE id = ?')
    .run(position, req.params.id)
  if (!info.changes) return res.status(404).json({ error: 'Column not found' })
  res.json({ id: Number(req.params.id), position })
})

/** DELETE /api/columns/:id — tasks in it fall back to the first remaining column. */
columnsRouter.delete('/:id', requireRole('admin', 'manager'), (req, res) => {
  const column = db.prepare('SELECT * FROM board_columns WHERE id = ?').get(req.params.id)
  if (!column) return res.status(404).json({ error: 'Column not found' })

  const remaining = db.prepare(
    'SELECT id FROM board_columns WHERE project_id = ? AND id != ? ORDER BY position LIMIT 1')
    .get(column.project_id, column.id)
  if (!remaining) {
    return res.status(400).json({ error: 'A board must keep at least one column' })
  }

  db.prepare('UPDATE tasks SET column_id = ? WHERE column_id = ?').run(remaining.id, column.id)
  db.prepare('DELETE FROM board_columns WHERE id = ?').run(column.id)
  res.json({ ok: true, movedTo: remaining.id })
})
