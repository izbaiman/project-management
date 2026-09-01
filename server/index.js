import express from 'express'
import cors from 'cors'
import { existsSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { db } from './db.js'
import { authRouter, requireAuth } from './auth.js'
import { employeesRouter } from './routes/employees.js'
import { projectsRouter, columnsRouter } from './routes/projects.js'
import { tasksRouter } from './routes/tasks.js'
import { sprintsRouter } from './routes/sprints.js'
import { seed } from './seed.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST_DIR = join(__dirname, '..', 'dist')

const PORT = Number(process.env.API_PORT) || 4000
// 0.0.0.0 makes the server reachable from other machines on the LAN.
const HOST = process.env.HOST || '0.0.0.0'

// First run on a fresh clone: import the employee CSV automatically.
seed({ verbose: false })

const app = express()

/*
 * In both supported setups the browser only ever talks to one origin — Vite
 * proxies /api in development, and in production this server serves the built
 * app itself — so cross-origin requests are refused unless explicitly allowed.
 */
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean)
if (allowedOrigins.length) {
  app.use(cors({ origin: allowedOrigins }))
}

app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    employees: db.prepare('SELECT COUNT(*) AS n FROM employees').get().n,
    projects: db.prepare('SELECT COUNT(*) AS n FROM projects').get().n,
    tasks: db.prepare('SELECT COUNT(*) AS n FROM tasks').get().n,
  })
})

app.use('/api/auth', authRouter)

// Everything below this line requires a valid session.
app.use('/api/employees', requireAuth, employeesRouter)
app.use('/api/projects', requireAuth, projectsRouter)
app.use('/api/columns', requireAuth, columnsRouter)
app.use('/api/tasks', requireAuth, tasksRouter)
app.use('/api/sprints', requireAuth, sprintsRouter)

/** Dashboard rollup for the landing screen. */
app.get('/api/stats', requireAuth, (req, res) => {
  res.json({
    myTasks: db.prepare(`
      SELECT t.*, p.key AS project_key, c.name AS column_name, c.is_done
      FROM tasks t
      LEFT JOIN projects p ON p.id = t.project_id
      LEFT JOIN board_columns c ON c.id = t.column_id
      WHERE t.assignee_id = ? ORDER BY
        CASE t.priority WHEN 'highest' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2
                        WHEN 'low' THEN 3 ELSE 4 END, t.due_date
      LIMIT 50`).all(req.user.id),

    byPriority: db.prepare(
      'SELECT priority, COUNT(*) AS count FROM tasks GROUP BY priority').all(),

    byDepartment: db.prepare(`
      SELECT e.department, COUNT(t.id) AS count
      FROM tasks t JOIN employees e ON e.id = t.assignee_id
      GROUP BY e.department ORDER BY count DESC`).all(),

    recentActivity: db.prepare(`
      SELECT a.*, e.full_name AS actor_name, e.avatar_color AS actor_color,
             t.key AS task_key, t.title AS task_title
      FROM activity a
      LEFT JOIN employees e ON e.id = a.actor_id
      LEFT JOIN tasks t ON t.id = a.task_id
      ORDER BY a.created_at DESC, a.id DESC LIMIT 25`).all(),
  })
})

app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown endpoint' }))

// Serve the production build, if one has been made. Any unknown path falls
// through to index.html so client-side routes survive a refresh.
const hasBuild = existsSync(join(DIST_DIR, 'index.html'))
if (hasBuild) {
  app.use(express.static(DIST_DIR))
  app.use((_req, res) => res.sendFile(join(DIST_DIR, 'index.html')))
}

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: 'Something went wrong on the server' })
})

/** Every non-internal IPv4 address, so the startup banner can list real URLs. */
export function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter(i => i && i.family === 'IPv4' && !i.internal)
    .map(i => i.address)
}

app.listen(PORT, HOST, () => {
  const addresses = lanAddresses()
  console.log()
  if (hasBuild) {
    console.log('  Top Edge PM is running')
    console.log(`  Local:    http://localhost:${PORT}`)
    for (const address of addresses) {
      console.log(`  Network:  http://${address}:${PORT}`)
    }
    console.log('\n  Share a Network URL with your team.')
  } else {
    console.log(`  API listening on http://localhost:${PORT}`)
    for (const address of addresses) {
      console.log(`  API on the network: http://${address}:${PORT}`)
    }
    console.log('\n  No production build found — run "npm run build" to serve the')
    console.log('  app from this port too, or use "npm run dev" for development.')
  }
  if (!process.env.JWT_SECRET) {
    console.log('\n  JWT_SECRET is not set; using the generated key in data/jwt.secret.')
  }
  console.log()
})
