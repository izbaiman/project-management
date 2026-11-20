import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { DndContext, DragOverlay, pointerWithin, useDraggable, useDroppable } from '@dnd-kit/core'
import { api } from '../api.js'
import { ROLE_RANK, useAuth } from '../context/AuthContext.jsx'
import { Avatar, Icon, Modal, RoleBadge, Spinner, useToast } from '../components/ui.jsx'
import { useDragSensors } from '../dnd.js'

/*
 * Org chart:  super admins / admins  →  managers  →  their teams (lead + members).
 * Drag a person onto a team to move them, or onto a team's "Lead" slot to make
 * them its lead. "No team" on the right holds everyone not yet placed.
 */

const SHOWN = 8

/** A team's "Lead" slot sits inside the team card; when both are under the pointer, the slot wins. */
const preferLeadSlot = args => {
  const hits = pointerWithin(args)
  const lead = hits.find(h => String(h.id).startsWith('lead-'))
  return lead ? [lead] : hits
}

function Person({ person, draggable, isLead, compact }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `emp-${person.id}`, data: { person }, disabled: !draggable,
  })
  return (
    <div ref={setNodeRef} {...listeners} {...attributes}
      className={`org-person${draggable ? ' can-drag' : ''}${isDragging ? ' is-dragging' : ''}${compact ? ' compact' : ''}`}
      title={draggable ? `Drag ${person.full_name} to another team` : person.full_name}>
      <Avatar name={person.full_name} color={person.avatar_color} />
      <span className="org-person-text">
        <span className="truncate">{person.full_name}</span>
        {!compact && <span className="tiny dim truncate">{person.job_title}</span>}
      </span>
      {isLead && <Icon name="star" size={13} className="org-lead-star" title="Team lead" />}
    </div>
  )
}

function Drop({ id, disabled, className, children }) {
  const { setNodeRef, isOver, active } = useDroppable({ id, disabled })
  return (
    <div ref={setNodeRef}
      className={`${className}${isOver && !disabled ? ' is-over' : ''}${active && !disabled ? ' can-drop' : ''}`}>
      {children}
    </div>
  )
}

function TeamCard({ team, members, canEdit, canDragFrom, onEdit }) {
  const [open, setOpen] = useState(false)
  const lead = members.find(m => m.id === team.lead_id)
  const rest = members.filter(m => m.id !== team.lead_id)
  const shown = open ? rest : rest.slice(0, SHOWN)

  return (
    <Drop id={`team-${team.id}`} disabled={!canEdit} className="org-team">
      <div className="org-team-bar" style={{ background: team.color }} />
      <div className="org-team-head">
        <div style={{ minWidth: 0 }}>
          <div className="org-team-name truncate">{team.name}</div>
          <div className="tiny dim truncate">{team.department || 'No department'} · {members.length} {members.length === 1 ? 'person' : 'people'}</div>
        </div>
        {canEdit && (
          <button className="btn btn-ghost btn-icon btn-xs" onClick={() => onEdit(team)} aria-label={`Edit ${team.name}`} title="Edit team">
            <Icon name="edit" size={14} />
          </button>
        )}
      </div>

      <Drop id={`lead-${team.id}`} disabled={!canEdit} className="org-lead-slot">
        <span className="org-slot-label"><Icon name="star" size={12} /> Lead</span>
        {lead
          ? <Person person={lead} draggable={canDragFrom} isLead compact />
          : <span className="tiny dim">{canEdit ? 'Drop someone here' : 'No lead yet'}</span>}
      </Drop>

      <div className="org-members">
        {shown.map(m => <Person key={m.id} person={m} draggable={canDragFrom} compact />)}
        {rest.length === 0 && <div className="tiny dim org-hint">{canEdit ? 'Drag people here' : 'No members yet'}</div>}
      </div>
      {rest.length > SHOWN && (
        <button className="btn btn-ghost btn-xs org-more" onClick={() => setOpen(o => !o)}>
          {open ? 'Show less' : `Show all ${rest.length}`}
        </button>
      )}
    </Drop>
  )
}

