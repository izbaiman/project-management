import { useEffect, useState } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import { api } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { Avatar, Icon, PriorityIcon, Spinner, TypeIcon, timeAgo } from '../components/ui.jsx'

function StatCard({ icon, tone, value, label, children }) {
  return (
    <div className="stat-card">
      <span className={`stat-icon tone-${tone}`}><Icon name={icon} size={18} /></span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
        {children}
      </div>
    </div>
  )
}

/** Small progress ring for the project tiles. */
function Ring({ pct, color }) {
  const r = 15, c = 2 * Math.PI * r
  return (
    <span className="dash-ring">
      <svg viewBox="0 0 36 36" width="40" height="40" aria-hidden="true">
        <circle cx="18" cy="18" r={r} className="dash-ring-track" />
        <circle cx="18" cy="18" r={r} stroke={color} className="dash-ring-value"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
      </svg>
      <span>{pct}%</span>
    </span>
  )
}

function BoardTile({ p, showDept }) {
  const pct = p.task_count ? Math.round((p.done_count / p.task_count) * 100) : 0
  return (
    <Link className="dash-tile" to={`/projects/${p.id}/board`} style={{ '--tile': p.color }}>
      <div className="dash-tile-top">
        <span className="dash-tile-key">{p.key}</span>
        <Ring pct={pct} color={p.color} />
      </div>
      <div className="dash-tile-name truncate">{p.name}</div>
      {showDept && <div className="tiny muted truncate">{p.department || 'Cross-department'}</div>}
      <div className="dash-tile-foot">
        <span className="tiny muted">{p.done_count} of {p.task_count} done</span>
        {p.lead_name && (
          <span title={`Lead: ${p.lead_name}`}><Avatar name={p.lead_name} color={p.lead_color} /></span>
        )}
      </div>
    </Link>
  )
}

const VERBS = {
  'task.moved': 'moved',
  'task.assigned': 'assigned',
  'task.created': 'created',
  'project.created': 'created project',
}

