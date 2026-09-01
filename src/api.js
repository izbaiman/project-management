const TOKEN_KEY = 'topedge_pm_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** Fires when the token is rejected, so the app can bounce back to the login screen. */
const listeners = new Set()
export function onUnauthorized(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

async function request(method, path, body) {
  const headers = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let res
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('Cannot reach the server — is the API running on port 4000?', 0)
  }

  if (res.status === 401) {
    setToken(null)
    listeners.forEach(fn => fn())
  }

  const isJson = (res.headers.get('content-type') || '').includes('application/json')
  const data = isJson ? await res.json() : null

  if (!res.ok) throw new ApiError(data?.error || `Request failed (${res.status})`, res.status)
  return data
}

const qs = params => {
  const clean = Object.entries(params || {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
  return clean.length ? '?' + new URLSearchParams(clean) : ''
}

export const api = {
  login: (email, password) => request('POST', '/auth/login', { email, password }),
  me: () => request('GET', '/auth/me'),
  changePassword: (currentPassword, newPassword) =>
    request('POST', '/auth/change-password', { currentPassword, newPassword }),

  employees: params => request('GET', `/employees${qs(params)}`),
  employee: id => request('GET', `/employees/${id}`),
  departments: () => request('GET', '/employees/departments'),

  projects: () => request('GET', '/projects'),
  project: id => request('GET', `/projects/${id}`),
  createProject: body => request('POST', '/projects', body),
  updateProject: (id, body) => request('PATCH', `/projects/${id}`, body),
  moveProject: (id, body) => request('PATCH', `/projects/${id}/move`, body),
  deleteProject: id => request('DELETE', `/projects/${id}`),

  createColumn: (projectId, body) => request('POST', `/projects/${projectId}/columns`, body),
  updateColumn: (id, body) => request('PATCH', `/columns/${id}`, body),
  moveColumn: (id, body) => request('PATCH', `/columns/${id}/move`, body),
  deleteColumn: id => request('DELETE', `/columns/${id}`),

  tasks: params => request('GET', `/tasks${qs(params)}`),
  task: id => request('GET', `/tasks/${id}`),
  createTask: body => request('POST', '/tasks', body),
  updateTask: (id, body) => request('PATCH', `/tasks/${id}`, body),
  moveTask: (id, body) => request('PATCH', `/tasks/${id}/move`, body),
  deleteTask: id => request('DELETE', `/tasks/${id}`),
  addComment: (id, body) => request('POST', `/tasks/${id}/comments`, { body }),

  sprints: projectId => request('GET', `/sprints${qs({ projectId })}`),
  createSprint: body => request('POST', '/sprints', body),
  updateSprint: (id, body) => request('PATCH', `/sprints/${id}`, body),
  moveSprint: (id, body) => request('PATCH', `/sprints/${id}/move`, body),
  completeSprint: (id, moveUnfinishedTo) =>
    request('POST', `/sprints/${id}/complete`, { moveUnfinishedTo }),
  deleteSprint: id => request('DELETE', `/sprints/${id}`),

  stats: () => request('GET', '/stats'),
}