function TeamModal({ team, employees, teamMembers, departments, isAdmin, onClose, onSaved, onDeleted }) {
  const toast = useToast()
  const isNew = !team.id
  const [form, setForm] = useState({
    name: team.name || '', department: team.department || '', color: team.color || '#6366f1',
    managerId: team.manager_id || '', leadId: team.lead_id || '',
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const managers = employees.filter(e => ROLE_RANK[e.role] >= ROLE_RANK.manager)
  const leadOptions = isNew ? employees.filter(e => ROLE_RANK[e.role] <= ROLE_RANK.manager) : teamMembers
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async e => {
    e?.preventDefault()
    setBusy(true)
    setError('')
    try {
      const body = { name: form.name, department: form.department, color: form.color,
        leadId: form.leadId ? Number(form.leadId) : null }
      if (isAdmin) body.managerId = form.managerId ? Number(form.managerId) : null
      if (isNew) await api.createTeam(body)
      else await api.updateTeam(team.id, body)
      toast.show(isNew ? `Team ${form.name} created` : 'Team updated')
      onSaved()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!window.confirm(`Delete the team "${team.name}"? Its ${teamMembers.length} members will have no team.`)) return
    try {
      await api.deleteTeam(team.id)
      toast.show('Team deleted')
      onDeleted()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <Modal title={isNew ? 'New team' : `Edit ${team.name}`} onClose={onClose}
      footer={<>
        {!isNew && isAdmin && <button className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={remove}>Delete team</button>}
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>{isNew ? 'Create team' : 'Save'}</button>
      </>}>
      <form onSubmit={save}>
        {error && <div className="error-banner">{error}</div>}
        <div className="field">
          <label htmlFor="t-name">Team name</label>
          <input id="t-name" className="input" autoFocus value={form.name} placeholder="e.g. Android Squad"
            onChange={e => set('name', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="t-dept">Department</label>
          <select id="t-dept" className="select" value={form.department} onChange={e => set('department', e.target.value)}>
            <option value="">None</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="t-mgr">Manager</label>
          <select id="t-mgr" className="select" value={form.managerId} disabled={!isAdmin}
            onChange={e => set('managerId', e.target.value)}>
            <option value="">No manager</option>
            {managers.map(m => <option key={m.id} value={m.id}>{m.full_name} — {m.department}</option>)}
          </select>
          <span className="hint">{isAdmin
            ? 'Only people with the Manager role or higher can run a team. One manager can run several teams.'
            : 'Only an admin can change who manages this team.'}</span>
        </div>
        <div className="field">
          <label htmlFor="t-lead">Team lead</label>
          <select id="t-lead" className="select" value={form.leadId} onChange={e => set('leadId', e.target.value)}>
            <option value="">No lead</option>
            {leadOptions.map(m => <option key={m.id} value={m.id}>{m.full_name} — {m.job_title}</option>)}
          </select>
          <span className="hint">The lead can set KPIs for and evaluate their team.{isNew ? ' They join the team automatically.' : ''}</span>
        </div>
        <div className="field">
          <label htmlFor="t-color">Colour</label>
          <input id="t-color" type="color" value={form.color} onChange={e => set('color', e.target.value)} />
        </div>
      </form>
    </Modal>
  )
}

export function Teams() {
  const { employees, reload } = useOutletContext()
  const { user, isAdmin } = useAuth()
  const toast = useToast()
  const sensors = useDragSensors()
  const [teams, setTeams] = useState(null)
  const [editing, setEditing] = useState(null)
  const [dragging, setDragging] = useState(null)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)

  const [loadError, setLoadError] = useState('')
  const loadTeams = useCallback(() => api.teams().then(setTeams).catch(e => setLoadError(e.message)), [])
  useEffect(() => { loadTeams() }, [loadTeams])
  const refresh = () => Promise.all([loadTeams(), reload()])

  const departments = useMemo(() => [...new Set(employees.map(e => e.department).filter(Boolean))].sort(), [employees])
  const byId = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees])

  const myId = user.id
  const structure = useMemo(() => {
    if (!teams) return null
    const members = new Map(teams.map(t => [t.id, []]))
    for (const e of employees) if (e.team_id && members.has(e.team_id)) members.get(e.team_id).push(e)
    const managerIds = new Set(teams.map(t => t.manager_id).filter(Boolean))
    const groups = new Map()
    for (const t of teams) {
      const key = t.manager_id || 0
      if (!groups.has(key)) groups.set(key, { manager: byId.get(t.manager_id) || null, teams: [] })
      groups.get(key).teams.push(t)
    }
    const ordered = [...groups.values()].sort((a, b) =>
      (a.manager ? 0 : 1) - (b.manager ? 0 : 1) || (a.manager?.full_name || '').localeCompare(b.manager?.full_name || ''))
    const leaders = employees.filter(e => ROLE_RANK[e.role] >= ROLE_RANK.admin)
      .sort((a, b) => ROLE_RANK[b.role] - ROLE_RANK[a.role])
    const idleManagers = employees.filter(e => e.role === 'manager' && !managerIds.has(e.id) && !e.team_id)
    const unplaced = employees.filter(e => !e.team_id && ROLE_RANK[e.role] < ROLE_RANK.admin && !managerIds.has(e.id))
    return { members, groups: ordered, leaders, idleManagers, unplaced, myTeams: new Set(teams.filter(t => t.manager_id === myId).map(t => t.id)) }
  }, [teams, employees, byId, myId])

  if (loadError) return <div className="main"><div className="page-scroll"><div className="error-banner">{loadError}</div></div></div>
  if (!structure) return <div className="main"><div className="eval-loading"><Spinner /></div></div>

  const canEditTeam = t => isAdmin || structure.myTeams.has(t.id)
  const canMove = p => isAdmin || !p.team_id || structure.myTeams.has(p.team_id)
  const q = search.trim().toLowerCase()
  const unplaced = structure.unplaced.filter(e => !q || e.full_name.toLowerCase().includes(q) ||
    (e.department || '').toLowerCase().includes(q))
  const placedCount = employees.filter(e => e.team_id).length

  const onDragEnd = async ({ active, over }) => {
    setDragging(null)
    if (!over) return
    const person = active.data.current.person
    const [kind, raw] = String(over.id).split('-')
    const teamId = raw === 'none' ? null : Number(raw)
    try {
      setBusy(true)
      if (kind === 'lead') {
        if (teams.find(t => t.id === teamId)?.lead_id === person.id) return
        await api.updateTeam(teamId, { leadId: person.id })
        toast.show(`${person.full_name} now leads ${teams.find(t => t.id === teamId)?.name}`)
      } else {
        if ((person.team_id || null) === teamId) return
        await api.moveToTeam(person.id, teamId)
        toast.show(teamId ? `${person.full_name} moved to ${teams.find(t => t.id === teamId)?.name}` : `${person.full_name} removed from their team`)
      }
      await refresh()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const startFromDepartments = async () => {
    setBusy(true)
    try {
      await api.teamsFromDepartments()
      toast.show('Created a team for each department')
      await refresh()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="main">
      <div className="page-head">
        <div className="page-head-text">
          <div className="breadcrumb">People</div>
          <h1>Teams</h1>
          <p className="page-sub">{teams.length} teams · {placedCount} of {employees.length} people placed{busy ? ' · saving…' : ''}</p>
        </div>
        <div className="spacer" />
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setEditing({})}>
            <Icon name="plus" size={15} /> New team
          </button>
        )}
      </div>

      <div className="page-scroll">
        <DndContext sensors={sensors} collisionDetection={preferLeadSlot}
          onDragStart={({ active }) => setDragging(active.data.current.person)}
          onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
          <div className="org-layout">
            <div className="org-tree">
              <section className="org-level org-leaders">
                <div className="org-level-label">Leadership</div>
                <div className="org-leader-row">
                  {structure.leaders.map(l => (
                    <div className="org-leader" key={l.id}>
                      <Avatar name={l.full_name} color={l.avatar_color} size="md" />
                      <div style={{ minWidth: 0 }}>
                        <div className="truncate" style={{ fontWeight: 600 }}>{l.full_name}</div>
                        <RoleBadge role={l.role} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {teams.length === 0 && (
                <div className="empty-state org-empty">
                  <span className="empty-icon"><Icon name="users" size={22} /></span>
                  <div className="empty-title">No teams yet</div>
                  <div className="tiny">{isAdmin
                    ? 'Start with one team per department (run by its manager), then split them into smaller teams.'
                    : 'An admin needs to set up teams first.'}</div>
                  {isAdmin && (
                    <div className="row mt-8" style={{ gap: 8, justifyContent: 'center' }}>
                      <button className="btn btn-primary" disabled={busy} onClick={startFromDepartments}>Create from departments</button>
                      <button className="btn" onClick={() => setEditing({})}>New team</button>
                    </div>
                  )}
                </div>
              )}

              {structure.groups.map(g => {
                const people = g.teams.reduce((n, t) => n + structure.members.get(t.id).length, 0)
                return (
                  <section className="org-level org-manager" key={g.manager?.id || 'none'}>
                    <div className="org-manager-head">
                      {g.manager ? (
                        <>
                          <Avatar name={g.manager.full_name} color={g.manager.avatar_color} size="md" />
                          <div style={{ minWidth: 0 }}>
                            <div className="truncate" style={{ fontWeight: 650 }}>{g.manager.full_name}</div>
                            <div className="tiny dim truncate">{g.manager.job_title}</div>
                          </div>
                          <RoleBadge role={g.manager.role} />
                        </>
                      ) : (
                        <>
                          <span className="empty-icon org-nomgr"><Icon name="users" size={16} /></span>
                          <div style={{ fontWeight: 650 }}>Teams without a manager</div>
                        </>
                      )}
                      <span className="tiny dim org-manager-count">{g.teams.length} {g.teams.length === 1 ? 'team' : 'teams'} · {people} people</span>
                    </div>
                    <div className="org-teams">
                      {g.teams.map(t => (
                        <TeamCard key={t.id} team={t} members={structure.members.get(t.id)}
                          canEdit={canEditTeam(t)} canDragFrom={canEditTeam(t)} onEdit={setEditing} />
                      ))}
                    </div>
                  </section>
                )
              })}

              {isAdmin && structure.idleManagers.length > 0 && teams.length > 0 && (
                <section className="org-level">
                  <div className="org-level-label">Managers without a team</div>
                  <div className="org-leader-row">
                    {structure.idleManagers.map(m => (
                      <button className="org-leader org-leader-btn" key={m.id}
                        onClick={() => setEditing({ manager_id: m.id, department: m.department })}
                        title={`Create a team managed by ${m.full_name}`}>
                        <Avatar name={m.full_name} color={m.avatar_color} size="md" />
                        <div style={{ minWidth: 0, textAlign: 'left' }}>
                          <div className="truncate" style={{ fontWeight: 600 }}>{m.full_name}</div>
                          <div className="tiny dim"><Icon name="plus" size={11} /> New team</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>

            <Drop id="team-none" disabled={false} className="org-pool">
              <div className="org-pool-head">
                <div style={{ fontWeight: 650 }}>No team <span className="panel-count">{structure.unplaced.length}</span></div>
                <div className="tiny dim">Drag people onto a team. Drop here to take someone out of their team.</div>
                <input className="input search-input" placeholder="Search…" value={search}
                  onChange={e => setSearch(e.target.value)} />
              </div>
              <div className="org-pool-list">
                {unplaced.map(p => <Person key={p.id} person={p} draggable={canMove(p)} />)}
                {unplaced.length === 0 && <div className="tiny dim org-hint">{q ? 'No one matches.' : 'Everyone has a team.'}</div>}
              </div>
            </Drop>
          </div>

          <DragOverlay dropAnimation={null}>
            {dragging && (
              <div className="org-person org-person-overlay">
                <Avatar name={dragging.full_name} color={dragging.avatar_color} />
                <span className="truncate">{dragging.full_name}</span>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>

      {editing && (
        <TeamModal team={editing} employees={employees} departments={departments} isAdmin={isAdmin}
          teamMembers={editing.id ? structure.members.get(editing.id) : []}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await refresh() }}
          onDeleted={async () => { setEditing(null); await refresh() }} />
      )}
    </div>
  )
}
