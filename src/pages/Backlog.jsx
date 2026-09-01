<<<<<<< HEAD
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import {
  DndContext, DragOverlay, closestCorners, pointerWithin, rectIntersection, useDroppable,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { api } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { Avatar, Spinner, useToast } from '../components/ui.jsx'
import { BacklogRow, TaskCardBody } from '../components/TaskCard.jsx'
import { PeoplePanel } from '../components/PeoplePanel.jsx'
import { TaskDetail } from '../components/TaskDetail.jsx'
import { CreateTaskModal } from '../components/CreateTaskModal.jsx'
import {
  isSprintDropId, isSprintId, isTaskId,
  neighboursAt, numericId, useDragSensors,
} from '../dnd.js'

function collisionStrategy(args) {
  const pointer = pointerWithin(args)
  if (pointer.length) return pointer
  const rects = rectIntersection(args)
  return rects.length ? rects : closestCorners(args)
}

const BACKLOG = 'backlog'

/** One sprint (or the backlog) as a droppable, reorderable block of tasks. */
function SprintBlock({
  sprint, tasks, onOpenTask, onAddTask, canManage, onStart, onComplete, onRename, onDelete,
}) {
  const dropId = `sprintdrop-${sprint?.id ?? BACKLOG}`
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: dropId,
    data: { type: 'sprint-drop', sprintId: sprint?.id ?? null },
  })

  // Only real sprints are draggable; the backlog stays pinned at the bottom.
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({
    id: `sprint-${sprint?.id ?? BACKLOG}`,
    data: { type: 'sprint', sprint },
    disabled: !sprint || !canManage,
  })

  const points = tasks.reduce((sum, t) => sum + (t.story_points || 0), 0)
  const taskIds = tasks.map(t => `task-${t.id}`)

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`sprint-block${isDragging ? ' dragging' : ''}${isOver ? ' drop-over' : ''}`}
    >
      <div className="sprint-head">
        {sprint && canManage && (
          <span className="drag-handle" style={{ opacity: 1 }}
            {...listeners} {...attributes}>⠿</span>
        )}
        <div>
          <div className="sprint-name">
            {sprint ? sprint.name : 'Backlog'}
            {sprint?.status === 'active' && <span className="badge badge-success" style={{ marginLeft: 8 }}>Active</span>}
            {sprint?.status === 'completed' && <span className="badge" style={{ marginLeft: 8 }}>Completed</span>}
          </div>
          <div className="sprint-sub">
            {tasks.length} task{tasks.length === 1 ? '' : 's'}
            {points > 0 && ` · ${points} points`}
            {sprint?.goal && ` · ${sprint.goal}`}
          </div>
        </div>

        <div className="spacer" />

        {sprint && canManage && (
          <>
            {sprint.status === 'planned' && (
              <button className="btn btn-sm" onClick={() => onStart(sprint)}>Start sprint</button>
            )}
            {sprint.status === 'active' && (
              <button className="btn btn-sm" onClick={() => onComplete(sprint)}>Complete</button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => onRename(sprint)}>Rename</button>
            <button className="btn btn-danger btn-sm" onClick={() => onDelete(sprint)}>Delete</button>
          </>
        )}
        <button className="btn btn-ghost btn-sm" onClick={() => onAddTask(sprint?.id ?? null)}>
          ＋ Task
        </button>
      </div>

      <div className="sprint-body" ref={setDropRef}>
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          {tasks.map(t => <BacklogRow key={t.id} task={t} onOpen={onOpenTask} />)}
        </SortableContext>
        {tasks.length === 0 && <div className="backlog-empty">Drag tasks here</div>}
      </div>
    </div>
  )
}

