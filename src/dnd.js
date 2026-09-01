import { MouseSensor, TouchSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core'

export const GAP = 1024

/** Mirrors the server's ranking so the UI can settle before the request returns. */
export function rankBetween(before, after) {
  if (before == null && after == null) return GAP
  if (before == null) return after - GAP
  if (after == null) return before + GAP
  return (before + after) / 2
}

/**
 * Sensors tuned so a plain click still opens a task: dragging only starts
 * after the pointer travels 6px (or the touch is held briefly).
 */
export function useDragSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  )
}

/**
 * Work out the ranks either side of a drop.
 * `list` is the destination list *without* the dragged item, `index` the slot it lands in.
 */
export function neighboursAt(list, index) {
  const before = index > 0 ? list[index - 1] : null
  const after = index < list.length ? list[index] : null
  return {
    beforeId: before?.id ?? null,
    afterId: after?.id ?? null,
    position: rankBetween(before?.position ?? null, after?.position ?? null),
  }
}

export const numericId = dndId => Number(String(dndId).split('-').pop())
export const isTaskId = dndId => String(dndId).startsWith('task-')
export const isColumnId = dndId => String(dndId).startsWith('col-')
export const isColumnDropId = dndId => String(dndId).startsWith('coldrop-')
export const isSprintDropId = dndId => String(dndId).startsWith('sprintdrop-')
export const isSprintId = dndId => String(dndId).startsWith('sprint-')
export const isEmployeeId = dndId => String(dndId).startsWith('emp-')
