import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { Avatar, Icon, RoleBadge, Spinner, useToast } from '../components/ui.jsx'

// ---- periods ------------------------------------------------------------------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function periodOptions(now = new Date()) {
  const months = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({ value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` })
  }
  const quarters = []
  let y = now.getFullYear(), q = Math.floor(now.getMonth() / 3) + 1
  for (let i = 0; i < 4; i++) {
    quarters.push({ value: `${y}-Q${q}`, label: `Q${q} ${y}` })
    if (--q === 0) { q = 4; y-- }
  }
  return { months, quarters }
}

function periodLabel(p) {
  const m = /^(\d{4})-(\d{2})$/.exec(p)
  if (m) return `${MONTHS[+m[2] - 1]} ${m[1]}`
  const q = /^(\d{4})-Q(\d)$/.exec(p)
  return q ? `Q${q[2]} ${q[1]}` : p
}

// ---- scoring (mirrors server/routes/evaluations.js for instant feedback) --------

function gradeFor(score) {
  if (score == null) return null
  if (score >= 90) return 'Outstanding'
  if (score >= 75) return 'Exceeds expectations'
  if (score >= 60) return 'Meets expectations'
  if (score >= 40) return 'Needs improvement'
  return 'Unsatisfactory'
}

function scoreKpis(kpis, metrics) {
  const scored = kpis.map(k => {
    if (k.metric === 'manual') return { ...k, actual: null, score: k.rating ? k.rating * 20 : null }
    const actual = metrics?.[k.metric] ?? null
    const target = Number(k.target)
    return { ...k, actual, score: actual != null && target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : null }
  })
  const rated = scored.filter(k => k.score != null && Number(k.weight) > 0)
  const weight = rated.reduce((s, k) => s + Number(k.weight), 0)
  const total = weight ? Math.round(rated.reduce((s, k) => s + k.score * Number(k.weight), 0) / weight) : null
  return { kpis: scored, score: total, grade: gradeFor(total) }
}

const tone = score => score == null ? 'none' : score >= 75 ? 'good' : score >= 60 ? 'ok' : score >= 40 ? 'warn' : 'bad'

// ---- small pieces ---------------------------------------------------------------

function ScoreRing({ score, size = 76 }) {
  const r = 30, c = 2 * Math.PI * r
  return (
    <div className={`score-ring tone-${tone(score)}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 72 72" width={size} height={size} aria-hidden="true">
        <circle cx="36" cy="36" r={r} className="score-ring-track" />
        <circle cx="36" cy="36" r={r} className="score-ring-value"
          strokeDasharray={c} strokeDashoffset={c * (1 - (score ?? 0) / 100)} />
      </svg>
      <span className="score-ring-text">{score ?? '–'}</span>
    </div>
  )
}

function Stars({ value, onChange, readOnly }) {
  return (
    <span className="stars" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" className={`star${n <= (value || 0) ? ' on' : ''}`}
          disabled={readOnly} aria-label={`${n} of 5`} aria-checked={n === value} role="radio"
          onClick={() => onChange(n === value ? null : n)}>
          <Icon name="star" size={18} />
        </button>
      ))}
    </span>
  )
}

function StatusPill({ evaluation }) {
  if (!evaluation) return <span className="status-pill status-none">Not started</span>
  if (evaluation.status === 'final') {
    return <span className={`status-pill status-final tone-${tone(evaluation.score)}`}>{evaluation.score}</span>
  }
  return <span className="status-pill status-draft">Draft</span>
}

// ---- the evaluation sheet -------------------------------------------------------

