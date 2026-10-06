import { useState, useEffect, useMemo } from 'react'
import api from '../api/axios'
import { Loading, fmtDate } from '../components/Shared'

const ACTION_COLORS = {
  LOGIN: 'var(--kalro-green-light)',
  CREATE_INCIDENT: 'var(--orange)',
  CREATE_KNOWLEDGE: 'var(--kalro-green)',
  UPDATE_INCIDENT: 'var(--yellow)',
  ANNOTATE_KNOWLEDGE: 'var(--purple)',
  SEARCH: 'var(--text3)',
  CREATE_USER: 'var(--kalro-green-light)',
  DELETE_USER: 'var(--kalro-red-light)',
  VERSION_KNOWLEDGE: 'var(--accent)',
  USE_KNOWLEDGE: 'var(--kalro-green)',
  CREATE_PIR: 'var(--accent)',
  UPDATE_PIR: 'var(--yellow)'
}

export default function Reports() {
  const [dashboard, setDashboard] = useState(null)
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('overview')
  const [downloading, setDownloading] = useState(false)
  const [sending, setSending] = useState(false)
  const [reportStatus, setReportStatus] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')

  useEffect(() => {
    Promise.all([api.get('/reports/dashboard'), api.get('/reports/audit')])
      .then(([summaryRes, auditRes]) => {
        setDashboard(summaryRes.data)
        setLogs(auditRes.data)
      })
      .catch(err => {
        console.error('Failed to load reports dashboard', err)
      })
      .finally(() => setLoading(false))
  }, [])

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      if (actionFilter !== 'all' && log.action !== actionFilter) return false
      if (roleFilter !== 'all' && log.user_role !== roleFilter) return false
      const query = searchQuery.trim().toLowerCase()
      if (!query) return true
      const haystack = [log.user_name, log.user_role, log.action, log.target_type, log.target_id, JSON.stringify(log.metadata)].join(' ').toLowerCase()
      return haystack.includes(query)
    })
  }, [logs, actionFilter, roleFilter, searchQuery])

  const downloadReportPdf = async () => {
    setDownloading(true)
    try {
      const res = await api.get('/reports/download', { responseType: 'blob' })
      const blob = new Blob([res.data], { type: 'application/pdf' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', 'KALRO-Resilience-Report.pdf')
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to download report PDF:', err)
      alert('Failed to download report PDF. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  const downloadAuditCsv = () => {
    const rows = [
      ['Action', 'User', 'Role', 'Target', 'Details', 'Time'],
      ...filteredLogs.map(log => [
        log.action,
        log.user_name,
        log.user_role,
        `${log.target_type || '—'}${log.target_id ? ' / ' + log.target_id : ''}`,
        log.metadata ? Object.entries(log.metadata).map(([k,v]) => `${k}: ${v}`).join('; ') : '',
        fmtDate(log.created_at)
      ])
    ]

    const csv = rows.map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', 'audit-log.csv')
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  }

  const sendReportNow = async () => {
    setSending(true)
    setReportStatus('Sending latest report to configured recipients...')
    try {
      const res = await api.post('/reports/schedule-email')
      if (res.data?.success) {
        setReportStatus(`Report sent to ${res.data.delivered} recipients.`)
      } else {
        setReportStatus('Report request completed, but no recipients were delivered.')
      }
    } catch (err) {
      console.error('Failed to send report now', err)
      setReportStatus('Failed to send report now. See console for details.')
    } finally {
      setSending(false)
      setTimeout(() => setReportStatus(null), 6000)
    }
  }

  const renderChartBars = (data) => {
    const entries = Object.entries(data || {})
    const max = Math.max(...entries.map(([, value]) => value), 1)
    return entries.map(([label, value]) => (
      <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ width: 90, color: 'var(--text3)', fontSize: 12 }}>{label}</span>
        <div style={{ position: 'relative', flex: 1, height: 10, borderRadius: 999, background: 'rgba(255,255,255,0.08)' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.round((value / max) * 100)}%`, background: 'var(--kalro-green)' }} />
        </div>
        <span style={{ minWidth: 36, textAlign: 'right', fontSize: 12, color: 'var(--text3)' }}>{value}</span>
      </div>
    ))
  }

  if (loading) return <Loading />
  if (!dashboard) return <div style={{ padding: 20 }}>Unable to load report dashboard.</div>

  const { summary, by_status, by_severity, by_type, recent_activity, top_knowledge, sla_breached, metrics } = dashboard
  const maturity = summary?.csf_maturity_score
  const compliance = summary?.pr_ac_compliance

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Reports & Audit</h1>
          <p>System analytics, compliance posture, and audit trail for senior response teams.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-secondary" onClick={downloadAuditCsv}>Download Audit CSV</button>
          <button className="btn btn-primary" onClick={downloadReportPdf} disabled={downloading}>{downloading ? 'Preparing PDF…' : 'Download Resilience PDF'}</button>
          <button className="btn btn-accent" onClick={sendReportNow} disabled={sending}>{sending ? 'Sending…' : 'Send Report Now'}</button>
        </div>
      </div>

      <div className="page-body">
        <div className="tabs" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <button className={'tab-btn ' + (tab === 'overview' ? 'active' : '')} onClick={() => setTab('overview')}>Overview</button>
            <button className={'tab-btn ' + (tab === 'audit' ? 'active' : '')} onClick={() => setTab('audit')}>Audit Log ({logs.length})</button>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--text3)', fontSize: 13 }}>Active score: {summary?.active_threat_index?.toFixed?.(1) ?? summary?.active_threat_index}%</span>
            <span style={{ color: 'var(--text3)', fontSize: 13 }}>SLA breach: {summary?.sla_breach_rate}%</span>
          </div>
        </div>

        {tab === 'overview' && (
          <>
            <div className="stats-grid">
              {[
                { label: 'Total Incidents', value: summary.total_incidents, color: 'green' },
                { label: 'Open / Active', value: summary.open_incidents, color: 'red' },
                { label: 'Resolved', value: summary.resolved_incidents, color: 'green' },
                { label: 'Knowledge Entries', value: summary.total_knowledge, color: 'accent' },
                { label: 'Avg Confidence', value: `${Math.round(summary.avg_confidence * 100)}%`, color: 'yellow' },
                { label: 'CSF Maturity', value: maturity?.label || 'N/A', color: 'purple' },
                { label: 'PR.AC Compliance', value: `${compliance?.compliance ?? 0}%`, color: 'orange' },
                { label: 'Audit Events', value: summary.total_audit_events, color: 'accent' }
              ].map(card => (
                <div key={card.label} className={`stat-card ${card.color}`}>
                  <div className="stat-label">{card.label}</div>
                  <div className="stat-value">{card.value}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gap: 20, gridTemplateColumns: '1.5fr 1fr' }}>
              <div style={{ display: 'grid', gap: 20 }}>
                <div className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <h3>Operational Health</h3>
                    <span style={{ color: 'var(--text3)', fontSize: 12 }}>Snapshot</span>
                  </div>
                  <div style={{ display: 'grid', gap: 12 }}>
                    <div>{renderChartBars(by_status)}</div>
                    <div>{renderChartBars(by_severity)}</div>
                    <div>{renderChartBars(by_type)}</div>
                  </div>
                </div>

                <div className="card" style={{ padding: '18px' }}>
                  <h3>Strategic posture</h3>
                  <p style={{ color: 'var(--text3)', margin: '10px 0 16px 0' }}>{summary.attacker_prediction}</p>
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div><strong>Recommended action:</strong> {summary.recommended_countermeasure || 'Review active containment strategy'}</div>
                    <div><strong>Confidence band:</strong> {summary.recommended_scores?.confidence ?? 'N/A'}</div>
                    <div><strong>Resolution gain:</strong> {metrics?.resolution_speed_gain ? `${metrics.resolution_speed_gain}%` : 'N/A'}</div>
                    <div><strong>Incident backlog nearing SLA:</strong> {metrics?.sla_nearing_count ?? 0}</div>
                  </div>
                </div>
              </div>
              <div style={{ display: 'grid', gap: 20 }}>
                <div className="card" style={{ padding: '18px' }}>
                  <h3>Recent Activity</h3>
                  {recent_activity?.length ? (
                    <div style={{ display: 'grid', gap: 12 }}>
                      {recent_activity.slice(0, 6).map(item => (
                        <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                          <div>
                            <div style={{ fontWeight: 600 }}>{item.user_name || 'Unknown'}</div>
                            <div style={{ color: 'var(--text3)', fontSize: 12 }}>{item.action}</div>
                          </div>
                          <div style={{ textAlign: 'right', color: 'var(--text3)', fontSize: 12 }}>{fmtDate(item.created_at)}</div>
                        </div>
                      ))}
                    </div>
                  ) : <p style={{ color: 'var(--text3)' }}>No recent activity.</p>}
                </div>

                <div className="card" style={{ padding: '18px' }}>
                  <h3>Priority coverage</h3>
                  <p style={{ margin: '8px 0 16px 0', color: 'var(--text3)' }}>Top knowledge and active gaps that are shaping your IR posture.</p>
                  {top_knowledge?.length ? (
                    <div style={{ display: 'grid', gap: 12 }}>
                      {top_knowledge.slice(0, 4).map(entry => (
                        <div key={entry.id} style={{ borderRadius: 6, padding: 10, background: 'rgba(255,255,255,0.04)' }}>
                          <div style={{ fontWeight: 600 }}>{entry.title || entry.name || entry.id}</div>
                          <div style={{ fontSize: 12, color: 'var(--text3)' }}>Confidence: {Math.round((entry.confidence_score || 0) * 100)}%</div>
                        </div>
                      ))}
                    </div>
                  ) : <p style={{ color: 'var(--text3)' }}>No active knowledge entries.</p>}
                </div>
              </div>
            </div>

            <div className="card" style={{ marginTop: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <h3>Priority incidents approaching SLA</h3>
                <span style={{ color: 'var(--text3)', fontSize: 12 }}>{sla_breached?.length || 0} items</span>
              </div>
              {sla_breached?.length ? (
                <div style={{ display: 'grid', gap: 12 }}>
                  {sla_breached.slice(0, 5).map(incident => (
                    <div key={incident.id} style={{ display: 'grid', gap: 6, padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <span>{incident.title || incident.type || 'Incident'}</span>
                        <span style={{ color: 'var(--kalro-red)', fontSize: 12 }}>Overdue</span>
                      </div>
                      <div style={{ color: 'var(--text3)', fontSize: 12 }}>Reporter: {incident.reporter_name || 'Unknown'}</div>
                    </div>
                  ))}
                </div>
              ) : <p style={{ color: 'var(--text3)' }}>No incidents currently past SLA.</p>}
            </div>
          </>
        )}

        {tab === 'audit' && (
          <>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search audit log..."
                style={{ flex: 1, minWidth: 220, padding: 10, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)' }}
              />
              <select value={actionFilter} onChange={e => setActionFilter(e.target.value)} style={{ padding: 10, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)' }}>
                <option value="all">All actions</option>
                {Array.from(new Set(logs.map(l => l.action))).map(action => <option key={action} value={action}>{action}</option>)}
              </select>
              <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={{ padding: 10, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)' }}>
                <option value="all">All roles</option>
                {Array.from(new Set(logs.map(l => l.user_role))).map(role => <option key={role} value={role}>{role}</option>)}
              </select>
              <button className="btn btn-secondary" onClick={downloadAuditCsv}>Download CSV</button>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th>User</th>
                      <th>Role</th>
                      <th>Target</th>
                      <th>Details</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map(log => (
                      <tr key={log.id} style={{ cursor: 'default' }}>
                        <td><span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: ACTION_COLORS[log.action] || 'var(--text3)' }}>{log.action}</span></td>
                        <td style={{ color: 'var(--text)' }}>{log.user_name}</td>
                        <td><span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)' }}>{log.user_role}</span></td>
                        <td><span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)' }}>{log.target_type || '—'}{log.target_id ? ' / ' + log.target_id : ''}</span></td>
                        <td style={{ fontSize: 12, color: 'var(--text3)' }}>{log.metadata && Object.entries(log.metadata).map(([k, v]) => `${k}: ${v}`).join(', ')}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{fmtDate(log.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {reportStatus && (
          <div style={{ marginTop: 20, padding: 14, borderRadius: 6, background: 'rgba(13, 110, 253, 0.08)', color: 'var(--text)', border: '1px solid rgba(13,110,253,0.16)' }}>
            {reportStatus}
          </div>
        )}
      </div>
    </div>
  )
}
