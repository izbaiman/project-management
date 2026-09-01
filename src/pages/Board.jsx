import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import { DndContext, DragOverlay, closestCorners, pointerWithin, rectIntersection } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { api } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { Avatar, Spinner, useToast } from '../components/ui.jsx'
import { Column } from '../components/Column.jsx'
import { TaskCardBody } from '../components/TaskCard.jsx'
import { PeoplePanel } from '../components/PeoplePanel.jsx'
import { TaskDetail } from '../components/TaskDetail.jsx'
import { CreateTaskModal } from '../components/CreateTaskModal.jsx'
import {
  isColumnDropId, isColumnId, isTaskId,
  neighboursAt, numericId, useDragSensors,
} from '../dnd.js'

/**
 * Prefer the pointer for hit testing so dropping into a column gap works,
 * falling back to rectangle overlap for keyboard drags.
 */
function collisionStrategy(args) {
  const pointer = pointerWithin(args)
  if (pointer.length) return pointer
  const rects = rectIntersection(args)
  return rects.length ? rects : closestCorners(args)
}

export function Board() {
  const { projectId } = useParams()
  const { employees } = useOutletContext()
  const { canManage } = useAuth()
  const toast = useToast()

  const [project, setProject] = useState(null)
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [sprintFilter, setSprintFilter] = useState('active')
  const [search, setSearch] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('')

  const [activeDrag, setActiveDrag] = useState(null)
  const [openTaskId, setOpenTaskId] = useState(null)
  const [createIn, setCreateIn] = useState(null)

  const sensors = useDragSensors()

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [p, t] = await Promise.all([
        api.project(projectId),
        api.tasks({ projectId, limit: 1000 }),
      ])
      setProject(p)
      setTasks(t)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { load() }, [load])

  const activeSprint = useMemo(
    () => project?.sprints?.find(s => s.status === 'active') || null,
    [project],
  )

  const visibleTasks = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tasks.filter(t => {
      if (sprintFilter === 'active' && activeSprint && t.sprint_id !== activeSprint.id) return false
      if (sprintFilter !== 'active' && sprintFilter !== 'all' &&
          String(t.sprint_id) !== sprintFilter) return false
      if (assigneeFilter && String(t.assignee_id) !== assigneeFilter) return false
      if (q && !(t.title.toLowerCase().includes(q) || t.key.toLowerCase().includes(q))) return false
      return true
    })
  }, [tasks, sprintFilter, activeSprint, assigneeFilter, search])

  const tasksByColumn = useMemo(() => {
    const map = new Map()
    for (const col of project?.columns || []) map.set(col.id, [])
    for (const t of visibleTasks) {
      if (map.has(t.column_id)) map.get(t.column_id).push(t)
    }
    for (const list of map.values()) list.sort((a, b) => a.position - b.position)
    return map
  }, [visibleTasks, project])

  const workload = useMemo(() => {
    const counts = {}
    for (const t of tasks) {
      if (t.assignee_id) counts[t.assignee_id] = (counts[t.assignee_id] || 0) + 1
    }
    return counts
  }, [tasks])

  /* ------------------------------------------------------------- dragging -- */

  const handleDragStart = ({ active }) => setActiveDrag(active.data.current ?? null)

  const handleDragEnd = async ({ active, over }) => {
    setActiveDrag(null)
    if (!over) return

    const kind = active.data.current?.type

    // 1. Dropping a person onto a card assigns them.
    if (kind === 'employee') {
      if (!isTaskId(over.id)) return
      const taskId = numericId(over.id)
      const employee = active.data.current.employee
      const previous = tasks.find(t => t.id === taskId)
      if (previous?.assignee_id === employee.id) return

      setTasks(list => list.map(t => t.id === taskId
        ? { ...t, assignee_id: employee.id, assignee_name: employee.full_name,
            assignee_color: employee.avatar_color, assignee_title: employee.job_title }
        : t))
      try {
        const updated = await api.updateTask(taskId, { assigneeId: employee.id })
        setTasks(list => list.map(t => (t.id === taskId ? updated : t)))
        toast.show(`${previous?.key} assigned to ${employee.full_name}`)
      } catch (e) {
        setTasks(list => list.map(t => (t.id === taskId ? previous : t)))
        toast.error(e.message)
      }
      return
    }

    // 2. Reordering the board's own columns.
    if (kind === 'column') {
      if (!isColumnId(over.id) || active.id === over.id) return
      const columns = [...project.columns].sort((a, b) => a.position - b.position)
      const fromId = numericId(active.id)
      const toId = numericId(over.id)
      const rest = columns.filter(c => c.id !== fromId)
      const index = rest.findIndex(c => c.id === toId)
      const target = columns.findIndex(c => c.id === fromId) < columns.findIndex(c => c.id === toId)
        ? index + 1
        : index
      const { beforeId, afterId, position } = neighboursAt(rest, target)

      const snapshot = project.columns
      setProject(p => ({
        ...p,
        columns: p.columns.map(c => (c.id === fromId ? { ...c, position } : c)),
      }))
      try {
        await api.moveColumn(fromId, { beforeId, afterId })
      } catch (e) {
        setProject(p => ({ ...p, columns: snapshot }))
        toast.error(e.message)
      }
      return
    }

    // 3. Moving a task within or between columns.
    if (kind !== 'task') return

    const taskId = numericId(active.id)
    const moving = tasks.find(t => t.id === taskId)
    if (!moving) return

    let targetColumnId
    let index

    if (isColumnDropId(over.id) || isColumnId(over.id)) {
      targetColumnId = numericId(over.id)
      const list = (tasksByColumn.get(targetColumnId) || []).filter(t => t.id !== taskId)
      index = list.length
    } else if (isTaskId(over.id)) {
      const overTask = tasks.find(t => t.id === numericId(over.id))
      if (!overTask) return
      targetColumnId = overTask.column_id
      const list = (tasksByColumn.get(targetColumnId) || []).filter(t => t.id !== taskId)
      const overIndex = list.findIndex(t => t.id === overTask.id)
      const movingDown = moving.column_id === targetColumnId && moving.position < overTask.position
      index = movingDown ? overIndex + 1 : overIndex
    } else {
      return
    }

    const destination = (tasksByColumn.get(targetColumnId) || []).filter(t => t.id !== taskId)
    const { beforeId, afterId, position } = neighboursAt(destination, index)
    if (moving.column_id === targetColumnId && moving.position === position) return

    const snapshot = tasks
    setTasks(list => list.map(t =>
      t.id === taskId ? { ...t, column_id: targetColumnId, position } : t))

    try {
      const payload = { columnId: targetColumnId, beforeId, afterId }
      // A card dragged onto the board while the sprint filter is on joins that sprint.
      if (moving.sprint_id == null && sprintFilter === 'active' && activeSprint) {
        payload.sprintId = activeSprint.id
      }
      const updated = await api.moveTask(taskId, payload)
      setTasks(list => list.map(t => (t.id === taskId ? updated : t)))
    } catch (e) {
      setTasks(snapshot)
      toast.error(e.message)
    }
  }

  /* ---------------------------------------------------------------- render -- */

  if (loading) return <div className="loading-page"><Spinner /></div>
  if (error) return <div className="page-scroll"><div className="error-banner">{error}</div></div>
  if (!project) return null

  const columns = [...project.columns].sort((a, b) => a.position - b.position)
  const columnIds = columns.map(c => `col-${c.id}`)
  const openTask = openTaskId ? tasks.find(t => t.id === openTaskId) : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionStrategy}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDrag(null)}
    >
      <div className="main">
          <div className="page-head">
            <div className="page-head-text">
              <div className="breadcrumb">{project.key} · Board</div>
              <h1>{project.name}</h1>
            </div>
            <div className="spacer" />
            <button className="btn btn-primary" onClick={() => setCreateIn(columns[0]?.id)}>
              ＋ Create task
            </button>
          </div>

          <div className="toolbar">
            <input
              className="input search-input"
              placeholder="Search this board…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <select
              className="select"
              style={{ width: 'auto' }}
              value={sprintFilter}
              onChange={e => setSprintFilter(e.target.value)}
            >
              <option value="active">
                {activeSprint ? `Active sprint — ${activeSprint.name}` : 'Active sprint (none)'}
              </option>
              <option value="all">All tasks</option>
              {project.sprints.map(s => (
                <option key={s.id} value={String(s.id)}>{s.name}</option>
              ))}
            </select>
            <select
              className="select"
              style={{ width: 'auto' }}
              value={assigneeFilter}
              onChange={e => setAssigneeFilter(e.target.value)}
            >
              <option value="">Everyone</option>
              {employees
                .filter(e => workload[e.id])
                .map(e => (
                  <option key={e.id} value={String(e.id)}>
                    {e.full_name} ({workload[e.id]})
                  </option>
                ))}
            </select>
            {canManage && (
              <button
                className="btn btn-ghost"
                onClick={async () => {
                  const name = window.prompt('New column name')
                  if (!name?.trim()) return
                  try {
                    const col = await api.createColumn(project.id, { name: name.trim() })
                    setProject(p => ({ ...p, columns: [...p.columns, col] }))
                  } catch (e) { toast.error(e.message) }
                }}
              >
                ＋ Column
              </button>
            )}
            <div className="spacer" />
            <span className="tiny dim">{visibleTasks.length} shown</span>
          </div>

          <div className="board">
            <SortableContext items={columnIds} strategy={horizontalListSortingStrategy}>
              {columns.map(col => (
                <Column
                  key={col.id}
                  column={col}
                  tasks={tasksByColumn.get(col.id) || []}
                  canManage={canManage}
                  onOpenTask={t => setOpenTaskId(t.id)}
                  onAddTask={setCreateIn}
                  onRename={async column => {
                    const name = window.prompt('Rename column', column.name)
                    if (!name?.trim() || name === column.name) return
                    try {
                      const updated = await api.updateColumn(column.id, { name: name.trim() })
                      setProject(p => ({
                        ...p,
                        columns: p.columns.map(c => (c.id === column.id ? updated : c)),
                      }))
                    } catch (e) { toast.error(e.message) }
                  }}
                />
              ))}
            </SortableContext>
          </div>
        </div>

        <PeoplePanel
          employees={employees}
          workload={workload}
          defaultDepartment={project.name}
        />

      <DragOverlay dropAnimation={null}>
        {activeDrag?.type === 'task' && (
          <div className="task-card drag-overlay-card">
            <TaskCardBody task={activeDrag.task} />
          </div>
        )}
        {activeDrag?.type === 'employee' && (
          <div className="drag-overlay-person">
            <Avatar
              name={activeDrag.employee.full_name}
              color={activeDrag.employee.avatar_color}
              size="md"
            />
            <div className="person-info">
              <div className="person-name">{activeDrag.employee.full_name}</div>
              <div className="person-title">{activeDrag.employee.job_title}</div>
            </div>
          </div>
        )}
        {activeDrag?.type === 'column' && (
          <div className="column" style={{ opacity: 0.9, boxShadow: 'var(--shadow-lg)' }}>
            <div className="column-head">
              <span className="column-title">{activeDrag.column.name}</span>
            </div>
          </div>
        )}
      </DragOverlay>

      {openTask && (
        <TaskDetail
          taskId={openTask.id}
          project={project}
          employees={employees}
          onClose={() => setOpenTaskId(null)}
          onChanged={updated =>
            setTasks(list => list.map(t => (t.id === updated.id ? { ...t, ...updated } : t)))}
          onDeleted={id => {
            setTasks(list => list.filter(t => t.id !== id))
            setOpenTaskId(null)
          }}
        />
      )}

      {createIn != null && (
        <CreateTaskModal
          project={project}
          employees={employees}
          columnId={createIn}
          sprintId={activeSprint?.id ?? null}
          onClose={() => setCreateIn(null)}
          onCreated={task => {
            setTasks(list => [...list, task])
            setCreateIn(null)
          }}
        />
      )}
    </DndContext>
  )
}
