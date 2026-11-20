import { Router } from 'express'
import { db } from '../db.js'
import { atLeast } from '../roles.js'

/**
 * Teams: small groups with a manager and a team lead.
 *
 *   super admin
 *     └─ manager            (can run several teams)
 *          └─ team          (lead + members)
 *
 * Admins create, edit and delete teams and can move anyone. A manager can
 * edit the teams they run and move people between those teams (or pull in
 * people who have no team yet).
 */
export const teamsRouter = Router()

const teamSelect = `
  SELECT t.*, m.full_name AS manager_name, m.avatar_color AS manager_color,
         l.full_name AS lead_name, l.avatar_color AS lead_color,
         (SELECT COUNT(*) FROM employees e WHERE e.team_id = t.id AND e.active = 1) AS member_count
  FROM teams t
  LEFT JOIN employees m ON m.id = t.manager_id
  LEFT JOIN employees l ON l.id = t.lead_id`

const getTeam = id => db.prepare(`${teamSelect} WHERE t.id = ?`).get(id)
const getEmployee = id => db.prepare('SELECT id, full_name, role, team_id, department FROM employees WHERE id = ?').get(id)

const managesTeam = (user, team) => atLeast(user, 'admin') || (team && team.manager_id === user.id)

function checkManager(managerId) {
  if (!managerId) return null
  const m = getEmployee(managerId)
  if (!m) return 'That manager does not exist'
  if (!atLeast(m, 'manager')) return `${m.full_name} needs the Manager role (or higher) to run a team`
  return null
}

/** Put someone in a team; if they led their old team, that team loses its lead. */
function placeInTeam(employeeId, teamId) {
  const emp = getEmployee(employeeId)
  if (emp.team_id && emp.team_id !== teamId) {
    db.prepare('UPDATE teams SET lead_id = NULL WHERE id = ? AND lead_id = ?').run(emp.team_id, employeeId)
  }
  db.prepare('UPDATE employees SET team_id = ? WHERE id = ?').run(teamId, employeeId)
}

/** GET /api/teams */
teamsRouter.get('/', (_req, res) => {
  res.json(db.prepare(`${teamSelect} ORDER BY m.full_name IS NULL, m.full_name, t.name`).all())
})

/** POST /api/teams { name, department, managerId, leadId, color } */
teamsRouter.post('/', (req, res) => {
  if (!atLeast(req.user, 'admin')) return res.status(403).json({ error: 'Only admins can create teams' })
  const name = String(req.body?.name || '').trim()
  if (!name) return res.status(400).json({ error: 'Team name is required' })
  const bad = checkManager(req.body.managerId)
  if (bad) return res.status(400).json({ error: bad })

  const id = Number(db.prepare(`INSERT INTO teams (name, department, manager_id, color) VALUES (?, ?, ?, ?)`)
    .run(name, req.body.department || null, req.body.managerId || null, req.body.color || '#6366f1').lastInsertRowid)
  if (req.body.leadId) {
    placeInTeam(Number(req.body.leadId), id)
    db.prepare('UPDATE teams SET lead_id = ? WHERE id = ?').run(req.body.leadId, id)
  }
  res.status(201).json(getTeam(id))
})

/**
 * POST /api/teams/from-departments — one-click start: a team per department,
 * run by that department's manager, with everyone in it as members.
 */
