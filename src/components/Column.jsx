import { useDndContext, useDroppable } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TaskCard } from './TaskCard.jsx'
import { Icon } from './ui.jsx'

/** A board column: sortable itself, and a drop zone for task cards. */
export function Column({ column, tasks, onOpenTask, onAddTask, onRename, canManage }) {
  const dndId = `col-${column.id}`
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: dndId, data: { type: 'column', column } })

  // Separate droppable so an empty column still accepts a card.
  const { setNodeRef: setDropRef } = useDroppable({
    id: `coldrop-${column.id}`,
    data: { type: 'column-drop', columnId: column.id },
  })

  const { active, over } = useDndContext()
  const draggingTask = active?.data?.current?.type === 'task'
  const overThisColumn = draggingTask && (
    over?.id === `coldrop-${column.id}` ||
    over?.data?.current?.columnId === column.id
  )

  const overWip = column.wip_limit != null && tasks.length > column.wip_limit
  const taskIds = tasks.map(t => `task-${t.id}`)

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`column${isDragging ? ' dragging' : ''}${overThisColumn ? ' column-over' : ''}`}
    >
      <div className="column-head">
        {canManage && (
          <span className="drag-handle" title="Drag to reorder column" {...listeners} {...attributes}>
            <Icon name="grip" size={14} />
          </span>
        )}
        {column.is_done
          ? <Icon name="checkCircle" size={15} className="column-done-icon" />
          : <span className="column-status-dot" />}
        <span
          className="column-title"
          onDoubleClick={() => canManage && onRename(column)}
          title={canManage ? 'Double-click to rename' : column.name}
        >
          {column.name}
        </span>
        <span
          className={`column-count${overWip ? ' over-wip' : ''}`}
          title={column.wip_limit ? `WIP limit ${column.wip_limit}` : undefined}
        >
          {tasks.length}{column.wip_limit ? ` / ${column.wip_limit}` : ''}
        </span>
      </div>

      <div className="column-list" ref={setDropRef}>
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          {tasks.map(task => (
            <TaskCard key={task.id} task={task} columnId={column.id} onOpen={onOpenTask} />
          ))}
        </SortableContext>

        {tasks.length === 0 && (
          <div className="column-empty">Drop a task here</div>
        )}
      </div>

      <div className="column-foot">
        <button className="btn btn-ghost btn-sm column-add" onClick={() => onAddTask(column.id)}>
          <Icon name="plus" size={14} /> Create task
        </button>
      </div>
    </div>
  )
}
