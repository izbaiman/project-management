import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'
import { db, GAP } from './db.js'
import { parseCsvObjects } from './csv.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CSV_PATH = process.env.EMPLOYEE_CSV || join(__dirname, '..', 'data', 'employees.csv')

export const DEFAULT_PASSWORD = process.env.DEFAULT_PASSWORD || 'topedge123'

/** Merge the near-duplicate department spellings found in the source sheet. */
const DEPT_ALIASES = {
  'app studio': 'Apps Studio',
  'apps studio': 'Apps Studio',
  'games': 'Games Development',
  'games development': 'Games Development',
  'e_marketing': 'E-Marketing',
  'e marketing': 'E-Marketing',
  'it networking': 'IT & Networking',
  'software': 'Software',
  'marketing': 'Marketing',
  'accounts': 'Accounts',
  'hr': 'HR',
  'management': 'Management',
  'administration': 'Administration',
}

const DEPT_META = {
  'Marketing':         { key: 'MKT',   color: '#f59e0b' },
  'Apps Studio':       { key: 'APPS',  color: '#6366f1' },
  'Games Development': { key: 'GAME',  color: '#ec4899' },
  'Software':          { key: 'SOFT',  color: '#06b6d4' },
  'E-Marketing':       { key: 'EMKT',  color: '#f97316' },
  'Accounts':          { key: 'ACCT',  color: '#10b981' },
  'HR':                { key: 'HR',    color: '#8b5cf6' },
  'IT & Networking':   { key: 'IT',    color: '#3b82f6' },
  'Management':        { key: 'MGMT',  color: '#ef4444' },
  'Administration':    { key: 'ADMIN', color: '#64748b' },
  'Unassigned':        { key: 'GEN',   color: '#94a3b8' },
}

const AVATAR_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
  '#10b981', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6',
  '#a855f7', '#d946ef', '#ec4899', '#f43f5e',
]

function normalizeDept(raw) {
  const v = (raw || '').trim()
  if (!v || v === '-') return 'Unassigned'
  return DEPT_ALIASES[v.toLowerCase()] || v
}

function cleanTitle(raw) {
  const v = (raw || '').trim()
  if (!v || v === '-' || v === 'j/S') return 'Team Member'
  return v.charAt(0).toUpperCase() + v.slice(1)
}

/** The CEO is super admin; Management and heads are admins; team leads are managers. */
function deriveRole(title, dept) {
  const t = (title || '').toLowerCase()
  if (/ceo/.test(t)) return 'super_admin'
  if (dept === 'Management' || /\b(ceo|coo|director|head of)\b/.test(t)) return 'admin'
  if (/\b(team lead|team leader|lead|manager|hod|supervisor)\b/.test(t)) return 'manager'
  return 'member'
}

