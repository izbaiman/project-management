/**
 * Fills the seeded projects with a realistic set of tasks so the board is not
 * empty on first run. Safe to re-run: it clears demo tasks first.
 *
 *   npm run demo
 */
import { db, GAP } from './db.js'

const WORK = {
  'Apps Studio': [
    ['Fix crash on Android 15 splash screen', 'bug', 'highest', 3],
    ['Add dark mode to the settings screen', 'story', 'high', 5],
    ['Migrate analytics SDK to v7', 'task', 'medium', 3],
    ['Reduce cold start time below 1.5s', 'story', 'high', 8],
    ['In-app review prompt not firing on iOS', 'bug', 'high', 2],
    ['Set up Play Store staged rollout', 'task', 'medium', 2],
    ['Redesign onboarding carousel', 'story', 'medium', 5],
    ['Upgrade to Kotlin 2.1', 'task', 'low', 5],
    ['Add offline caching for the feed', 'story', 'high', 8],
    ['Crash-free rate dropped to 98.2%', 'bug', 'highest', 5],
  ],
  'Games Development': [
    ['Level 12 boss difficulty tuning', 'task', 'medium', 3],
    ['Unity build failing on IL2CPP', 'bug', 'highest', 5],
    ['Add daily rewards system', 'story', 'high', 8],
    ['Optimise texture atlas for low-end devices', 'task', 'high', 5],
    ['Character animation blending glitch', 'bug', 'medium', 3],
    ['Implement in-game shop UI', 'story', 'high', 8],
    ['Balance economy for season 2', 'task', 'medium', 5],
    ['Add controller support', 'story', 'low', 8],
  ],
  'Marketing': [
    ['Q4 campaign creative brief', 'task', 'high', 3],
    ['ASO keyword refresh for top 10 apps', 'task', 'high', 5],
    ['Launch TikTok UA test campaign', 'story', 'medium', 3],
    ['Competitor teardown — top 5 rivals', 'task', 'medium', 5],
    ['YouTube thumbnail A/B test', 'task', 'low', 2],
    ['Update store listing screenshots', 'task', 'medium', 3],
    ['Influencer outreach — gaming vertical', 'story', 'medium', 5],
    ['Monthly performance report automation', 'task', 'low', 3],
  ],
  'Software': [
    ['Set up CI pipeline for the API', 'task', 'high', 5],
    ['Add rate limiting to public endpoints', 'story', 'high', 3],
    ['Database backup job silently failing', 'bug', 'highest', 3],
    ['Write integration tests for auth flow', 'task', 'medium', 5],
    ['Document the internal REST API', 'task', 'low', 3],
  ],
  'E-Marketing': [
    ['Email drip sequence for new signups', 'story', 'high', 5],
    ['Landing page conversion audit', 'task', 'medium', 3],
    ['Set up UTM tagging convention', 'task', 'medium', 2],
    ['Retargeting pixel not firing', 'bug', 'high', 2],
  ],
  'Accounts': [
    ['Close August books', 'task', 'highest', 5],
    ['Vendor payment reconciliation', 'task', 'high', 3],
    ['Automate monthly invoice generation', 'story', 'medium', 5],
  ],
  'HR': [
    ['Roll out Q3 performance reviews', 'story', 'high', 8],
    ['Update onboarding handbook', 'task', 'medium', 3],
    ['Plan the annual team offsite', 'task', 'low', 5],
    ['Draft the remote work policy', 'task', 'medium', 3],
  ],
  'IT & Networking': [
    ['Replace failing switch in server room', 'task', 'highest', 3],
    ['Roll out endpoint protection to all laptops', 'story', 'high', 5],
    ['Office VPN dropping intermittently', 'bug', 'high', 3],
  ],
  'Management': [
    ['Approve Q4 department budgets', 'task', 'highest', 5],
    ['Quarterly all-hands deck', 'task', 'high', 3],
  ],
  'Administration': [
    ['Renew office lease paperwork', 'task', 'high', 3],
    ['Restock office supplies', 'task', 'lowest', 1],
  ],
}

// Roughly how a healthy board looks: most work waiting, some moving, some done.
const SPREAD = [1, 1, 2, 2, 2, 3, 3, 4, 4, 0]

export function loadDemo({ verbose = true } = {}) {
  const log = verbose ? console.log : () => {}

  db.exec('DELETE FROM activity WHERE task_id IS NOT NULL')
  db.exec('DELETE FROM comments')
  db.exec('DELETE FROM tasks')
  db.exec("DELETE FROM sqlite_sequence WHERE name IN ('tasks','comments')")
  db.exec('UPDATE projects SET seq = 0')

  const projects = db.prepare('SELECT * FROM projects').all()
  const insertTask = db.prepare(`
    INSERT INTO tasks (project_id, key, title, description, type, priority, column_id,
                       sprint_id, assignee_id, reporter_id, story_points, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)

  let total = 0

  for (const project of projects) {
    const items = WORK[project.name]
    if (!items?.length) continue

    const columns = db.prepare(
      'SELECT * FROM board_columns WHERE project_id = ? ORDER BY position').all(project.id)
    const sprint = db.prepare(
      "SELECT * FROM sprints WHERE project_id = ? AND status = 'active'").get(project.id)
    const staff = db.prepare(
      'SELECT id FROM employees WHERE department = ? ORDER BY full_name').all(project.name)
    const lead = project.lead_id

    let position = GAP
    items.forEach(([title, type, priority, points], i) => {
      const column = columns[SPREAD[i % SPREAD.length] % columns.length] || columns[0]
      // Leave roughly one in four unassigned so there is something to drag people onto.
      const assignee = i % 4 === 3 ? null : staff[i % staff.length]?.id ?? null
      // The last two of each set stay in the backlog for sprint planning.
      const inSprint = i < items.length - 2

      insertTask.run(
        project.id,
        `${project.key}-${i + 1}`,
        title,
        null,
        type,
        priority,
        column.id,
        inSprint ? sprint?.id ?? null : null,
        assignee,
        lead,
        points,
        position,
      )
      position += GAP
      total++
    })

    db.prepare('UPDATE projects SET seq = ? WHERE id = ?').run(items.length, project.id)
  }

  log(`Created ${total} demo tasks across ${projects.length} projects`)
  return { tasks: total }
}

import { fileURLToPath } from 'node:url'
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  loadDemo()
}
