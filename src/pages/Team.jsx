import { useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Avatar } from '../components/ui.jsx'

export function Team() {
  const { employees } = useOutletContext()
  const [search, setSearch] = useState('')
  const [dept, setDept] = useState('')

  const departments = useMemo(
    () => [...new Set(employees.map(e => e.department))].sort(),
    [employees],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return employees.filter(e => {
      if (dept && e.department !== dept) return false
      if (!q) return true
      return e.full_name.toLowerCase().includes(q) ||
        (e.job_title || '').toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q)
    })
  }, [employees, search, dept])

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
          onChange={e => setDept(e.target.value)}>
          <option value="">All departments</option>
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <div className="spacer" />
        <span className="tiny dim">{filtered.length} of {employees.length}</span>
      </div>

      <div className="page-scroll">
        <div className="team-grid">
          {filtered.map(e => (
            <div className="member-card" key={e.id}>
              <Avatar name={e.full_name} color={e.avatar_color} size="lg" />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="truncate" style={{ fontWeight: 600 }}>{e.full_name}</div>
                <div className="truncate tiny muted">{e.job_title}</div>
                <div className="truncate tiny dim">{e.email}</div>
              </div>
              {e.role !== 'member' && <span className="badge badge-accent">{e.role}</span>}
            </div>
          ))}
        </div>
        {filtered.length === 0 && <div className="empty-state">No one matches that search.</div>}
      </div>
    </div>
  )
}
