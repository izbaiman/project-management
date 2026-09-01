import { useEffect, useState } from 'react'
import { useDndContext, useDroppable } from '@dnd-kit/core'
import { api } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import {
  Avatar, Modal, PRIORITIES, Spinner, TASK_TYPES, TypeIcon, timeAgo, useToast,
} from './ui.jsx'

/** The assignee slot doubles as a drop target for a dragged employee. */
function AssigneeSlot({ task, employees, onChange }) {
  const { setNodeRef } = useDroppable({
    id: `task-${task.id}`,
    data: { type: 'task', task },
  })
  const { active, over } = useDndContext()
  const isTarget = active?.data?.current?.type === 'employee' && over?.id === `task-${task.id}`

  return (
    <div>
      <div className="detail-label">Assignee</div>
      <div ref={setNodeRef} className={`detail-drop${isTarget ? ' assign-target' : ''}`}>
        <Avatar name={task.assignee_name} color={task.assignee_color} size="md" />
        <select
          className="select"
          value={task.assignee_id ?? ''}
          onChange={e => onChange('assigneeId', e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">Unassigned</option>
          {employees.map(e => (
            <option key={e.id} value={e.id}>{e.full_name} — {e.job_title}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

export function TaskDetail({ taskId, project, employees, onClose, onChanged, onDeleted }) {
  const { user, canManage } = useAuth()
  const toast = useToast()

  const [task, setTask] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [descDraft, setDescDraft] = useState('')
  const [descDirty, setDescDirty] = useState(false)
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.task(taskId)
      .then(t => {
        if (cancelled) return
        setTask(t)
        setTitleDraft(t.title)
        setDescDraft(t.description || '')
      })
      .catch(e => !cancelled && toast.error(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [taskId]) // eslint-disable-line react-hooks/exhaustive-deps

  const patch = async (field, value) => {
    setSaving(true)
    try {
      const updated = await api.updateTask(taskId, { [field]: value })
      setTask(t => ({ ...t, ...updated }))
      onChanged?.(updated)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const submitComment = async e => {
    e.preventDefault()
    const body = comment.trim()
    if (!body) return
    try {
      const created = await api.addComment(taskId, body)
      setTask(t => ({ ...t, comments: [...(t.comments || []), created] }))
      setComment('')
    } catch (err) {
      toast.error(err.message)
    }
  }

  const remove = async () => {
    if (!window.confirm(`Delete ${task.key}? This cannot be undone.`)) return
    try {
      await api.deleteTask(taskId)
      toast.show(`${task.key} deleted`)
      onDeleted?.(taskId)
    } catch (e) {
      toast.error(e.message)
    }
  }

  if (loading || !task) {
    return (
      <Modal title="Loading…" onClose={onClose} wide>
        <div className="center" style={{ padding: 40 }}><Spinner /></div>
      </Modal>
    )
  }

  const canDelete = canManage || task.reporter_id === user.id

  return (
    <Modal
      wide
      onClose={onClose}
      title={
        <div className="row">
          <TypeIcon type={task.type} />
          <span className="task-key">{task.key}</span>
          {saving && <span className="tiny dim">saving…</span>}
        </div>
      }
      footer={
        <>
          {canDelete && <button className="btn btn-danger" onClick={remove}>Delete</button>}
          <div className="spacer" />
          <button className="btn" onClick={onClose}>Close</button>
        </>
      }
    >
      <div className="detail-grid">
        <div>
          {editingTitle ? (
            <input
              className="input"
              autoFocus
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onBlur={() => {
                setEditingTitle(false)
                if (titleDraft.trim() && titleDraft !== task.title) patch('title', titleDraft.trim())
                else setTitleDraft(task.title)
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') { setTitleDraft(task.title); setEditingTitle(false) }
              }}
            />
          ) : (
            <h1
              style={{ cursor: 'text', marginBottom: 14 }}
              onClick={() => setEditingTitle(true)}
              title="Click to edit"
            >
              {task.title}
            </h1>
          )}

          <div className="detail-label">Description</div>
          <textarea
            className="textarea"
            placeholder="Add a description…"
            value={descDraft}
            onChange={e => { setDescDraft(e.target.value); setDescDirty(true) }}
          />
          {descDirty && (
            <div className="row mt-8">
              <button
                className="btn btn-primary btn-sm"
                onClick={async () => { await patch('description', descDraft); setDescDirty(false) }}
              >
                Save
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => { setDescDraft(task.description || ''); setDescDirty(false) }}
              >
                Cancel
              </button>
            </div>
          )}

          <div className="detail-label mt-16">
            Comments {task.comments?.length ? `(${task.comments.length})` : ''}
          </div>
          {task.comments?.map(c => (
            <div className="comment" key={c.id}>
              <Avatar name={c.author_name} color={c.author_color} size="md" />
              <div className="comment-body">
                <div className="comment-author">
                  {c.author_name}
                  <span className="comment-time">{timeAgo(c.created_at)}</span>
                </div>
                <div className="comment-text">{c.body}</div>
              </div>
            </div>
          ))}

          <form onSubmit={submitComment} className="row mt-8" style={{ alignItems: 'flex-start' }}>
            <Avatar name={user.full_name} color={user.avatar_color} size="md" />
            <input
              className="input"
              placeholder="Add a comment…"
              value={comment}
              onChange={e => setComment(e.target.value)}
            />
            <button className="btn btn-primary" disabled={!comment.trim()}>Send</button>
          </form>
        </div>

        <div className="detail-side">
          <AssigneeSlot task={task} employees={employees} onChange={patch} />

          <div>
            <div className="detail-label">Status</div>
            <select
              className="select"
              value={task.column_id ?? ''}
              onChange={e => patch('columnId', Number(e.target.value))}
            >
              {project.columns.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="detail-label">Sprint</div>
            <select
              className="select"
              value={task.sprint_id ?? ''}
              onChange={e => patch('sprintId', e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Backlog</option>
              {project.sprints.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="detail-label">Type</div>
            <select className="select" value={task.type} onChange={e => patch('type', e.target.value)}>
              {TASK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div>
            <div className="detail-label">Priority</div>
            <select
              className="select"
              value={task.priority}
              onChange={e => patch('priority', e.target.value)}
            >
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div>
            <div className="detail-label">Story points</div>
            <input
              className="input"
              type="number"
              min="0"
              value={task.story_points ?? ''}
              onChange={e => setTask(t => ({
                ...t, story_points: e.target.value === '' ? null : Number(e.target.value),
              }))}
              onBlur={e => patch('storyPoints', e.target.value === '' ? null : Number(e.target.value))}
            />
          </div>

          <div>
            <div className="detail-label">Due date</div>
            <input
              className="input"
              type="date"
              value={task.due_date || ''}
              onChange={e => patch('dueDate', e.target.value || null)}
            />
          </div>

          <div className="tiny dim">
            Reported by {task.reporter_name || 'unknown'}<br />
            Created {timeAgo(task.created_at)}
          </div>
        </div>
      </div>
    </Modal>
  )
}