export function Dashboard() {
  const { user, canManage } = useAuth()
  const { projects, employees, newProject } = useOutletContext()
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.stats().then(setStats).catch(e => setError(e.message))
  }, [])

  if (error) return <div className="page-scroll"><div className="error-banner">{error}</div></div>
  if (!stats) return <div className="loading-page"><Spinner /></div>

  const totalTasks = projects.reduce((n, p) => n + p.task_count, 0)
  const totalDone = projects.reduce((n, p) => n + p.done_count, 0)
  const openTasks = stats.myTasks.filter(t => !t.is_done)

  const donePct = totalTasks ? Math.round((totalDone / totalTasks) * 100) : 0
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
  const maxLoad = Math.max(...stats.byDepartment.map(x => x.count), 1)
  const departments = projects.filter(p => p.kind === 'department')
  const realProjects = projects.filter(p => p.kind !== 'department')
  const home = departments.find(p => p.name === user.department)

  return (
    <div className="main">
      <div className="page-scroll">
        <div className="dash">
          <header className="dash-hero">
            <div>
              <div className="breadcrumb">{today}</div>
              <h1>{greeting}, {user.full_name.split(' ')[0]}</h1>
              <p className="page-sub">
                {openTasks.length
                  ? `You have ${openTasks.length} open task${openTasks.length === 1 ? '' : 's'}.`
                  : 'You’re all caught up.'}
              </p>
            </div>
            <div className="dash-actions">
              {home && (
                <Link className="btn" to={`/projects/${home.id}/board`}>
                  <Icon name="board" size={15} /> {home.name} board
                </Link>
              )}
              {canManage && (
                <Link className="btn btn-primary" to="/evaluations">
                  <Icon name="award" size={15} /> Evaluations
                </Link>
              )}
            </div>
          </header>

          <div className="stat-grid">
            <StatCard icon="target" tone="accent" value={openTasks.length} label="Your open tasks" />
            <StatCard icon="folder" tone="violet" value={realProjects.length} label="Active projects">
              <div className="tiny dim mt-4">{departments.length} department boards</div>
            </StatCard>
            <StatCard icon="users" tone="teal" value={employees.length} label="People" />
            <StatCard icon="trend" tone="success" value={`${donePct}%`} label={`${totalDone} of ${totalTasks} tasks done`}>
              <div className="bar-track mt-8"><div className="bar-fill bar-success" style={{ width: `${donePct}%` }} /></div>
            </StatCard>
          </div>

          <div className="dash-grid">
            <div className="dash-col">
              <section className="panel">
                <div className="panel-head">
                  <Icon name="inbox" size={16} /> Assigned to you
                  {stats.myTasks.length > 0 && <span className="panel-count">{stats.myTasks.length}</span>}
                </div>
                <div className="panel-body">
                  {stats.myTasks.length === 0 ? (
                    <div className="dash-empty">
                      <span className="empty-icon"><Icon name="checkCircle" size={20} /></span>
                      <div>
                        <div className="empty-title">Nothing assigned to you</div>
                        <div className="tiny muted">Tasks people assign to you will show up here.</div>
                      </div>
                    </div>
                  ) : stats.myTasks.map(t => (
                    <div className="list-row" key={t.id} onClick={() => navigate(`/projects/${t.project_id}/board`)}>
                      <TypeIcon type={t.type} />
                      <span className="task-key">{t.key}</span>
                      <span className="truncate" style={{ flex: 1 }}>{t.title}</span>
                      <PriorityIcon priority={t.priority} />
                      <span className={`badge${t.is_done ? ' badge-success' : ''}`}>{t.column_name}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="panel">
                <div className="panel-head">
                  <Icon name="folder" size={16} /> Projects
                  <span className="panel-count">{realProjects.length}</span>
                  {canManage && realProjects.length > 0 && (
                    <button className="btn btn-sm" onClick={newProject}>
                      <Icon name="plus" size={14} /> New project
                    </button>
                  )}
                </div>
                {realProjects.length === 0 ? (
                  <div className="dash-empty">
                    <span className="empty-icon"><Icon name="folder" size={20} /></span>
                    <div style={{ flex: 1 }}>
                      <div className="empty-title">No projects yet</div>
                      <div className="tiny muted">
                        {canManage
                          ? 'Create a project for a piece of work, give it a lead and a department.'
                          : 'Projects your managers create will show up here.'}
                      </div>
                    </div>
                    {canManage && (
                      <button className="btn btn-primary btn-sm" onClick={newProject}>
                        <Icon name="plus" size={14} /> New project
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="dash-projects">
                    {realProjects.map(p => <BoardTile key={p.id} p={p} showDept />)}
                  </div>
                )}
              </section>

              <section className="panel">
                <div className="panel-head">
                  <Icon name="board" size={16} /> Departments
                  <span className="panel-count">{departments.length}</span>
                </div>
                <div className="dash-projects">
                  {departments.map(p => <BoardTile key={p.id} p={p} />)}
                </div>
              </section>
            </div>

            <div className="dash-col">
              <section className="panel">
                <div className="panel-head"><Icon name="users" size={16} /> Workload by department</div>
                <div className="dash-load">
                  {stats.byDepartment.length === 0 && <div className="empty-state tiny">No tasks assigned yet.</div>}
                  {stats.byDepartment.map(d => (
                    <div className="dash-load-row" key={d.department}>
                      <span className="truncate">{d.department}</span>
                      <strong>{d.count}</strong>
                      <span className="bar-track"><span className="bar-fill" style={{ width: `${(d.count / maxLoad) * 100}%` }} /></span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="panel">
                <div className="panel-head"><Icon name="activity" size={16} /> Recent activity</div>
                <div className="dash-feed">
                  {stats.recentActivity.length === 0 && <div className="empty-state tiny">Nothing has happened yet.</div>}
                  {stats.recentActivity.map(a => (
                    <div className="dash-feed-row" key={a.id}>
                      <Avatar name={a.actor_name} color={a.actor_color} />
                      <div className="dash-feed-text">
                        <div>
                          <strong>{a.actor_name || 'Someone'}</strong>{' '}
                          {VERBS[a.action] || a.action.replace(/^\w+\./, '')}
                          {a.task_key && <> <span className="task-key">{a.task_key}</span></>}
                          {a.detail && <>{a.action === 'task.moved' ? ' to ' : a.action === 'task.assigned' ? ' to ' : ' '}<span className="dash-feed-detail">{a.detail}</span></>}
                        </div>
                        <div className="tiny dim">{timeAgo(a.created_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
