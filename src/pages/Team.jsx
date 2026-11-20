import { useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { api } from '../api.js'
import { ROLES, ROLE_LABEL, ROLE_RANK, useAuth } from '../context/AuthContext.jsx'
import { Avatar, Icon, RoleBadge, useToast } from '../components/ui.jsx'

export function Team() {
  const { employees, reload } = useOutletContext()
  const { user, canManage } = useAuth()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [dept, setDept] = useState('')
  const [role, setRole] = useState('')
  const [teams, setTeams] = useState([])

  useEffect(() => { api.teams().then(setTeams).catch(() => {}) }, [employees])
  const teamById = useMemo(() => new Map(teams.map(t => [t.id, t])), [teams])

  const departments = useMemo(
    () => [...new Set(employees.map(e => e.department))].sort(),
    [employees],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return employees.filter(e => {
      if (dept && e.department !== dept) return false
      if (role && e.role !== role) return false
      if (!q) return true
      return e.full_name.toLowerCase().includes(q) ||
        (e.job_title || '').toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q)
    })
  }, [employees, search, dept, role])

  // Same rules as server/roles.js: admins manage people ranked below them and
  // hand out roles up to manager; a super admin can appoint admins too.
  const myRank = ROLE_RANK[user.role]
  const maxGrant = user.role === 'super_admin' ? ROLE_RANK.super_admin : ROLE_RANK.manager
  const canChange = e => myRank >= ROLE_RANK.admin && e.id !== user.id &&
    (myRank > ROLE_RANK[e.role] || user.role === 'super_admin')

  const changeRole = async (e, next) => {
    if (next === e.role) return
    if (ROLE_RANK[next] >= ROLE_RANK.admin &&
      !window.confirm(`Give ${e.full_name} ${ROLE_LABEL[next]} access? They will be able to manage people and every project.`)) return
    try {
      await api.updateEmployee(e.id, { role: next })
      toast.show(`${e.full_name} is now ${ROLE_LABEL[next]}`)
      reload()
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <div className="main">
      <div className="page-head">
        <div className="page-head-text">
          <div className="breadcrumb">People</div>
          <h1>Team directory</h1>
        </div>
      </div>

      <div className="toolbar">
        <input
          className="input search-input"
          placeholder="Search name, role or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="select" style={{ width: 'auto' }} value={dept}
          onChange={e => setDept(e.target.value)} aria-label="Department">
          <option value="">All departments</option>
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select className="select" style={{ width: 'auto' }} value={role}
          onChange={e => setRole(e.target.value)} aria-label="Access level">
          <option value="">All access levels</option>
          {[...ROLES].reverse().map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
        <div className="spacer" />
        <span className="tiny dim">{filtered.length} of {employees.length}</span>
      </div>

      <div className="page-scroll">
        <div className="team-grid">
          {filtered.map(e => (
            <div className="member-card" key={e.id}>
              <div className="member-main">
                <Avatar name={e.full_name} color={e.avatar_color} size="lg" />
                <div className="member-info">
                  <div className="member-name truncate" title={e.full_name}>{e.full_name}</div>
                  <div className="truncate tiny muted" title={e.job_title}>{e.job_title}</div>
                  <div className="truncate tiny dim" title={e.email}>{e.email}</div>
                </div>
              </div>
              <div className="member-foot">
                {canChange(e) ? (
                  <select className={`select role-select role-${e.role}`} value={e.role}
                    aria-label={`Access level for ${e.full_name}`}
                    onChange={ev => changeRole(e, ev.target.value)}>
                    {ROLES.filter(r => ROLE_RANK[r] <= maxGrant || r === e.role)
                      .map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                ) : (
                  <RoleBadge role={e.role} />
                )}
                {teamById.get(e.team_id) ? (
                  <span className="badge member-dept member-team" title={`Team ${teamById.get(e.team_id).name} · ${e.department}`}
                    style={{ '--team': teamById.get(e.team_id).color }}>
                    {teamById.get(e.team_id).lead_id === e.id && <Icon name="star" size={10} />}
                    {teamById.get(e.team_id).name}
                  </span>
                ) : (
                  <span className="badge member-dept" title={e.department}>{e.department}</span>
                )}
                {canManage && e.id !== user.id && ROLE_RANK[e.role] <= myRank && (
                  <Link className="member-eval" to={`/evaluations?employee=${e.id}`} title="Open evaluation">
                    <Icon name="award" size={13} /> Evaluate
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
        {filtered.length === 0 && (
          <div className="empty-state">
            <span className="empty-icon"><Icon name="search" size={22} /></span>
            <div className="empty-title">No one matches that search</div>
            <div className="tiny">Try a different name, role or department.</div>
          </div>
        )}
      </div>
    </div>
  )
}
