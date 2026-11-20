import { db } from './db.js'

/**
 * Role ladder. Each role can do everything the roles below it can.
 *
 *   super_admin  owns the workspace: grants admin rights, evaluates admins
 *   admin        manages people, roles (up to manager) and every project
 *   manager      runs projects and evaluates their department / project team
 *   member       works on tasks and sees their own evaluations
 */
export const ROLES = ['member', 'manager', 'admin', 'super_admin']
export const RANK = Object.fromEntries(ROLES.map((r, i) => [r, i]))

export const rank = user => RANK[user?.role] ?? 0
export const atLeast = (user, role) => rank(user) >= RANK[role]

/** May `actor` change this person's role, status or password? */
export function canAdminister(actor, target) {
  if (!atLeast(actor, 'admin') || actor.id === target.id) return false
  return rank(actor) > rank(target) || actor.role === 'super_admin'
}

/** Highest role `actor` may hand out. A super admin can appoint another. */
export function maxGrantable(actor) {
  if (actor.role === 'super_admin') return 'super_admin'
  if (actor.role === 'admin') return 'manager'
  return null
}

/** Ids of projects this person leads. */
const ledProjects = db.prepare('SELECT id FROM projects WHERE lead_id = ? AND archived = 0')

/**
 * Who may set KPIs for and evaluate an employee:
 *  - anyone ranked above them who is an admin or super admin;
 *  - a manager, for people below them in the same department;
 *  - the manager or lead of the employee's team;
 *  - a project lead (any role), for people with tasks on a project they lead.
 * Nobody evaluates themselves or someone ranked above them.
 */
export function canEvaluate(actor, emp) {
  if (!actor || !emp || actor.id === emp.id) return false
  if (rank(emp) > rank(actor)) return false
  if (atLeast(actor, 'admin')) return rank(actor) > rank(emp) || actor.role === 'super_admin'
  if (actor.role === 'manager' && rank(emp) < rank(actor) && actor.department === emp.department) return true
  return runsTeamOf(actor.id, emp.id) || leadsWorkOf(actor.id, emp.id)
}

/** Is `actorId` the manager or lead of the team `empId` belongs to? */
export function runsTeamOf(actorId, empId) {
  return !!db.prepare(`
    SELECT 1 FROM employees e JOIN teams t ON t.id = e.team_id
    WHERE e.id = ? AND (t.manager_id = ? OR t.lead_id = ?)`).get(empId, actorId, actorId)
}

export function leadsWorkOf(leadId, empId) {
  return !!db.prepare(`
    SELECT 1 FROM tasks t JOIN projects p ON p.id = t.project_id
    WHERE p.lead_id = ? AND p.archived = 0 AND t.assignee_id = ? LIMIT 1`).get(leadId, empId)
}

/** Everyone `actor` may evaluate, used for the "My team" list. */
export function evaluableEmployees(actor) {
  const all = db.prepare(`SELECT id, full_name, job_title, department, role, avatar_color, email
                          FROM employees WHERE active = 1 ORDER BY department, full_name`).all()
  if (atLeast(actor, 'admin')) return all.filter(e => canEvaluate(actor, e))

  const projectIds = ledProjects.all(actor.id).map(p => p.id)
  const viaProjects = new Set(projectIds.length
    ? db.prepare(`SELECT DISTINCT assignee_id AS id FROM tasks
                  WHERE assignee_id IS NOT NULL AND project_id IN (${projectIds.map(() => '?').join(',')})`)
      .all(...projectIds).map(r => r.id)
    : [])

  const viaTeams = new Set(db.prepare(`
    SELECT e.id FROM employees e JOIN teams t ON t.id = e.team_id
    WHERE t.manager_id = ? OR t.lead_id = ?`).all(actor.id, actor.id).map(r => r.id))

  return all.filter(e => e.id !== actor.id && rank(e) <= rank(actor) && (
    viaProjects.has(e.id) || viaTeams.has(e.id) ||
    (actor.role === 'manager' && rank(e) < rank(actor) && e.department === actor.department)
  ))
}

/**
 * Make sure the workspace has an owner. Uses SUPER_ADMIN_EMAIL when set,
 * otherwise promotes the CEO (or, failing that, the longest-standing admin).
 */
export function ensureSuperAdmin() {
  if (db.prepare("SELECT 1 FROM employees WHERE role = 'super_admin' AND active = 1").get()) return
  const email = (process.env.SUPER_ADMIN_EMAIL || '').trim()
  const pick = (email && db.prepare('SELECT id FROM employees WHERE email = ? COLLATE NOCASE').get(email)) ||
    db.prepare(`SELECT id FROM employees WHERE active = 1 AND (job_title LIKE '%CEO%' OR role = 'admin')
                ORDER BY CASE WHEN job_title LIKE '%CEO%' THEN 0 ELSE 1 END, id LIMIT 1`).get()
  if (pick) db.prepare("UPDATE employees SET role = 'super_admin' WHERE id = ?").run(pick.id)
}
