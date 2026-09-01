import { Router } from 'express'
import { db, GAP, rankBetween, logActivity } from '../db.js'
import { requireRole } from '../auth.js'

export const sprintsRouter = Router()

const sprintSelect = `
  SELECT s.*,
         (SELECT COUNT(*) FROM tasks t WHERE t.sprint_id = s.id) AS task_count,
         (SELECT COALESCE(SUM(t.story_points), 0) FROM tasks t WHERE t.sprint_id = s.id) AS points,
         (SELECT COUNT(*) FROM tasks t JOIN board_columns c ON c.id = t.column_id
           WHERE t.sprint_id = s.id AND c.is_done = 1) AS done_count
  FROM sprints s`

/** GET /api/sprints?projectId= */
sprintsRouter.get('/', (req, res) => {
  if (!req.query.projectId) return res.status(400).json({ error: 'projectId is required' })
  res.json(db.prepare(`${sprintSelect} WHERE s.project_id = ? ORDER BY s.position`)
    .all(req.query.projectId))
})

/** POST /api/sprints */
sprintsRouter.post('/', requireRole('admin', 'manager'), (req, res) => {
  const name = String(req.body?.name || '').trim()
  const projectId = Number(req.body?.projectId)
  if (!name) return res.status(400).json({ error: 'Sprint name is required' })
  if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId)) {
    return res.status(400).json({ error: 'Unknown project' })
  }

  const last = db.prepare('SELECT MAX(position) AS p FROM sprints WHERE project_id = ?')
    .get(projectId).p
  const info = db.prepare(`
    INSERT INTO sprints (project_id, name, goal, start_date, end_date, status, position)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    projectId, name,
    req.body.goal || null,
    req.body.startDate || null,
    req.body.endDate || null,
    'planned',
    (last ?? 0) + GAP,
  )
  res.status(201).json(
    db.prepare(`${sprintSelect} WHERE s.id = ?`).get(Number(info.lastInsertRowid)))
})

/** PATCH /api/sprints/:id — rename, set dates, or change status. */
sprintsRouter.patch('/:id', requireRole('admin', 'manager'), (req, res) => {
  const sprint = db.prepare('SELECT * FROM sprints WHERE id = ?').get(req.params.id)
  if (!sprint) return res.status(404).json({ error: 'Sprint not found' })

  const map = { name: 'name', goal: 'goal', startDate: 'start_date', endDate: 'end_date' }
  const sets = []
  const params = []

  for (const [key, column] of Object.entries(map)) {
    if (req.body[key] === undefined) continue
    sets.push(`${column} = ?`)
    params.push(req.body[key] === '' ? null : req.body[key])
  }

  if (req.body.status !== undefined) {
    if (!['planned', 'active', 'completed'].includes(req.body.status)) {
      return res.status(400).json({ error: 'Invalid sprint status' })
    }
    if (req.body.status === 'active') {
      // Only one sprint runs at a time per project.
      db.prepare(`UPDATE sprints SET status = 'planned'
                  WHERE project_id = ? AND status = 'active' AND id != ?`)
        .run(sprint.project_id, sprint.id)
    }
    sets.push('status = ?')
    params.push(req.body.status)
  }

  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' })
  params.push(sprint.id)
  db.prepare(`UPDATE sprints SET ${sets.join(', ')} WHERE id = ?`).run(...params)

  logActivity({
    projectId: sprint.project_id, actorId: req.user.id,
    action: 'sprint.updated', detail: req.body.status || sprint.name,
  })
  res.json(db.prepare(`${sprintSelect} WHERE s.id = ?`).get(sprint.id))
})

/** PATCH /api/sprints/:id/move — drag-reorder sprints on the backlog screen. */
sprintsRouter.patch('/:id/move', (req, res) => {
  const { beforeId, afterId } = req.body
  const posOf = id => id
    ? db.prepare('SELECT position FROM sprints WHERE id = ?').get(id)?.position ?? null
    : null

  const position = rankBetween(posOf(beforeId), posOf(afterId))
  const info = db.prepare('UPDATE sprints SET position = ? WHERE id = ?')
    .run(position, req.params.id)
  if (!info.changes) return res.status(404).json({ error: 'Sprint not found' })
  res.json({ id: Number(req.params.id), position })
})

/**
 * POST /api/sprints/:id/complete — close the sprint and push whatever is
 * unfinished either into the next sprint or back to the backlog.
 */
sprintsRouter.post('/:id/complete', requireRole('admin', 'manager'), (req, res) => {
  const sprint = db.prepare('SELECT * FROM sprints WHERE id = ?').get(req.params.id)
  if (!sprint) return res.status(404).json({ error: 'Sprint not found' })

  const moveTo = req.body?.moveUnfinishedTo ?? null   // sprint id, or null for backlog
  if (moveTo !== null) {
    const ok = db.prepare('SELECT 1 FROM sprints WHERE id = ? AND project_id = ?')
      .get(moveTo, sprint.project_id)
    if (!ok) return res.status(400).json({ error: 'Target sprint is not on this project' })
  }

  const info = db.prepare(`
    UPDATE tasks SET sprint_id = ?
    WHERE sprint_id = ?
      AND column_id IN (SELECT id FROM board_columns WHERE is_done = 0)`)
    .run(moveTo, sprint.id)

  db.prepare("UPDATE sprints SET status = 'completed' WHERE id = ?").run(sprint.id)
  logActivity({
    projectId: sprint.project_id, actorId: req.user.id,
    action: 'sprint.completed', detail: sprint.name,
  })
  res.json({ ok: true, movedTasks: info.changes })
})

/** DELETE /api/sprints/:id — its tasks fall back to the backlog. */
sprintsRouter.delete('/:id', requireRole('admin', 'manager'), (req, res) => {
  const info = db.prepare('DELETE FROM sprints WHERE id = ?').run(req.params.id)
  if (!info.changes) return res.status(404).json({ error: 'Sprint not found' })
  res.json({ ok: true })
})