teamsRouter.post('/from-departments', (req, res) => {
  if (!atLeast(req.user, 'admin')) return res.status(403).json({ error: 'Only admins can do that' })
  if (db.prepare('SELECT 1 FROM teams LIMIT 1').get()) {
    return res.status(409).json({ error: 'Teams already exist' })
  }
  const depts = db.prepare(`SELECT department AS name, COUNT(*) AS n FROM employees
                            WHERE active = 1 AND department IS NOT NULL AND department != 'Management'
                            GROUP BY department ORDER BY department`).all()
  db.exec('BEGIN')
  try {
    for (const d of depts) {
      const manager = db.prepare(`SELECT id FROM employees WHERE active = 1 AND department = ? AND role = 'manager'
                                  ORDER BY id LIMIT 1`).get(d.name)
      const color = db.prepare('SELECT color FROM projects WHERE name = ?').get(d.name)?.color || '#6366f1'
      const id = Number(db.prepare('INSERT INTO teams (name, department, manager_id, color) VALUES (?, ?, ?, ?)')
        .run(d.name, d.name, manager?.id ?? null, color).lastInsertRowid)
      // Members: everyone in the department ranked below manager. Managers run teams; they are not in them.
      db.prepare(`UPDATE employees SET team_id = ? WHERE department = ? AND role = 'member' AND team_id IS NULL`)
        .run(id, d.name)
    }
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  res.status(201).json(db.prepare(`${teamSelect} ORDER BY t.name`).all())
})

/** PATCH /api/teams/:id { name, department, managerId, leadId, color } */
teamsRouter.patch('/:id', (req, res) => {
  const team = getTeam(req.params.id)
  if (!team) return res.status(404).json({ error: 'Team not found' })
  if (!managesTeam(req.user, team)) return res.status(403).json({ error: 'Only an admin or this team’s manager can edit it' })

  const sets = []
  const params = []
  for (const [key, col] of [['name', 'name'], ['department', 'department'], ['color', 'color']]) {
    if (req.body[key] === undefined) continue
    const value = String(req.body[key] ?? '').trim()
    if (key === 'name' && !value) return res.status(400).json({ error: 'Team name is required' })
    sets.push(`${col} = ?`)
    params.push(value || null)
  }
  if (req.body.managerId !== undefined && Number(req.body.managerId || 0) !== (team.manager_id || 0)) {
    if (!atLeast(req.user, 'admin')) return res.status(403).json({ error: 'Only admins can change who manages a team' })
    const bad = checkManager(req.body.managerId)
    if (bad) return res.status(400).json({ error: bad })
    sets.push('manager_id = ?')
    params.push(req.body.managerId || null)
  }
  if (req.body.leadId !== undefined) {
    const leadId = req.body.leadId ? Number(req.body.leadId) : null
    if (leadId) {
      const lead = getEmployee(leadId)
      if (!lead) return res.status(400).json({ error: 'That person does not exist' })
      if (lead.team_id !== team.id) {
        if (lead.team_id && !managesTeam(req.user, getTeam(lead.team_id))) {
          return res.status(403).json({ error: `${lead.full_name} is in another manager’s team` })
        }
        placeInTeam(leadId, team.id)
      }
    }
    sets.push('lead_id = ?')
    params.push(leadId)
  }
  if (sets.length) {
    params.push(team.id)
    db.prepare(`UPDATE teams SET ${sets.join(', ')} WHERE id = ?`).run(...params)
  }
  res.json(getTeam(team.id))
})

/** DELETE /api/teams/:id — members simply end up without a team. */
teamsRouter.delete('/:id', (req, res) => {
  if (!atLeast(req.user, 'admin')) return res.status(403).json({ error: 'Only admins can delete teams' })
  db.prepare('UPDATE employees SET team_id = NULL WHERE team_id = ?').run(req.params.id)
  const info = db.prepare('DELETE FROM teams WHERE id = ?').run(req.params.id)
  if (!info.changes) return res.status(404).json({ error: 'Team not found' })
  res.json({ ok: true })
})

/** PUT /api/teams/members/:employeeId { teamId } — move a person (teamId null = no team). */
teamsRouter.put('/members/:employeeId', (req, res) => {
  const emp = getEmployee(req.params.employeeId)
  if (!emp) return res.status(404).json({ error: 'Employee not found' })
  const teamId = req.body?.teamId ? Number(req.body.teamId) : null
  const to = teamId ? getTeam(teamId) : null
  if (teamId && !to) return res.status(404).json({ error: 'Team not found' })

  const from = emp.team_id ? getTeam(emp.team_id) : null
  if (!atLeast(req.user, 'admin')) {
    // Managers move people between their own teams, and pull in people with no team.
    if ((from && !managesTeam(req.user, from)) || (to && !managesTeam(req.user, to)) || (!from && !to)) {
      return res.status(403).json({ error: 'You can only move people between teams you manage' })
    }
  }
  if (atLeast(emp, 'manager') && to && to.manager_id === emp.id) {
    return res.status(400).json({ error: `${emp.full_name} already manages ${to.name}` })
  }
  placeInTeam(emp.id, teamId)
  res.json({ id: emp.id, team_id: teamId })
})
