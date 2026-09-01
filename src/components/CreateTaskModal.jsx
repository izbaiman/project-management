import { useState } from 'react'
import { api } from '../api.js'
import { Modal, PRIORITIES, TASK_TYPES, useToast } from './ui.jsx'

export function CreateTaskModal({
  project, employees, columnId = null, sprintId = null, onClose, onCreated,
}) {
  const toast = useToast()
  const [form, setForm] = useState({
    title: '',
    description: '',
    type: 'task',
    priority: 'medium',
    columnId: columnId ?? project.columns[0]?.id ?? null,
    sprintId: sprintId ?? '',
    assigneeId: '',
    storyPoints: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const set = (key, value) => setForm(f => ({ ...f, [key]: value }))

  const submit = async e => {
    e.preventDefault()
    if (!form.title.trim()) return setError('Give the task a title')

    setSubmitting(true)
    setError('')
    try {
      const task = await api.createTask({
        projectId: project.id,
        title: form.title.trim(),
        description: form.description.trim() || null,
        type: form.type,
        priority: form.priority,
        columnId: form.columnId,
        sprintId: form.sprintId === '' ? null : Number(form.sprintId),
        assigneeId: form.assigneeId === '' ? null : Number(form.assigneeId),
        storyPoints: form.storyPoints === '' ? null : Number(form.storyPoints),
      })
      toast.show(`${task.key} created`)
      onCreated(task)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={`New task in ${project.key}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Creating…' : 'Create task'}
          </button>
        </>
      }
    >
      <form onSubmit={submit}>
        {error && <div className="error-banner">{error}</div>}

        <div className="field">
          <label htmlFor="nt-title">Title</label>
          <input
            id="nt-title"
            className="input"
            autoFocus
            value={form.title}
            onChange={e => set('title', e.target.value)}
            placeholder="What needs doing?"
          />
        </div>

        <div className="field">
          <label htmlFor="nt-desc">Description</label>
          <textarea
            id="nt-desc"
            className="textarea"
            value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="Any detail worth capturing…"
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field">
            <label htmlFor="nt-type">Type</label>
            <select id="nt-type" className="select" value={form.type}
              onChange={e => set('type', e.target.value)}>
              {TASK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="field">
            <label htmlFor="nt-prio">Priority</label>
            <select id="nt-prio" className="select" value={form.priority}
              onChange={e => set('priority', e.target.value)}>
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div className="field">
            <label htmlFor="nt-col">Status</label>
            <select id="nt-col" className="select" value={form.columnId ?? ''}
              onChange={e => set('columnId', Number(e.target.value))}>
              {project.columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="field">
            <label htmlFor="nt-sprint">Sprint</label>
            <select id="nt-sprint" className="select" value={form.sprintId}
              onChange={e => set('sprintId', e.target.value)}>
              <option value="">Backlog</option>
              {project.sprints.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div className="field">
            <label htmlFor="nt-assignee">Assignee</label>
            <select id="nt-assignee" className="select" value={form.assigneeId}
              onChange={e => set('assigneeId', e.target.value)}>
              <option value="">Unassigned</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.full_name} — {e.job_title}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="nt-points">Story points</label>
            <input id="nt-points" className="input" type="number" min="0"
              value={form.storyPoints} onChange={e => set('storyPoints', e.target.value)} />
          </div>
        </div>
      </form>
    </Modal>
  )
}
