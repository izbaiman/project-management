import { Router } from 'express'
import { db, GAP, rankBetween, logActivity } from '../db.js'

export const tasksRouter = Router()

const taskSelect = `
  SELECT t.*,
         a.full_name AS assignee_name, a.avatar_color AS assignee_color,
         a.job_title AS assignee_title, a.department AS assignee_department,
         r.full_name AS reporter_name,
         p.key AS project_key,
         (SELECT COUNT(*) FROM comments c WHERE c.task_id = t.id) AS comment_count
  FROM tasks t
  LEFT JOIN employees a ON a.id = t.assignee_id
  LEFT JOIN employees r ON r.id = t.reporter_id
  LEFT JOIN projects  p ON p.id = t.project_id`

const TYPES = ['task', 'bug', 'story', 'epic']
const PRIORITIES = ['lowest', 'low', 'medium', 'high', 'highest']

/** GET /api/tasks?projectId=&sprintId=&assigneeId=&search=&backlog=1 */
tasksRouter.get('/', (req, res) => {
  const where = []
  const params = []

  if (req.query.projectId) { where.push('t.project_id = ?'); params.push(req.query.projectId) }
  if (req.query.assigneeId) { where.push('t.assignee_id = ?'); params.push(req.query.assigneeId) }
  if (req.query.type) { where.push('t.type = ?'); params.push(req.query.type) }
  if (req.query.priority) { where.push('t.priority = ?'); params.push(req.query.priority) }

  if (req.query.backlog === '1') {
    where.push('t.sprint_id IS NULL')
  } else if (req.query.sprintId) {
    where.push('t.sprint_id = ?')
    params.push(req.query.sprintId)
  }

  if (req.query.search) {
    where.push('(t.title LIKE ? OR t.description LIKE ? OR t.key LIKE ?)')
    const like = `%${req.query.search}%`
    params.push(like, like, like)
  }

  const sql = `${taskSelect} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY t.position LIMIT ${Math.min(Number(req.query.limit) || 500, 2000)}`
  res.json(db.prepare(sql).all(...params))
})

/** GET /api/tasks/:id */
tasksRouter.get('/:id', (req, res) => {
  const task = db.prepare(`${taskSelect} WHERE t.id = ?`).get(req.params.id)
  if (!task) return res.status(404).json({ error: 'Task not found' })

  task.comments = db.prepare(`
    SELECT c.*, e.full_name AS author_name, e.avatar_color AS author_color
    FROM comments c LEFT JOIN employees e ON e.id = c.author_id
    WHERE c.task_id = ? ORDER BY c.created_at`).all(task.id)

  task.activity = db.prepare(`
    SELECT a.*, e.full_name AS actor_name
    FROM activity a LEFT JOIN employees e ON e.id = a.actor_id
    WHERE a.task_id = ? ORDER BY a.created_at DESC LIMIT 50`).all(task.id)

  res.json(task)
})

