import { Router } from 'express'
import { db } from '../db.js'
import { atLeast, canEvaluate, evaluableEmployees } from '../roles.js'

export const evaluationsRouter = Router()

/**
 * KPI metrics. "manual" is a 1-5 rating from the evaluator; every other metric
 * is measured from the employee's own tasks completed in the period, so the
 * evaluation is grounded in the work tracked on the boards.
 */
export const METRICS = {
  manual:      { label: 'Manager rating' },
  tasks_done:  { label: 'Tasks completed', unit: 'tasks' },
  points_done: { label: 'Story points delivered', unit: 'pts' },
  on_time:     { label: 'On-time delivery', unit: '%' },
  bugs_fixed:  { label: 'Bugs fixed', unit: 'bugs' },
}

const DEFAULT_KPIS = [
  { title: 'Deliver assigned work', metric: 'tasks_done', target: 8, weight: 3 },
  { title: 'Meet deadlines', metric: 'on_time', target: 90, weight: 2 },
  { title: 'Quality of work', metric: 'manual', target: null, weight: 2 },
  { title: 'Teamwork & communication', metric: 'manual', target: null, weight: 1 },
]

/** '2026-11' (a month) or '2026-Q4' (a quarter) → [start, endExclusive] dates. */
export function periodRange(period) {
  const pad = n => String(n).padStart(2, '0')
  let m = /^(\d{4})-(\d{2})$/.exec(period || '')
  if (m) {
    const y = +m[1], mo = +m[2]
    if (mo < 1 || mo > 12) return null
    return [`${y}-${pad(mo)}-01`, mo === 12 ? `${y + 1}-01-01` : `${y}-${pad(mo + 1)}-01`]
  }
  m = /^(\d{4})-Q([1-4])$/.exec(period || '')
  if (m) {
    const y = +m[1], q = +m[2]
    return [`${y}-${pad(q * 3 - 2)}-01`, q === 4 ? `${y + 1}-01-01` : `${y}-${pad(q * 3 + 1)}-01`]
  }
  return null
}

export function gradeFor(score) {
  if (score == null) return null
  if (score >= 90) return 'Outstanding'
  if (score >= 75) return 'Exceeds expectations'
  if (score >= 60) return 'Meets expectations'
  if (score >= 40) return 'Needs improvement'
  return 'Unsatisfactory'
}

/** What the employee actually delivered in the period, from the task boards. */
function measure(employeeId, [start, end]) {
  const r = db.prepare(`
    SELECT COUNT(*) AS tasks_done,
           COALESCE(SUM(story_points), 0) AS points_done,
           SUM(CASE WHEN type = 'bug' THEN 1 ELSE 0 END) AS bugs_fixed,
           SUM(CASE WHEN due_date IS NOT NULL THEN 1 ELSE 0 END) AS with_due,
           SUM(CASE WHEN due_date IS NOT NULL AND date(completed_at) <= date(due_date) THEN 1 ELSE 0 END) AS on_due
    FROM tasks WHERE assignee_id = ? AND completed_at >= ? AND completed_at < ?`).get(employeeId, start, end)
  const open = db.prepare(`
    SELECT COUNT(*) AS open,
           SUM(CASE WHEN t.due_date IS NOT NULL AND date(t.due_date) < date('now') THEN 1 ELSE 0 END) AS overdue
    FROM tasks t LEFT JOIN board_columns c ON c.id = t.column_id
    WHERE t.assignee_id = ? AND COALESCE(c.is_done, 0) = 0`).get(employeeId)
  return {
    tasks_done: r.tasks_done,
    points_done: r.points_done,
    bugs_fixed: r.bugs_fixed || 0,
    on_time: r.with_due ? Math.round((r.on_due / r.with_due) * 100) : null,
    open: open.open,
    overdue: open.overdue || 0,
  }
}