function colorFor(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

const DEFAULT_COLUMNS = [
  { name: 'Backlog',     is_done: 0 },
  { name: 'To Do',       is_done: 0 },
  { name: 'In Progress', is_done: 0, wip_limit: 5 },
  { name: 'In Review',   is_done: 0, wip_limit: 4 },
  { name: 'Done',        is_done: 1 },
]

export function seed({ force = false, verbose = true } = {}) {
  const log = verbose ? console.log : () => {}
  const existing = db.prepare('SELECT COUNT(*) AS n FROM employees').get().n

  if (existing > 0 && !force) {
    log(`Database already seeded (${existing} employees). Use --force to re-seed.`)
    return { skipped: true }
  }

  if (force) {
    log('Clearing existing data...')
    for (const t of ['kpis', 'evaluations', 'activity', 'comments', 'tasks', 'sprints', 'board_columns', 'projects', 'teams', 'employees']) {
      db.exec(`DELETE FROM ${t}`)
    }
    db.exec(`DELETE FROM sqlite_sequence WHERE name IN
             ('projects','board_columns','sprints','tasks','comments','activity')`)
  }

  const rows = parseCsvObjects(readFileSync(CSV_PATH, 'utf8'))
  log(`Read ${rows.length} rows from ${CSV_PATH}`)

  const passwordHash = bcrypt.hashSync(DEFAULT_PASSWORD, 10)

  const insertEmp = db.prepare(`
    INSERT INTO employees (id, username, full_name, job_title, department, company,
                           email, password_hash, role, avatar_color)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)

  const seenEmail = new Set()
  const seenId = new Set()
  const seenUsername = new Set()
  let empCount = 0
  const deptSet = new Set()

  for (const [i, r] of rows.entries()) {
    const fullName = (r['Full Name'] || '').trim()
    if (!fullName) continue

    let username = (r['Username'] || '').trim() ||
      fullName.toLowerCase().replace(/[^a-z0-9]+/g, '.')
    let email = (r['Email'] || '').trim().toLowerCase()
    if (!email) email = `${username}@topedgetechnologies.com`
    if (seenEmail.has(email)) continue          // skip duplicate people
    seenEmail.add(email)

    while (seenUsername.has(username)) username = `${username}_${i}`
    seenUsername.add(username)

    let id = parseInt(r['Emp ID'], 10)
    if (!Number.isFinite(id) || seenId.has(id)) id = 90000 + i   // synthesise a stable id
    seenId.add(id)

    const dept = normalizeDept(r['Department'])
    const title = cleanTitle(r['Job Title'])

    insertEmp.run(
      id,
      username,
      fullName,
      title,
      dept,
      (r['Company'] || '').trim() || 'Top Edge',
      email,
      passwordHash,
      deriveRole(title, dept),
      colorFor(fullName),
    )
    deptSet.add(dept)
    empCount++
  }
  log(`Imported ${empCount} employees`)

  // ---- One project per department -------------------------------------------
  const depts = [...deptSet].sort()
  const insertProject = db.prepare(`
    INSERT INTO projects (key, name, description, lead_id, color, position)
    VALUES (?, ?, ?, ?, ?, ?)`)
  const insertColumn = db.prepare(`
    INSERT INTO board_columns (project_id, name, position, wip_limit, is_done)
    VALUES (?, ?, ?, ?, ?)`)
  const insertSprint = db.prepare(`
    INSERT INTO sprints (project_id, name, goal, status, position)
    VALUES (?, ?, ?, ?, ?)`)
  const findLead = db.prepare(`
    SELECT id FROM employees WHERE department = ?
    ORDER BY CASE role WHEN 'super_admin' THEN 0 WHEN 'admin' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, full_name
    LIMIT 1`)

  const usedKeys = new Set()
  let pos = GAP
  let projectCount = 0

  for (const dept of depts) {
    const meta = DEPT_META[dept] || { key: dept.slice(0, 4).toUpperCase(), color: '#6366f1' }
    let key = meta.key
    let n = 2
    while (usedKeys.has(key)) key = `${meta.key}${n++}`
    usedKeys.add(key)

    const lead = findLead.get(dept)
    const info = insertProject.run(
      key, dept, `${dept} team workspace`, lead?.id ?? null, meta.color, pos,
    )
    const projectId = Number(info.lastInsertRowid)
    pos += GAP
    projectCount++

    let cpos = GAP
    for (const c of DEFAULT_COLUMNS) {
      insertColumn.run(projectId, c.name, cpos, c.wip_limit ?? null, c.is_done)
      cpos += GAP
    }

    insertSprint.run(projectId, `${key} Sprint 1`, `First sprint for ${dept}`, 'active', GAP)
    insertSprint.run(projectId, `${key} Sprint 2`, null, 'planned', GAP * 2)
  }
  log(`Created ${projectCount} projects, each with 5 columns and 2 sprints`)

  return { skipped: false, employees: empCount, projects: projectCount }
}

const invokedDirectly = process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1]

if (invokedDirectly) {
  const result = seed({ force: process.argv.includes('--force') })
  if (!result.skipped) console.log('Seed complete:', result)
}
