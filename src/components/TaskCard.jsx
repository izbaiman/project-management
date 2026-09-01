import { useDndContext } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Avatar, PriorityIcon, TypeIcon } from './ui.jsx'

/** True while an employee is being dragged over this particular card. */
function useAssignTarget(dndId) {
  const { active, over } = useDndContext()
  return active?.data?.current?.type === 'employee' && over?.id === dndId
}

/** Static card body — also used inside the drag overlay. */
export function TaskCardBody({ task }) {
  return (
    <>
      <div className="task-title">{task.title}</div>
      <div className="task-meta">
        <TypeIcon type={task.type} />
        <span className="task-key">{task.key}</span>
        <PriorityIcon priority={task.priority} />
        <div className="task-meta-spacer" />
        {task.comment_count > 0 && (
          <span className="tiny dim" title={`${task.comment_count} comments`}>
            💬 {task.comment_count}
          </span>
        )}
        {task.story_points != null && <span className="task-points">{task.story_points}</span>}
        <Avatar
          name={task.assignee_name}
          color={task.assignee_color}
          title={task.assignee_name
            ? `${task.assignee_name} — ${task.assignee_title || ''}`
            : 'Unassigned'}
        />
      </div>
    </>
  )
}

/** Sortable board card: drag to reorder or move columns, drop a person on it to assign. */
export function TaskCard({ task, columnId, onOpen }) {
  const dndId = `task-${task.id}`
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: dndId,
    data: { type: 'task', task, columnId },
  })
  const isAssignTarget = useAssignTarget(dndId)

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`task-card${isDragging ? ' dragging' : ''}${isAssignTarget ? ' assign-target' : ''}`}
      onClick={() => onOpen(task)}
      {...listeners}
      {...attributes}
    >
      <TaskCardBody task={task} />
    </div>
  )
}

/** The single-line variant used on the backlog / sprint planning screen. */
export function BacklogRow({ task, onOpen }) {
  const dndId = `task-${task.id}`
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: dndId,
    data: { type: 'task', task, sprintId: task.sprint_id },
  })
  const isAssignTarget = useAssignTarget(dndId)

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`backlog-row${isDragging ? ' dragging' : ''}${isAssignTarget ? ' assign-target' : ''}`}
      onClick={() => onOpen(task)}
      {...listeners}
      {...attributes}
    >
      <TypeIcon type={task.type} />
      <span className="task-key">{task.key}</span>
      <span className="task-title truncate">{task.title}</span>
      <PriorityIcon priority={task.priority} />
      {task.story_points != null && <span className="task-points">{task.story_points}</span>}
      <Avatar name={task.assignee_name} color={task.assignee_color} />
    </div>
  )
}
