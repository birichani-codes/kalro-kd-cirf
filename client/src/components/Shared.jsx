export const Badge = ({ value, type }) => {
  const cls = 'badge badge-'+(type||(value?.toLowerCase().replace(/\s+/g,'-')||''))
  return <span className={cls}>{value}</span>
}

export const KTypeBadge = ({ type }) => {
  const labels = { playbook:'Playbook', runbook:'Runbook', reference:'Reference', 'lessons-learned':'Lessons Learned' }
  return <span className={'badge badge-'+type}>{labels[type]||type}</span>
}

export const ConfidenceBadge = ({ score }) => {
  const pct = Math.round((score||0)*100)
  const color = pct>=80?'var(--green)':pct>=50?'var(--yellow)':'var(--kalro-red-light)'
  return (
    <div className="confidence-bar">
      <div className="confidence-bar-track">
        <div className="confidence-bar-fill" style={{width:pct+'%',background:color}}/>
      </div>
      <span style={{fontFamily:'var(--font-mono)',fontSize:11,color,minWidth:30}}>{pct}%</span>
    </div>
  )
}

export const SlaIndicator = ({ inc }) => {
  if (!inc.sla_deadline) return null
  const mins = inc.sla_minutes_remaining
  if (inc.sla_breached) return <span className="sla-breach">⚠ SLA BREACHED</span>
  if (mins < 60) return <span className="sla-warn">⏱ {mins}m left</span>
  if (mins < 240) return <span className="sla-warn">⏱ {Math.round(mins/60)}h left</span>
  return <span className="sla-ok">⏱ {Math.round(mins/60)}h left</span>
}

export const Tags = ({ tags=[] }) => (
  <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
    {tags.map(t=><span key={t} className="tag">{t}</span>)}
  </div>
)

export const Loading = () => (
  <div className="loading"><div className="spinner"/><span>Loading...</span></div>
)

export const EmptyState = ({ icon='◈', title, sub }) => (
  <div className="empty-state">
    <div className="empty-icon">{icon}</div>
    <h3>{title}</h3>
    {sub && <p style={{fontSize:14}}>{sub}</p>}
  </div>
)

export const timeAgo = (d) => {
  if (!d) return '—'
  const diff=Date.now()-new Date(d), m=Math.floor(diff/60000)
  if (m<60) return m+'m ago'
  const h=Math.floor(m/60); if (h<24) return h+'h ago'
  const days=Math.floor(h/24); if (days<30) return days+'d ago'
  return new Date(d).toLocaleDateString()
}

export const fmtDate = (d) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-KE',{day:'numeric',month:'short',year:'numeric'})
}

export const fmtDateTime = (d) => {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-KE',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})
}