function EvaluationSheet({ employeeId, period, meta, onSaved, data: given }) {
  const toast = useToast()
  const [data, setData] = useState(given || null)
  const [kpis, setKpis] = useState(given?.kpis || [])
  const [summary, setSummary] = useState(given?.evaluation?.summary || '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (given) return
    let live = true
    setData(null)
    setError('')
    api.evaluation(employeeId, period)
      .then(d => { if (!live) return; setData(d); setKpis(d.kpis); setSummary(d.evaluation?.summary || '') })
      .catch(e => live && setError(e.message))
    return () => { live = false }
  }, [employeeId, period, given])

  const live = useMemo(() => scoreKpis(kpis, data?.metrics), [kpis, data])

  if (error && !data) return <div className="error-banner">{error}</div>
  if (!data) return <div className="eval-loading"><Spinner /></div>

  const { employee, evaluation, metrics } = data
  const isFinal = evaluation?.status === 'final'
  const readOnly = !data.canEdit || isFinal
  const update = (i, patch) => setKpis(list => list.map((k, j) => (j === i ? { ...k, ...patch } : k)))
  const totalWeight = kpis.reduce((s, k) => s + (Number(k.weight) || 0), 0)

  const save = async status => {
    if (status === 'final' && !window.confirm(
      `Finalise ${employee.full_name}'s evaluation for ${periodLabel(period)}? It will be shared with them and locked.`)) return
    setBusy(true)
    setError('')
    try {
      const d = await api.saveEvaluation(employee.id, period, {
        status, summary,
        kpis: kpis.map(({ title, metric, target, weight, rating }) => ({ title, metric, target, weight, rating })),
      })
      setData(d)
      setKpis(d.kpis)
      toast.show(status === 'final' ? 'Evaluation finalised and shared' : isFinal ? 'Evaluation reopened' : 'Draft saved')
      onSaved?.(d)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="eval-sheet">
      <div className="eval-head">
        <Avatar name={employee.full_name} color={employee.avatar_color} size="xl" />
        <div className="eval-who">
          <h2 className="truncate">{employee.full_name}</h2>
          <div className="muted truncate">{employee.job_title} · {employee.department}</div>
          <div className="row mt-8" style={{ gap: 6, flexWrap: 'wrap' }}>
            <RoleBadge role={employee.role} />
            <span className="badge">{periodLabel(period)}</span>
            {isFinal
              ? <span className="badge badge-success"><Icon name="lock" size={11} /> Final</span>
              : evaluation ? <span className="badge">Draft</span> : <span className="badge">New</span>}
          </div>
        </div>
        <div className="eval-score">
          <ScoreRing score={live.score} />
          <div className={`eval-grade tone-${tone(live.score)}`}>{live.grade || 'Not scored yet'}</div>
        </div>
      </div>

      <div className="eval-metrics" aria-label="Delivered this period">
        <div><strong>{metrics.tasks_done}</strong><span>tasks done</span></div>
        <div><strong>{metrics.points_done}</strong><span>story points</span></div>
        <div><strong>{metrics.on_time == null ? '–' : `${metrics.on_time}%`}</strong><span>on time</span></div>
        <div><strong>{metrics.bugs_fixed}</strong><span>bugs fixed</span></div>
        <div className={metrics.overdue ? 'is-warn' : ''}><strong>{metrics.overdue}/{metrics.open}</strong><span>overdue / open</span></div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="kpi-list">
        <div className="kpi-row kpi-row-head">
          <span>KPI</span><span>Measured by</span><span>Target / rating</span><span>Weight</span><span>Score</span><span />
        </div>
        {live.kpis.map((k, i) => (
          <div className="kpi-row" key={i}>
            <input className="input" value={k.title} readOnly={readOnly} placeholder="KPI name"
              aria-label="KPI name" onChange={e => update(i, { title: e.target.value })} />
            <select className="select" value={k.metric} disabled={readOnly} aria-label="Measured by"
              onChange={e => update(i, { metric: e.target.value, target: e.target.value === 'manual' ? null : (k.target || 10), rating: null })}>
              {Object.entries(meta.metrics).map(([key, m]) => <option key={key} value={key}>{m.label}</option>)}
            </select>
            <div className="kpi-target">
              {k.metric === 'manual'
                ? <Stars value={k.rating} readOnly={readOnly} onChange={rating => update(i, { rating })} />
                : <>
                    <span className="kpi-actual" title="Delivered this period">{k.actual ?? '–'}</span>
                    <span className="dim">/</span>
                    <input className="input kpi-num" type="number" min="1" value={k.target ?? ''} readOnly={readOnly}
                      aria-label="Target" onChange={e => update(i, { target: e.target.value })} />
                    <span className="tiny dim">{meta.metrics[k.metric]?.unit}</span>
                  </>}
            </div>
            <input className="input kpi-num" type="number" min="0" max="10" value={k.weight} readOnly={readOnly}
              aria-label="Weight" title={totalWeight ? `${Math.round((k.weight / totalWeight) * 100)}% of the total` : ''}
              onChange={e => update(i, { weight: e.target.value })} />
            <div className="kpi-score">
              <div className="kpi-bar"><span className={`tone-${tone(k.score)}`} style={{ width: `${k.score ?? 0}%` }} /></div>
              <span className="tiny">{k.score ?? '–'}</span>
            </div>
            {!readOnly
              ? <button className="btn btn-ghost btn-icon btn-xs" aria-label="Remove KPI"
                  onClick={() => setKpis(list => list.filter((_, j) => j !== i))}><Icon name="trash" size={14} /></button>
              : <span />}
          </div>
        ))}
        {!readOnly && (
          <button className="btn btn-ghost kpi-add"
            onClick={() => setKpis(list => [...list, { title: '', metric: 'manual', target: null, weight: 1, rating: null }])}>
            <Icon name="plus" size={15} /> Add KPI
          </button>
        )}
      </div>

      <div className="field">
        <label htmlFor="eval-summary">Feedback</label>
        <textarea id="eval-summary" className="textarea" rows={3} value={summary} readOnly={readOnly}
          placeholder="Strengths, what to improve, and goals for next period…"
          onChange={e => setSummary(e.target.value)} />
      </div>

      {data.canEdit && (
        <div className="row eval-actions">
          {isFinal ? (
            data.canReopen
              ? <button className="btn" disabled={busy} onClick={() => save('draft')}><Icon name="lock" size={15} /> Reopen</button>
              : <span className="tiny dim"><Icon name="lock" size={12} /> Finalised by {evaluation.evaluator_name}. Only an admin can reopen it.</span>
          ) : (
            <>
              <button className="btn" disabled={busy} onClick={() => save('draft')}>Save draft</button>
              <button className="btn btn-primary" disabled={busy} onClick={() => save('final')}>
                <Icon name="check" size={15} /> Finalise &amp; share
              </button>
            </>
          )}
          {evaluation?.evaluator_name && !isFinal && <span className="tiny dim">Last saved by {evaluation.evaluator_name}</span>}
        </div>
      )}
    </div>
  )
}