/** POST /api/tasks */
tasksRouter.post('/', (req, res) => {
  const title = String(req.body?.title || '').trim()
  const projectId = Number(req.body?.projectId)

  if (!title) return res.status(400).json({ error: 'Task title is required' })

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId)
  if (!project) return res.status(400).json({ error: 'Unknown project' })

  const type = TYPES.includes(req.body.type) ? req.body.type : 'task'
  const priority = PRIORITIES.includes(req.body.priority) ? req.body.priority : 'medium'

  // Land on the requested column, else the board's first column.
  let columnId = req.body.columnId ?? null
  if (columnId) {
    const ok = db.prepare('SELECT 1 FROM board_columns WHERE id = ? AND project_id = ?')
      .get(columnId, projectId)
    if (!ok) columnId = null
  }
  if (!columnId) {
    columnId = db.prepare(
      'SELECT id FROM board_columns WHERE project_id = ? ORDER BY position LIMIT 1')
      .get(projectId)?.id ?? null
  }

  const seq = project.seq + 1
  db.prepare('UPDATE projects SET seq = ? WHERE id = ?').run(seq, projectId)

  const last = db.prepare('SELECT MAX(position) AS p FROM tasks WHERE project_id = ?')
    .get(projectId).p

  const info = db.prepare(`
    INSERT INTO tasks (project_id, key, title, description, type, priority, column_id,
                       sprint_id, assignee_id, reporter_id, story_points, due_date, labels, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    projectId,
    `${project.key}-${seq}`,
    title,
    req.body.description || null,
    type,
    priority,
    columnId,
    req.body.sprintId ?? null,
    req.body.assigneeId ?? null,
    req.user.id,
    req.body.storyPoints ?? null,
    req.body.dueDate || null,
    req.body.labels || null,
    (last ?? 0) + GAP,
  )

  const taskId = Number(info.lastInsertRowid)
  logActivity({ projectId, taskId, actorId: req.user.id, action: 'task.created', detail: title })
  res.status(201).json(db.prepare(`${taskSelect} WHERE t.id = ?`).get(taskId))
})

/** PATCH /api/tasks/:id */
tasksRouter.patch('/:id', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id)
  if (!task) return res.status(404).json({ error: 'Task not found' })

  const map = {
    title: 'title', description: 'description', type: 'type', priority: 'priority',
    assigneeId: 'assignee_id', storyPoints: 'story_points', dueDate: 'due_date',
    labels: 'labels', columnId: 'column_id', sprintId: 'sprint_id',
  }
  const sets = []
  const params = []

  for (const [key, column] of Object.entries(map)) {
    if (req.body[key] === undefined) continue
    let value = req.body[key]
    if (key === 'type' && !TYPES.includes(value)) continue
    if (key === 'priority' && !PRIORITIES.includes(value)) continue
    if (key === 'title') {
      value = String(value).trim()
      if (!value) return res.status(400).json({ error: 'Task title cannot be empty' })
    }
    sets.push(`${column} = ?`)
    params.push(value === '' ? null : value)
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' })

  sets.push("updated_at = datetime('now')")
  params.push(task.id)
  db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...params)

  if (req.body.assigneeId !== undefined && req.body.assigneeId !== task.assignee_id) {
    const who = req.body.assigneeId
      ? db.prepare('SELECT full_name FROM employees WHERE id = ?').get(req.body.assigneeId)?.full_name
      : 'Unassigned'
    logActivity({
      projectId: task.project_id, taskId: task.id, actorId: req.user.id,
      action: 'task.assigned', detail: who,
    })
  }

  res.json(db.prepare(`${taskSelect} WHERE t.id = ?`).get(task.id))
})

/**
 * PATCH /api/tasks/:id/move — the single endpoint behind every drag gesture.
 *
 * Body: { columnId?, sprintId?, beforeId?, afterId? }
 * `beforeId` / `afterId` are the neighbouring task ids at the drop position;
 * the new rank is the midpoint between them.
 */
tasksRouter.patch('/:id/move', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id)
  if (!task) return res.status(404).json({ error: 'Task not found' })

  const { beforeId, afterId } = req.body
  const posOf = id => id
    ? db.prepare('SELECT position FROM tasks WHERE id = ?').get(id)?.position ?? null
    : null

  let position = rankBetween(posOf(beforeId), posOf(afterId))

  const sets = ['position = ?']
  const params = [position]

  let columnId = task.column_id
  if (req.body.columnId !== undefined && req.body.columnId !== null) {
    const ok = db.prepare('SELECT 1 FROM board_columns WHERE id = ? AND project_id = ?')
      .get(req.body.columnId, task.project_id)
    if (!ok) return res.status(400).json({ error: 'That column is not on this project board' })
    columnId = Number(req.body.columnId)
    sets.push('column_id = ?')
    params.push(columnId)
  }

  if (req.body.sprintId !== undefined) {
    const sprintId = req.body.sprintId === null ? null : Number(req.body.sprintId)
    if (sprintId !== null) {
      const ok = db.prepare('SELECT 1 FROM sprints WHERE id = ? AND project_id = ?')
        .get(sprintId, task.project_id)
      if (!ok) return res.status(400).json({ error: 'That sprint is not on this project' })
    }
    sets.push('sprint_id = ?')
    params.push(sprintId)
  }

  sets.push("updated_at = datetime('now')")
  params.push(task.id)
  db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...params)

  // Ranks converge after many midpoint inserts; rebalance that column when they do.
  if (columnId && Math.abs(position - (posOf(beforeId) ?? position)) < 0.0001) {
    rebalanceColumn(columnId)
    position = db.prepare('SELECT position FROM tasks WHERE id = ?').get(task.id).position
  }

  if (columnId !== task.column_id) {
    const name = db.prepare('SELECT name FROM board_columns WHERE id = ?').get(columnId)?.name
    logActivity({
      projectId: task.project_id, taskId: task.id, actorId: req.user.id,
      action: 'task.moved', detail: name,
    })
  }

  res.json(db.prepare(`${taskSelect} WHERE t.id = ?`).get(task.id))
})

function rebalanceColumn(columnId) {
  const rows = db.prepare('SELECT id FROM tasks WHERE column_id = ? ORDER BY position').all(columnId)
  const update = db.prepare('UPDATE tasks SET position = ? WHERE id = ?')
  rows.forEach((r, i) => update.run((i + 1) * GAP, r.id))
}

/** DELETE /api/tasks/:id */
tasksRouter.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id)
  if (!info.changes) return res.status(404).json({ error: 'Task not found' })
  res.json({ ok: true })
})

/** POST /api/tasks/:id/comments */
tasksRouter.post('/:id/comments', (req, res) => {
  const body = String(req.body?.body || '').trim()
  if (!body) return res.status(400).json({ error: 'Comment cannot be empty' })

  const task = db.prepare('SELECT id FROM tasks WHERE id = ?').get(req.params.id)
  if (!task) return res.status(404).json({ error: 'Task not found' })

  const info = db.prepare('INSERT INTO comments (task_id, author_id, body) VALUES (?, ?, ?)')
    .run(task.id, req.user.id, body)

  res.status(201).json(db.prepare(`
    SELECT c.*, e.full_name AS author_name, e.avatar_color AS author_color
    FROM comments c LEFT JOIN employees e ON e.id = c.author_id
    WHERE c.id = ?`).get(Number(info.lastInsertRowid)))
})