/** Attach actual value and 0-100 score to each KPI, and roll up the weighted total. */
function score(kpis, metrics) {
  const scored = kpis.map(k => {
    let actual = null
    let value = null
    if (k.metric === 'manual') {
      value = k.rating ? k.rating * 20 : null
    } else {
      actual = metrics[k.metric] ?? null
      if (actual != null && k.target > 0) value = Math.min(100, Math.round((actual / k.target) * 100))
    }
    return { ...k, actual, score: value }
  })
  const rated = scored.filter(k => k.score != null && k.weight > 0)
  const weight = rated.reduce((s, k) => s + k.weight, 0)
  const total = weight ? Math.round(rated.reduce((s, k) => s + k.score * k.weight, 0) / weight) : null
  return { kpis: scored, score: total, grade: gradeFor(total) }
}

const employeeById = db.prepare(`SELECT id, full_name, job_title, department, role, avatar_color, email
                                 FROM employees WHERE id = ?`)
const evaluationFor = db.prepare(`
  SELECT ev.*, e.full_name AS evaluator_name FROM evaluations ev
  LEFT JOIN employees e ON e.id = ev.evaluator_id
  WHERE ev.employee_id = ? AND ev.period = ?`)
const kpisFor = db.prepare('SELECT * FROM kpis WHERE evaluation_id = ? ORDER BY position, id')

function detail(employee, period, range) {
  const evaluation = evaluationFor.get(employee.id, period) || null
  let kpis
  if (evaluation) {
    kpis = kpisFor.all(evaluation.id)
  } else {
    // Start from the KPIs used last time, so a manager sets them once and reuses them.
    const last = db.prepare(`SELECT id FROM evaluations WHERE employee_id = ? AND period != ?
                             ORDER BY period DESC LIMIT 1`).get(employee.id, period)
    kpis = (last ? kpisFor.all(last.id) : DEFAULT_KPIS)
      .map(({ title, metric, target, weight }) => ({ title, metric, target, weight, rating: null }))
  }
  const metrics = measure(employee.id, range)
  return { employee, period, evaluation, metrics, ...score(kpis, metrics) }
}

function readPeriod(req, res) {
  const period = String(req.query.period || '')
  const range = periodRange(period)
  if (!range) res.status(400).json({ error: 'Period must look like 2026-11 or 2026-Q4' })
  return range ? { period, range } : null
}

/** GET /api/evaluations/meta — metric catalogue for the KPI editor. */
evaluationsRouter.get('/meta', (_req, res) => res.json({ metrics: METRICS }))

/** GET /api/evaluations/team?period= — everyone I may evaluate, with their status. */
evaluationsRouter.get('/team', (req, res) => {
  const p = readPeriod(req, res)
  if (!p) return
  const rows = db.prepare('SELECT employee_id, status, score FROM evaluations WHERE period = ?').all(p.period)
  const byEmp = new Map(rows.map(r => [r.employee_id, r]))
  res.json(evaluableEmployees(req.user).map(e => {
    const ev = byEmp.get(e.id)
    return { ...e, evaluation: ev ? { ...ev, grade: gradeFor(ev.score) } : null }
  }))
})

/** GET /api/evaluations/mine — my finalised evaluations, newest first. */
evaluationsRouter.get('/mine', (req, res) => {
  const rows = db.prepare(`SELECT period FROM evaluations
                           WHERE employee_id = ? AND status = 'final' ORDER BY period DESC`).all(req.user.id)
  const me = employeeById.get(req.user.id)
  res.json(rows.map(r => detail(me, r.period, periodRange(r.period))))
})

/** GET /api/evaluations/:employeeId?period= */
evaluationsRouter.get('/:employeeId', (req, res) => {
  const p = readPeriod(req, res)
  if (!p) return
  const employee = employeeById.get(req.params.employeeId)
  if (!employee) return res.status(404).json({ error: 'Employee not found' })

  const canEdit = canEvaluate(req.user, employee)
  const result = detail(employee, p.period, p.range)
  const isSelf = employee.id === req.user.id
  if (!canEdit && !(isSelf && result.evaluation?.status === 'final')) {
    return res.status(403).json({ error: isSelf
      ? 'Your evaluation for this period has not been shared yet'
      : 'You can only evaluate people in your team' })
  }
  res.json({ ...result, canEdit, canReopen: canEdit && atLeast(req.user, 'admin') })
})