// ---- page -------------------------------------------------------------------------

export function Evaluations() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const options = useMemo(() => periodOptions(), [])
  const period = params.get('period') || options.months[0].value
  const selected = params.get('employee') ? Number(params.get('employee')) : null

  const [meta, setMeta] = useState(null)
  const [team, setTeam] = useState(null)
  const [mine, setMine] = useState(null)
  const [tab, setTab] = useState(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('')

  const setParam = (key, value) => setParams(p => {
    const next = new URLSearchParams(p)
    if (value == null || value === '') next.delete(key); else next.set(key, value)
    return next
  }, { replace: true })

  const loadTeam = useCallback(() => api.evaluationTeam(period).then(setTeam), [period])

  useEffect(() => { api.evaluationMeta().then(setMeta) }, [])
  useEffect(() => { api.myEvaluations().then(setMine) }, [])
  useEffect(() => { loadTeam() }, [loadTeam])
  useEffect(() => {
    if (tab || !team) return
    setTab(team.length ? 'team' : 'mine')
  }, [team, tab])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (team || []).filter(e => {
      if (filter === 'none' && e.evaluation) return false
      if (filter && filter !== 'none' && e.evaluation?.status !== filter) return false
      return !q || e.full_name.toLowerCase().includes(q) || (e.department || '').toLowerCase().includes(q)
    })
  }, [team, search, filter])

  const progress = useMemo(() => {
    const list = team || []
    const final = list.filter(e => e.evaluation?.status === 'final')
    return {
      total: list.length,
      final: final.length,
      draft: list.filter(e => e.evaluation?.status === 'draft').length,
      avg: final.length ? Math.round(final.reduce((s, e) => s + e.evaluation.score, 0) / final.length) : null,
    }
  }, [team])

  if (!meta || !team || !mine || !tab) return <div className="main"><div className="eval-loading"><Spinner /></div></div>

  return (
    <div className="main">
      <div className="page-head">
        <div className="page-head-text">
          <div className="breadcrumb">People</div>
          <h1>Evaluations</h1>
        </div>
        <select className="select" style={{ width: 'auto' }} value={period} aria-label="Evaluation period"
          onChange={e => setParam('period', e.target.value)}>
          <optgroup label="Monthly">{options.months.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>
          <optgroup label="Quarterly">{options.quarters.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>
        </select>
      </div>

      <div className="toolbar">
        <div className="seg" role="tablist">
          {team.length > 0 && (
            <button role="tab" aria-selected={tab === 'team'} className={tab === 'team' ? 'on' : ''}
              onClick={() => setTab('team')}><Icon name="users" size={15} /> My team <span className="seg-count">{team.length}</span></button>
          )}
          <button role="tab" aria-selected={tab === 'mine'} className={tab === 'mine' ? 'on' : ''}
            onClick={() => setTab('mine')}><Icon name="award" size={15} /> My results <span className="seg-count">{mine.length}</span></button>
        </div>
        {tab === 'team' && (
          <div className="eval-progress tiny muted">
            <span><strong>{progress.final}</strong> of {progress.total} finalised</span>
            {progress.draft > 0 && <span>· {progress.draft} in draft</span>}
            {progress.avg != null && <span>· team average <strong>{progress.avg}</strong></span>}
          </div>
        )}
      </div>

      <div className="page-scroll">
        {tab === 'team' ? (
          <div className="eval-layout">
            <aside className="eval-people">
              <div className="eval-people-filters">
                <input className="input search-input" placeholder="Search people…" value={search}
                  onChange={e => setSearch(e.target.value)} />
                <select className="select" value={filter} onChange={e => setFilter(e.target.value)} aria-label="Status">
                  <option value="">All</option>
                  <option value="none">Not started</option>
                  <option value="draft">Draft</option>
                  <option value="final">Final</option>
                </select>
              </div>
              <div className="eval-people-list">
                {filtered.map(e => (
                  <button key={e.id} className={`eval-person${selected === e.id ? ' active' : ''}`}
                    onClick={() => setParam('employee', e.id)}>
                    <Avatar name={e.full_name} color={e.avatar_color} size="md" />
                    <span className="eval-person-text">
                      <span className="truncate">{e.full_name}</span>
                      <span className="tiny dim truncate">{e.job_title} · {e.department}</span>
                    </span>
                    <StatusPill evaluation={e.evaluation} />
                  </button>
                ))}
                {filtered.length === 0 && <p className="hint" style={{ padding: 12 }}>No one matches.</p>}
              </div>
            </aside>
            <section className="eval-main">
              {selected
                ? <EvaluationSheet key={`${selected}-${period}`} employeeId={selected} period={period} meta={meta}
                    onSaved={loadTeam} />
                : (
                  <div className="empty-state">
                    <span className="empty-icon"><Icon name="target" size={22} /></span>
                    <div className="empty-title">Pick someone to evaluate</div>
                    <div className="tiny">Set their KPIs for {periodLabel(period)}. Measured KPIs fill in from the work on the boards; rate the rest from 1 to 5.</div>
                  </div>
                )}
            </section>
          </div>
        ) : (
          <div className="eval-mine">
            {mine.length === 0 && (
              <div className="empty-state">
                <span className="empty-icon"><Icon name="award" size={22} /></span>
                <div className="empty-title">No evaluations shared with you yet</div>
                <div className="tiny">When your manager or project lead finalises one, it shows up here, {user.full_name.split(' ')[0]}.</div>
              </div>
            )}
            {mine.map(d => (
              <EvaluationSheet key={d.period} employeeId={user.id} period={d.period} meta={meta}
                data={{ ...d, canEdit: false }} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
