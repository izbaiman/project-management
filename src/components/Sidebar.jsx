import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { NavLink, useParams } from 'react-router-dom'
import { useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from './ui.jsx'
import { neighboursAt, numericId, useDragSensors } from '../dnd.js'

function ProjectRow({ project, canManage }) {
  const { projectId } = useParams()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `proj-${project.id}`,
    disabled: !canManage,
  })

  const isActive = String(projectId) === String(project.id)

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={isDragging ? 'dragging' : undefined}
    >
      <NavLink
        to={`/projects/${project.id}/board`}
        className={`project-row${isActive ? ' active' : ''}`}
      >
        {canManage && (
          <span
            className="drag-handle"
            title="Drag to reorder"
            onClick={e => e.preventDefault()}
            {...listeners}
            {...attributes}
          >
            ⠿
          </span>
        )}
        <span className="project-dot" style={{ background: project.color }} />
        <span className="project-name">{project.name}</span>
        <span className="project-key">{project.key}</span>
      </NavLink>
    </div>
  )
}

export function Sidebar({ projects, setProjects, onNewProject }) {
  const { canManage } = useAuth()
  const { projectId } = useParams()
  const toast = useToast()
  const sensors = useDragSensors()
  const [dragging, setDragging] = useState(null)

  const handleDragEnd = async ({ active, over }) => {
    setDragging(null)
    if (!over || active.id === over.id) return

    const fromId = numericId(active.id)
    const toId = numericId(over.id)
    const rest = projects.filter(p => p.id !== fromId)
    const overIndex = rest.findIndex(p => p.id === toId)
    const movingDown =
      projects.findIndex(p => p.id === fromId) < projects.findIndex(p => p.id === toId)
    const { beforeId, afterId, position } = neighboursAt(rest, movingDown ? overIndex + 1 : overIndex)

    const snapshot = projects
    setProjects(list =>
      [...list.map(p => (p.id === fromId ? { ...p, position } : p))]
        .sort((a, b) => a.position - b.position))

    try {
      await api.moveProject(fromId, { beforeId, afterId })
    } catch (e) {
      setProjects(snapshot)
      toast.error(e.message)
    }
  }

  return (
    <nav className="sidebar">
      <div className="sidebar-section">
        <NavLink to="/" end className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <span>🏠</span> Dashboard
        </NavLink>
        <NavLink to="/team" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <span>👥</span> Team directory
        </NavLink>
        {projectId && (
          <>
            <NavLink
              to={`/projects/${projectId}/board`}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <span>📋</span> Board
            </NavLink>
            <NavLink
              to={`/projects/${projectId}/backlog`}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <span>🗂️</span> Backlog
            </NavLink>
          </>
        )}
      </div>

      <div className="sidebar-section">
        <div className="sidebar-title">
          <span>Projects</span>
          {canManage && (
            <button className="btn btn-ghost btn-sm" onClick={onNewProject} title="New project">
              ＋
            </button>
          )}
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={({ active }) =>
            setDragging(projects.find(p => p.id === numericId(active.id)) ?? null)}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setDragging(null)}
        >
          <SortableContext
            items={projects.map(p => `proj-${p.id}`)}
            strategy={verticalListSortingStrategy}
          >
            {projects.map(p => (
              <ProjectRow key={p.id} project={p} canManage={canManage} />
            ))}
          </SortableContext>

          <DragOverlay dropAnimation={null}>
            {dragging && (
              <div className="project-row" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-lg)' }}>
                <span className="project-dot" style={{ background: dragging.color }} />
                <span className="project-name">{dragging.name}</span>
                <span className="project-key">{dragging.key}</span>
              </div>
            )}
          </DragOverlay>
        </DndContext>

        {projects.length === 0 && <p className="hint" style={{ padding: '6px 8px' }}>No projects yet.</p>}
      </div>
    </nav>
  )
}