export function Backlog() {
  const { projectId } = useParams()
  const { employees } = useOutletContext()
  const { canManage } = useAuth()
  const toast = useToast()

  const [project, setProject] = useState(null)
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeDrag, setActiveDrag] = useState(null)
  const [openTaskId, setOpenTaskId] = useState(null)
  const [createIn, setCreateIn] = useState(undefined)

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

  const sprints = useMemo(
    () => [...(project?.sprints || [])].sort((a, b) => a.position - b.position),
    [project],
  )

  const tasksBySprint = useMemo(() => {
    const map = new Map()
    map.set(BACKLOG, [])
    for (const s of sprints) map.set(s.id, [])
    for (const t of tasks) {
      const key = t.sprint_id ?? BACKLOG
      if (map.has(key)) map.get(key).push(t)
    }
    for (const list of map.values()) list.sort((a, b) => a.position - b.position)
    return map
  }, [tasks, sprints])

  const workload = useMemo(() => {
    const counts = {}
    for (const t of tasks) {
      if (t.assignee_id) counts[t.assignee_id] = (counts[t.assignee_id] || 0) + 1
    }
    return counts
  }, [tasks])

  /* ------------------------------------------------------------- dragging -- */

  const handleDragEnd = async ({ active, over }) => {
    setActiveDrag(null)
    if (!over) return
    const kind = active.data.current?.type

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

    if (kind === 'sprint') {
      if (!isSprintId(over.id) || active.id === over.id) return
      const fromId = numericId(active.id)
      const toId = numericId(over.id)
      if (!Number.isFinite(toId)) return

      const rest = sprints.filter(s => s.id !== fromId)
      const overIndex = rest.findIndex(s => s.id === toId)
      const movingDown =
        sprints.findIndex(s => s.id === fromId) < sprints.findIndex(s => s.id === toId)
      const { beforeId, afterId, position } = neighboursAt(rest, movingDown ? overIndex + 1 : overIndex)

      const snapshot = project.sprints
      setProject(p => ({
        ...p,
        sprints: p.sprints.map(s => (s.id === fromId ? { ...s, position } : s)),
      }))
      try {
        await api.moveSprint(fromId, { beforeId, afterId })
      } catch (e) {
        setProject(p => ({ ...p, sprints: snapshot }))
        toast.error(e.message)
      }
      return
    }

    if (kind !== 'task') return

    const taskId = numericId(active.id)
    const moving = tasks.find(t => t.id === taskId)
    if (!moving) return

    let targetKey
    let index

    if (isSprintDropId(over.id)) {
      const raw = String(over.id).slice('sprintdrop-'.length)
      targetKey = raw === BACKLOG ? BACKLOG : Number(raw)
      index = (tasksBySprint.get(targetKey) || []).filter(t => t.id !== taskId).length
    } else if (isTaskId(over.id)) {
      const overTask = tasks.find(t => t.id === numericId(over.id))
      if (!overTask) return
      targetKey = overTask.sprint_id ?? BACKLOG
      const list = (tasksBySprint.get(targetKey) || []).filter(t => t.id !== taskId)
      const overIndex = list.findIndex(t => t.id === overTask.id)
      const sameGroup = (moving.sprint_id ?? BACKLOG) === targetKey
      index = sameGroup && moving.position < overTask.position ? overIndex + 1 : overIndex
    } else {
      return
    }

    const destination = (tasksBySprint.get(targetKey) || []).filter(t => t.id !== taskId)
    const { beforeId, afterId, position } = neighboursAt(destination, index)
    const nextSprintId = targetKey === BACKLOG ? null : targetKey
    if ((moving.sprint_id ?? null) === nextSprintId && moving.position === position) return

    const snapshot = tasks
    setTasks(list => list.map(t =>
      t.id === taskId ? { ...t, sprint_id: nextSprintId, position } : t))

    try {
      const updated = await api.moveTask(taskId, { sprintId: nextSprintId, beforeId, afterId })
      setTasks(list => list.map(t => (t.id === taskId ? updated : t)))
    } catch (e) {
      setTasks(snapshot)
      toast.error(e.message)
    }
  }

  /* --------------------------------------------------------- sprint actions -- */

  const updateSprintLocal = updated =>
    setProject(p => ({ ...p, sprints: p.sprints.map(s => (s.id === updated.id ? updated : s)) }))

  const startSprint = async sprint => {
    try {
      const updated = await api.updateSprint(sprint.id, { status: 'active' })
      // Only one sprint runs at a time, so demote whichever was active.
      setProject(p => ({
        ...p,
        sprints: p.sprints.map(s =>
          s.id === updated.id ? updated : s.status === 'active' ? { ...s, status: 'planned' } : s),
      }))
      toast.show(`${sprint.name} started`)
    } catch (e) { toast.error(e.message) }
  }

  const completeSprint = async sprint => {
    const unfinished = (tasksBySprint.get(sprint.id) || []).length
    if (!window.confirm(
      `Complete ${sprint.name}? Unfinished tasks (${unfinished} in this sprint) move back to the backlog.`
    )) return
    try {
      const { movedTasks } = await api.completeSprint(sprint.id, null)
      toast.show(`${sprint.name} completed — ${movedTasks} task(s) returned to backlog`)
      await load()
    } catch (e) { toast.error(e.message) }
  }

  const renameSprint = async sprint => {
    const name = window.prompt('Rename sprint', sprint.name)
    if (!name?.trim() || name === sprint.name) return
    try {
      updateSprintLocal(await api.updateSprint(sprint.id, { name: name.trim() }))
    } catch (e) { toast.error(e.message) }
  }

  const deleteSprint = async sprint => {
    if (!window.confirm(`Delete ${sprint.name}? Its tasks return to the backlog.`)) return
    try {
      await api.deleteSprint(sprint.id)
      await load()
    } catch (e) { toast.error(e.message) }
  }

  const addSprint = async () => {
    const name = window.prompt('Sprint name', `${project.key} Sprint ${sprints.length + 1}`)
    if (!name?.trim()) return
    try {
      const sprint = await api.createSprint({ projectId: project.id, name: name.trim() })
      setProject(p => ({ ...p, sprints: [...p.sprints, sprint] }))
    } catch (e) { toast.error(e.message) }
  }

  /* ---------------------------------------------------------------- render -- */

  if (loading) return <div className="loading-page"><Spinner /></div>
  if (error) return <div className="page-scroll"><div className="error-banner">{error}</div></div>
  if (!project) return null

  const openTask = openTaskId ? tasks.find(t => t.id === openTaskId) : null
  const sprintIds = sprints.map(s => `sprint-${s.id}`)

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionStrategy}
      onDragStart={({ active }) => setActiveDrag(active.data.current ?? null)}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDrag(null)}
    >
      <div className="main">
          <div className="page-head">
            <div className="page-head-text">
              <div className="breadcrumb">{project.key} · Backlog</div>
              <h1>Sprint planning</h1>
            </div>
            <div className="spacer" />
            {canManage && <button className="btn" onClick={addSprint}>＋ Sprint</button>}
            <button className="btn btn-primary" onClick={() => setCreateIn(null)}>＋ Create task</button>
          </div>

          <div className="page-scroll">
            <div className="backlog">
              <SortableContext items={sprintIds} strategy={verticalListSortingStrategy}>
                {sprints.map(sprint => (
                  <SprintBlock
                    key={sprint.id}
                    sprint={sprint}
                    tasks={tasksBySprint.get(sprint.id) || []}
                    canManage={canManage}
                    onOpenTask={t => setOpenTaskId(t.id)}
                    onAddTask={setCreateIn}
                    onStart={startSprint}
                    onComplete={completeSprint}
                    onRename={renameSprint}
                    onDelete={deleteSprint}
                  />
                ))}
              </SortableContext>

              <SprintBlock
                sprint={null}
                tasks={tasksBySprint.get(BACKLOG) || []}
                canManage={canManage}
                onOpenTask={t => setOpenTaskId(t.id)}
                onAddTask={setCreateIn}
                onStart={startSprint}
                onComplete={completeSprint}
                onRename={renameSprint}
                onDelete={deleteSprint}
              />
            </div>
          </div>
        </div>

        <PeoplePanel employees={employees} workload={workload} defaultDepartment={project.name} />

      <DragOverlay dropAnimation={null}>
        {activeDrag?.type === 'task' && (
          <div className="task-card drag-overlay-card">
            <TaskCardBody task={activeDrag.task} />
          </div>
        )}
        {activeDrag?.type === 'employee' && (
          <div className="drag-overlay-person">
            <Avatar name={activeDrag.employee.full_name} color={activeDrag.employee.avatar_color} size="md" />
            <div className="person-info">
              <div className="person-name">{activeDrag.employee.full_name}</div>
              <div className="person-title">{activeDrag.employee.job_title}</div>
            </div>
          </div>
        )}
        {activeDrag?.type === 'sprint' && (
          <div className="sprint-block" style={{ opacity: 0.92, boxShadow: 'var(--shadow-lg)' }}>
            <div className="sprint-head">
              <div className="sprint-name">{activeDrag.sprint?.name}</div>
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

      {createIn !== undefined && (
        <CreateTaskModal
          project={project}
          employees={employees}
          sprintId={createIn}
          onClose={() => setCreateIn(undefined)}
          onCreated={task => {
            setTasks(list => [...list, task])
            setCreateIn(undefined)
          }}
        />
      )}
    </DndContext>
  )
}
=======
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import {
  DndContext, DragOverlay, closestCorners, pointerWithin, rectIntersection, useDroppable,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { api } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { Avatar, Spinner, useToast } from '../components/ui.jsx'
import { BacklogRow, TaskCardBody } from '../components/TaskCard.jsx'
import { PeoplePanel } from '../components/PeoplePanel.jsx'
import { TaskDetail } from '../components/TaskDetail.jsx'
import { CreateTaskModal } from '../components/CreateTaskModal.jsx'
import {
  isSprintDropId, isSprintId, isTaskId,
  neighboursAt, numericId, useDragSensors,
} from '../dnd.js'

function collisionStrategy(args) {
  const pointer = pointerWithin(args)
  if (pointer.length) return pointer
  const rects = rectIntersection(args)
  return rects.length ? rects : closestCorners(args)
}

const BACKLOG = 'backlog'

/** One sprint (or the backlog) as a droppable, reorderable block of tasks. */
function SprintBlock({
  sprint, tasks, onOpenTask, onAddTask, canManage, onStart, onComplete, onRename, onDelete,
}) {
  const dropId = `sprintdrop-${sprint?.id ?? BACKLOG}`
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: dropId,
    data: { type: 'sprint-drop', sprintId: sprint?.id ?? null },
  })

  // Only real sprints are draggable; the backlog stays pinned at the bottom.
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({
    id: `sprint-${sprint?.id ?? BACKLOG}`,
    data: { type: 'sprint', sprint },
    disabled: !sprint || !canManage,
  })

  const points = tasks.reduce((sum, t) => sum + (t.story_points || 0), 0)
  const taskIds = tasks.map(t => `task-${t.id}`)

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`sprint-block${isDragging ? ' dragging' : ''}${isOver ? ' drop-over' : ''}`}
    >
      <div className="sprint-head">
        {sprint && canManage && (
          <span className="drag-handle" style={{ opacity: 1 }}
            {...listeners} {...attributes}>⠿</span>
        )}
        <div>
          <div className="sprint-name">
            {sprint ? sprint.name : 'Backlog'}
            {sprint?.status === 'active' && <span className="badge badge-success" style={{ marginLeft: 8 }}>Active</span>}
            {sprint?.status === 'completed' && <span className="badge" style={{ marginLeft: 8 }}>Completed</span>}
          </div>
          <div className="sprint-sub">
            {tasks.length} task{tasks.length === 1 ? '' : 's'}
            {points > 0 && ` · ${points} points`}
            {sprint?.goal && ` · ${sprint.goal}`}
          </div>
        </div>

        <div className="spacer" />

        {sprint && canManage && (
          <>
            {sprint.status === 'planned' && (
              <button className="btn btn-sm" onClick={() => onStart(sprint)}>Start sprint</button>
            )}
            {sprint.status === 'active' && (
              <button className="btn btn-sm" onClick={() => onComplete(sprint)}>Complete</button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => onRename(sprint)}>Rename</button>
            <button className="btn btn-danger btn-sm" onClick={() => onDelete(sprint)}>Delete</button>
          </>
        )}
        <button className="btn btn-ghost btn-sm" onClick={() => onAddTask(sprint?.id ?? null)}>
          ＋ Task
        </button>
      </div>

      <div className="sprint-body" ref={setDropRef}>
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          {tasks.map(t => <BacklogRow key={t.id} task={t} onOpen={onOpenTask} />)}
        </SortableContext>
        {tasks.length === 0 && <div className="backlog-empty">Drag tasks here</div>}
      </div>
    </div>
  )
}