/**
 * PUT /api/evaluations/:employeeId?period=
 * Body: { kpis: [{ title, metric, target, weight, rating }], summary, status: 'draft'|'final' }
 * A final evaluation is locked; only an admin evaluator can reopen it.
 */
evaluationsRouter.put('/:employeeId', (req, res) => {
  const p = readPeriod(req, res)
  if (!p) return
  const employee = employeeById.get(req.params.employeeId)
  if (!employee) return res.status(404).json({ error: 'Employee not found' })
  if (!canEvaluate(req.user, employee)) {
    return res.status(403).json({ error: 'You can only evaluate people in your team' })
  }

  const existing = evaluationFor.get(employee.id, p.period)
  if (existing?.status === 'final' && !atLeast(req.user, 'admin')) {
    return res.status(409).json({ error: 'This evaluation is final. Ask an admin to reopen it.' })
  }

  const status = req.body?.status === 'final' ? 'final' : 'draft'
  const kpis = (Array.isArray(req.body?.kpis) ? req.body.kpis : []).map((k, i) => ({
    title: String(k.title || '').trim(),
    metric: METRICS[k.metric] ? k.metric : 'manual',
    target: k.metric === 'manual' || k.target === '' || k.target == null ? null : Math.max(0, Number(k.target) || 0),
    weight: Math.max(0, Math.min(10, Math.round(Number(k.weight) || 0))),
    rating: k.rating ? Math.max(1, Math.min(5, Math.round(Number(k.rating)))) : null,
    position: i,
  }))
  if (!kpis.length) return res.status(400).json({ error: 'Add at least one KPI' })
  if (kpis.some(k => !k.title)) return res.status(400).json({ error: 'Every KPI needs a name' })
  if (kpis.some(k => k.metric !== 'manual' && !k.target)) {
    return res.status(400).json({ error: 'Measured KPIs need a target above zero' })
  }

  const metrics = measure(employee.id, p.range)
  const result = score(kpis, metrics)
  if (status === 'final') {
    const unrated = kpis.find(k => k.metric === 'manual' && !k.rating)
    if (unrated) return res.status(400).json({ error: `Rate "${unrated.title}" before finalising` })
    if (result.score == null) return res.status(400).json({ error: 'Nothing to score yet' })
  }

  const summary = String(req.body?.summary || '').trim() || null
  db.exec('BEGIN')
  try {
    let id = existing?.id
    if (id) {
      db.prepare(`UPDATE evaluations SET evaluator_id = ?, status = ?, summary = ?, score = ?,
                    finalized_at = CASE WHEN ? = 'final' THEN datetime('now') ELSE NULL END,
                    updated_at = datetime('now') WHERE id = ?`)
        .run(req.user.id, status, summary, result.score, status, id)
      db.prepare('DELETE FROM kpis WHERE evaluation_id = ?').run(id)
    } else {
      id = Number(db.prepare(`INSERT INTO evaluations (employee_id, period, evaluator_id, status, summary, score, finalized_at)
                              VALUES (?, ?, ?, ?, ?, ?, CASE WHEN ? = 'final' THEN datetime('now') END)`)
        .run(employee.id, p.period, req.user.id, status, summary, result.score, status).lastInsertRowid)
    }
    const insert = db.prepare(`INSERT INTO kpis (evaluation_id, title, metric, target, weight, rating, position)
                               VALUES (?, ?, ?, ?, ?, ?, ?)`)
    for (const k of kpis) insert.run(id, k.title, k.metric, k.target, k.weight, k.rating, k.position)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }

  res.json({ ...detail(employee, p.period, p.range), canEdit: true, canReopen: atLeast(req.user, 'admin') })
})
