import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { api } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { Avatar, PriorityIcon, Spinner, TypeIcon, timeAgo } from '../components/ui.jsx'

export function Dashboard() {
  const { user } = useAuth()
  const { projects, employees } = useOutletContext()
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

  const goToTask = task => navigate(`/projects/${task.project_id}/board`)

  return (
    <div className="main">
      <div className="page-head">
        <div className="page-head-text">
          <div className="breadcrumb">Overview</div>
          <h1>Good to see you, {user.full_name.split(' ')[0]}</h1>
        </div>
      </div>

      <div className="page-scroll">
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-value">{openTasks.length}</div>
            <div className="stat-label">Your open tasks</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{projects.length}</div>
            <div className="stat-label">Projects</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{employees.length}</div>
            <div className="stat-label">People</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">
              {totalTasks ? Math.round((totalDone / totalTasks) * 100) : 0}%
            </div>
            <div className="stat-label">{totalDone} of {totalTasks} tasks done</div>
          </div>
        </div>

        <div className="two-col">
          <div>
            <div className="panel">
              <div className="panel-head">Assigned to you</div>
              <div className="panel-body">
                {stats.myTasks.length === 0 && (
                  <div className="empty-state">Nothing is assigned to you right now.</div>
                )}
                {stats.myTasks.map(t => (
                  <div className="list-row" key={t.id} onClick={() => goToTask(t)}>
                    <TypeIcon type={t.type} />
                    <span className="task-key">{t.key}</span>
                    <span className="truncate" style={{ flex: 1 }}>{t.title}</span>
                    <PriorityIcon priority={t.priority} />
                    <span className={`badge${t.is_done ? ' badge-success' : ''}`}>
                      {t.column_name}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">Projects</div>
              <div className="panel-body">
                {projects.map(p => {
                  const pct = p.task_count ? Math.round((p.done_count / p.task_count) * 100) : 0
                  return (
                    <div
                      className="list-row"
                      key={p.id}
                      onClick={() => navigate(`/projects/${p.id}/board`)}
                    >
                      <span className="project-dot" style={{ background: p.color }} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <div className="truncate">{p.name}</div>
                        <div className="bar-track mt-8" style={{ maxWidth: 260 }}>
                          <div className="bar-fill" style={{ width: `${pct}%`, background: p.color }} />
                        </div>
                      </span>
                      <span className="tiny dim">{p.done_count}/{p.task_count}</span>
                      <span className="badge">{p.key}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <div>
            <div className="panel">
              <div className="panel-head">Workload by department</div>
              <div className="panel-body">
                {stats.byDepartment.length === 0 && (
                  <div className="empty-state tiny">No tasks assigned yet.</div>
                )}
                {stats.byDepartment.map(d => {
                  const max = Math.max(...stats.byDepartment.map(x => x.count), 1)
                  return (
                    <div className="list-row" key={d.department} style={{ cursor: 'default' }}>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <div className="truncate tiny">{d.department}</div>
                        <div className="bar-track mt-8">
                          <div className="bar-fill" style={{ width: `${(d.count / max) * 100}%` }} />
                        </div>
                      </span>
                      <span className="tiny dim">{d.count}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">Recent activity</div>
              <div className="panel-body">
                {stats.recentActivity.length === 0 && (
                  <div className="empty-state tiny">Nothing has happened yet.</div>
                )}
                {stats.recentActivity.map(a => (
                  <div className="list-row" key={a.id} style={{ cursor: 'default' }}>
                    <Avatar name={a.actor_name} color={a.actor_color} />
                    <span className="tiny" style={{ flex: 1, minWidth: 0 }}>
                      <strong>{a.actor_name || 'Someone'}</strong>{' '}
                      {a.action.replace('task.', '').replace('sprint.', 'sprint ')}
                      {a.task_key && <> <span className="task-key">{a.task_key}</span></>}
                      {a.detail && <span className="dim"> — {a.detail}</span>}
                      <div className="dim">{timeAgo(a.created_at)}</div>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