export function Backlog() {
  const { projectId } = useParams()
  const { employees } = useOutletContext()
  const { canManage } = useAuth()
  const toast = useToast()

  const [project, setProject] = useState(null)
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeDrag, setActiveDrag] = useState(null)
  const [openTaskId, setOpenTaskId] = useState(null)
  const [createIn, setCreateIn] = useState(undefined)

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

  const sprints = useMemo(
    () => [...(project?.sprints || [])].sort((a, b) => a.position - b.position),
    [project],
  )

  const tasksBySprint = useMemo(() => {
    const map = new Map()
    map.set(BACKLOG, [])
    for (const s of sprints) map.set(s.id, [])
    for (const t of tasks) {
      const key = t.sprint_id ?? BACKLOG
      if (map.has(key)) map.get(key).push(t)
    }
    for (const list of map.values()) list.sort((a, b) => a.position - b.position)
    return map
  }, [tasks, sprints])

  const workload = useMemo(() => {
    const counts = {}
    for (const t of tasks) {
      if (t.assignee_id) counts[t.assignee_id] = (counts[t.assignee_id] || 0) + 1
    }
    return counts
  }, [tasks])

  /* ------------------------------------------------------------- dragging -- */

  const handleDragEnd = async ({ active, over }) => {
    setActiveDrag(null)
    if (!over) return
    const kind = active.data.current?.type

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

    if (kind === 'sprint') {
      if (!isSprintId(over.id) || active.id === over.id) return
      const fromId = numericId(active.id)
      const toId = numericId(over.id)
      if (!Number.isFinite(toId)) return

      const rest = sprints.filter(s => s.id !== fromId)
      const overIndex = rest.findIndex(s => s.id === toId)
      const movingDown =
        sprints.findIndex(s => s.id === fromId) < sprints.findIndex(s => s.id === toId)
      const { beforeId, afterId, position } = neighboursAt(rest, movingDown ? overIndex + 1 : overIndex)

      const snapshot = project.sprints
      setProject(p => ({
        ...p,
        sprints: p.sprints.map(s => (s.id === fromId ? { ...s, position } : s)),
      }))
      try {
        await api.moveSprint(fromId, { beforeId, afterId })
      } catch (e) {
        setProject(p => ({ ...p, sprints: snapshot }))
        toast.error(e.message)
      }
      return
    }

    if (kind !== 'task') return

    const taskId = numericId(active.id)
    const moving = tasks.find(t => t.id === taskId)
    if (!moving) return

    let targetKey
    let index

    if (isSprintDropId(over.id)) {
      const raw = String(over.id).slice('sprintdrop-'.length)
      targetKey = raw === BACKLOG ? BACKLOG : Number(raw)
      index = (tasksBySprint.get(targetKey) || []).filter(t => t.id !== taskId).length
    } else if (isTaskId(over.id)) {
      const overTask = tasks.find(t => t.id === numericId(over.id))
      if (!overTask) return
      targetKey = overTask.sprint_id ?? BACKLOG
      const list = (tasksBySprint.get(targetKey) || []).filter(t => t.id !== taskId)
      const overIndex = list.findIndex(t => t.id === overTask.id)
      const sameGroup = (moving.sprint_id ?? BACKLOG) === targetKey
      index = sameGroup && moving.position < overTask.position ? overIndex + 1 : overIndex
    } else {
      return
    }

    const destination = (tasksBySprint.get(targetKey) || []).filter(t => t.id !== taskId)
    const { beforeId, afterId, position } = neighboursAt(destination, index)
    const nextSprintId = targetKey === BACKLOG ? null : targetKey
    if ((moving.sprint_id ?? null) === nextSprintId && moving.position === position) return

    const snapshot = tasks
    setTasks(list => list.map(t =>
      t.id === taskId ? { ...t, sprint_id: nextSprintId, position } : t))

    try {
      const updated = await api.moveTask(taskId, { sprintId: nextSprintId, beforeId, afterId })
      setTasks(list => list.map(t => (t.id === taskId ? updated : t)))
    } catch (e) {
      setTasks(snapshot)
      toast.error(e.message)
    }
  }

  /* --------------------------------------------------------- sprint actions -- */

  const updateSprintLocal = updated =>
    setProject(p => ({ ...p, sprints: p.sprints.map(s => (s.id === updated.id ? updated : s)) }))

  const startSprint = async sprint => {
    try {
      const updated = await api.updateSprint(sprint.id, { status: 'active' })
      // Only one sprint runs at a time, so demote whichever was active.
      setProject(p => ({
        ...p,
        sprints: p.sprints.map(s =>
          s.id === updated.id ? updated : s.status === 'active' ? { ...s, status: 'planned' } : s),
      }))
      toast.show(`${sprint.name} started`)
    } catch (e) { toast.error(e.message) }
  }

  const completeSprint = async sprint => {
    const unfinished = (tasksBySprint.get(sprint.id) || []).length
    if (!window.confirm(
      `Complete ${sprint.name}? Unfinished tasks (${unfinished} in this sprint) move back to the backlog.`
    )) return
    try {
      const { movedTasks } = await api.completeSprint(sprint.id, null)
      toast.show(`${sprint.name} completed — ${movedTasks} task(s) returned to backlog`)
      await load()
    } catch (e) { toast.error(e.message) }
  }

  const renameSprint = async sprint => {
    const name = window.prompt('Rename sprint', sprint.name)
    if (!name?.trim() || name === sprint.name) return
    try {
      updateSprintLocal(await api.updateSprint(sprint.id, { name: name.trim() }))
    } catch (e) { toast.error(e.message) }
  }

  const deleteSprint = async sprint => {
    if (!window.confirm(`Delete ${sprint.name}? Its tasks return to the backlog.`)) return
    try {
      await api.deleteSprint(sprint.id)
      await load()
    } catch (e) { toast.error(e.message) }
  }

  const addSprint = async () => {
    const name = window.prompt('Sprint name', `${project.key} Sprint ${sprints.length + 1}`)
    if (!name?.trim()) return
    try {
      const sprint = await api.createSprint({ projectId: project.id, name: name.trim() })
      setProject(p => ({ ...p, sprints: [...p.sprints, sprint] }))
    } catch (e) { toast.error(e.message) }
  }

  /* ---------------------------------------------------------------- render -- */

  if (loading) return <div className="loading-page"><Spinner /></div>
  if (error) return <div className="page-scroll"><div className="error-banner">{error}</div></div>
  if (!project) return null

  const openTask = openTaskId ? tasks.find(t => t.id === openTaskId) : null
  const sprintIds = sprints.map(s => `sprint-${s.id}`)

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionStrategy}
      onDragStart={({ active }) => setActiveDrag(active.data.current ?? null)}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDrag(null)}
    >
      <div className="main">
          <div className="page-head">
            <div className="page-head-text">
              <div className="breadcrumb">{project.key} · Backlog</div>
              <h1>Sprint planning</h1>
            </div>
            <div className="spacer" />
            {canManage && <button className="btn" onClick={addSprint}>＋ Sprint</button>}
            <button className="btn btn-primary" onClick={() => setCreateIn(null)}>＋ Create task</button>
          </div>

          <div className="page-scroll">
            <div className="backlog">
              <SortableContext items={sprintIds} strategy={verticalListSortingStrategy}>
                {sprints.map(sprint => (
                  <SprintBlock
                    key={sprint.id}
                    sprint={sprint}
                    tasks={tasksBySprint.get(sprint.id) || []}
                    canManage={canManage}
                    onOpenTask={t => setOpenTaskId(t.id)}
                    onAddTask={setCreateIn}
                    onStart={startSprint}
                    onComplete={completeSprint}
                    onRename={renameSprint}
                    onDelete={deleteSprint}
                  />
                ))}
              </SortableContext>

              <SprintBlock
                sprint={null}
                tasks={tasksBySprint.get(BACKLOG) || []}
                canManage={canManage}
                onOpenTask={t => setOpenTaskId(t.id)}
                onAddTask={setCreateIn}
                onStart={startSprint}
                onComplete={completeSprint}
                onRename={renameSprint}
                onDelete={deleteSprint}
              />
            </div>
          </div>
        </div>

        <PeoplePanel employees={employees} workload={workload} defaultDepartment={project.name} />

      <DragOverlay dropAnimation={null}>
        {activeDrag?.type === 'task' && (
          <div className="task-card drag-overlay-card">
            <TaskCardBody task={activeDrag.task} />
          </div>
        )}
        {activeDrag?.type === 'employee' && (
          <div className="drag-overlay-person">
            <Avatar name={activeDrag.employee.full_name} color={activeDrag.employee.avatar_color} size="md" />
            <div className="person-info">
              <div className="person-name">{activeDrag.employee.full_name}</div>
              <div className="person-title">{activeDrag.employee.job_title}</div>
            </div>
          </div>
        )}
        {activeDrag?.type === 'sprint' && (
          <div className="sprint-block" style={{ opacity: 0.92, boxShadow: 'var(--shadow-lg)' }}>
            <div className="sprint-head">
              <div className="sprint-name">{activeDrag.sprint?.name}</div>
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

      {createIn !== undefined && (
        <CreateTaskModal
          project={project}
          employees={employees}
          sprintId={createIn}
          onClose={() => setCreateIn(undefined)}
          onCreated={task => {
            setTasks(list => [...list, task])
            setCreateIn(undefined)
          }}
        />
      )}
    </DndContext>
  )
}
>>>>>>> a7164889663611c265eef0f25b9d0e37a6b73a6a
