import { useMemo, useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { Avatar } from './ui.jsx'

/** One employee, draggable onto any task card to assign them. */
function PersonRow({ employee, load }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `emp-${employee.id}`,
    data: { type: 'employee', employee },
  })

  return (
    <div
      ref={setNodeRef}
      className={`person-row${isDragging ? ' dragging' : ''}`}
      title={`Drag ${employee.full_name} onto a task to assign`}
      {...listeners}
      {...attributes}
    >
      <Avatar name={employee.full_name} color={employee.avatar_color} size="md" />
      <div className="person-info">
        <div className="person-name">{employee.full_name}</div>
        <div className="person-title">{employee.job_title}</div>
      </div>
      {load > 0 && <span className="person-load" title={`${load} open tasks`}>{load}</span>}
    </div>
  )
}

/**
 * Sidebar of every employee, grouped by department.
 * Rows are draggable; dropping one on a task card assigns it.
 */
export function PeoplePanel({ employees, workload = {}, defaultDepartment }) {
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState(() => new Set())

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = q
      ? employees.filter(e =>
          e.full_name.toLowerCase().includes(q) ||
          (e.job_title || '').toLowerCase().includes(q) ||
          (e.department || '').toLowerCase().includes(q))
      : employees

    const byDept = new Map()
    for (const e of filtered) {
      const dept = e.department || 'Unassigned'
      if (!byDept.has(dept)) byDept.set(dept, [])
      byDept.get(dept).push(e)
    }

    // The project's own department floats to the top — that is who you assign most.
    return [...byDept.entries()].sort(([a], [b]) => {
      if (a === defaultDepartment) return -1
      if (b === defaultDepartment) return 1
      return a.localeCompare(b)
    })
  }, [employees, search, defaultDepartment])

  const toggle = dept => setCollapsed(prev => {
    const next = new Set(prev)
    if (next.has(dept)) next.delete(dept)
    else next.add(dept)
    return next
  })

  return (
    <aside className="people-panel">
      <div className="people-head">
        <div className="row mb-8">
          <h3>Team</h3>
          <div className="spacer" />
          <span className="tiny dim">{employees.length}</span>
        </div>
        <input
          className="input"
          placeholder="Search people…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <p className="hint mt-8">Drag a person onto a task to assign it.</p>
      </div>

      <div className="people-list">
        {groups.length === 0 && <div className="empty-state tiny">No one matches that search.</div>}

        {groups.map(([dept, people]) => {
          const isOpen = !collapsed.has(dept)
          return (
            <div className="dept-group" key={dept}>
              <button className="dept-head" onClick={() => toggle(dept)} aria-expanded={isOpen}>
                <span>{isOpen ? '▾' : '▸'}</span>
                <span className="truncate">{dept}</span>
                <span className="count">{people.length}</span>
              </button>
              {isOpen && people.map(e => (
                <PersonRow key={e.id} employee={e} load={workload[e.id] || 0} />
              ))}
            </div>
          )
        })}
      </div>
    </aside>
  )
}
