/**
 * DefensiveRoutinesPanel
 * Recommends, executes and measures controlled defensive routines for an incident.
 */

import { useEffect, useMemo, useState } from 'react'
import api from '../api/axios'

const pct = v => v === null || v === undefined ? '—' : `${(Number(v) * 100).toFixed(0)}%`

export default function DefensiveRoutinesPanel({ incidentId, onRoutineApplied }) {
  const [routines, setRoutines] = useState(null)
  const [executions, setExecutions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedRoutine, setSelectedRoutine] = useState(null)
  const [busy, setBusy] = useState('')
  const [stepDrafts, setStepDrafts] = useState({})
  const [completionDrafts, setCompletionDrafts] = useState({})
  const [rejectReasons, setRejectReasons] = useState({})

  useEffect(() => { if (incidentId) fetchAll() }, [incidentId])

  const fetchAll = async () => {
    setLoading(true); setError('')
    try {
      const [routineRes, executionRes] = await Promise.all([
        api.get(`/incidents/${incidentId}/defensive-routines`),
        api.get(`/incidents/${incidentId}/routine-executions`)
      ])
      setRoutines(routineRes.data)
      setExecutions(executionRes.data || [])
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch defensive routines')
    } finally { setLoading(false) }
  }

  const executionByRoutine = useMemo(() => {
    const map = {}
    executions.forEach(e => { if (!map[e.knowledge_id] || e.status === 'in-progress') map[e.knowledge_id] = e })
    return map
  }, [executions])

  const startRoutine = async knowledgeId => {
    setBusy(`start:${knowledgeId}`); setError('')
    try {
      const res = await api.post(`/incidents/${incidentId}/routine-executions/${knowledgeId}/start`, {})
      setExecutions(prev => [res.data, ...prev.filter(e => e.id !== res.data.id)])
      onRoutineApplied?.()
    } catch (err) { setError(err.response?.data?.error || 'Failed to start routine') }
    finally { setBusy('') }
  }

  const saveStep = async (execution, step, completed) => {
    const key = `${execution.id}:${step.id}`
    const draft = stepDrafts[key] || {}
    setBusy(`step:${key}`); setError('')
    try {
      const res = await api.patch(`/incidents/${incidentId}/routine-executions/${execution.id}/steps/${step.id}`, {
        completed,
        evidence: draft.evidence !== undefined ? draft.evidence : step.evidence,
        notes: draft.notes !== undefined ? draft.notes : step.notes
      })
      setExecutions(prev => prev.map(e => e.id === res.data.id ? res.data : e))
    } catch (err) { setError(err.response?.data?.error || 'Failed to update routine step') }
    finally { setBusy('') }
  }

  const completeExecution = async (execution, outcome) => {
    const draft = completionDrafts[execution.id] || {}
    setBusy(`complete:${execution.id}`); setError('')
    try {
      const res = await api.post(`/incidents/${incidentId}/routine-executions/${execution.id}/complete`, {
        outcome,
        summary: draft.summary || '',
        evidence: draft.evidence || '',
        escalated: Boolean(draft.escalated),
        rollback_used: Boolean(draft.rollback_used)
      })
      setExecutions(prev => prev.map(e => e.id === res.data.id ? res.data : e))
      await fetchAll()
      onRoutineApplied?.()
    } catch (err) { setError(err.response?.data?.error || 'Failed to complete routine') }
    finally { setBusy('') }
  }

  const rejectRoutine = async knowledgeId => {
    setBusy(`reject:${knowledgeId}`); setError('')
    try {
      await api.post(`/incidents/${incidentId}/reject-routine/${knowledgeId}`, { reason: rejectReasons[knowledgeId] || '' })
      await fetchAll()
      onRoutineApplied?.()
    } catch (err) { setError(err.response?.data?.error || 'Failed to reject recommendation') }
    finally { setBusy('') }
  }

  if (loading && !routines) return <div style={{textAlign:'center',padding:32,color:'var(--text3)',fontFamily:'var(--font-mono)'}}>Loading defensive routines...</div>
  if (!routines || routines.total_candidates === 0) return <div style={{padding:20,textAlign:'center',color:'var(--text3)'}}>No active defensive routines match this incident yet.</div>

  return (
    <div>
      {error && <div className="alert alert-error" style={{marginBottom:14}}>{error}</div>}
      <div style={{fontSize:12,color:'var(--text3)',marginBottom:14}}>
        The engine matches active routines using incident type, severity, trigger conditions, tags, prior effectiveness and role eligibility. Starting a routine records knowledge application; success is recorded only after the procedure is completed.
      </div>

      <div style={{display:'grid',gap:14}}>
        {routines.top_recommendations.map((routine, idx) => {
          const r = routine.defensive_routine
          const execution = executionByRoutine[routine.knowledge_id]
          const expanded = selectedRoutine === routine.knowledge_id
          const completedRequired = execution?.steps?.filter(s => s.required && s.completed).length || 0
          const totalRequired = execution?.steps?.filter(s => s.required).length || 0
          return (
            <div key={routine.knowledge_id} style={{background:'var(--bg3)',border:`1px solid ${expanded ? 'var(--kalro-green)' : 'var(--border)'}`,borderRadius:10,padding:16}}>
              <div onClick={() => setSelectedRoutine(expanded ? null : routine.knowledge_id)} style={{cursor:'pointer'}}>
                <div style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'flex-start'}}>
                  <div style={{minWidth:0}}>
                    <div style={{display:'flex',gap:7,flexWrap:'wrap',alignItems:'center',marginBottom:7}}>
                      <span style={{background:'var(--kalro-green)',color:'white',borderRadius:4,padding:'2px 6px',fontSize:10,fontFamily:'var(--font-mono)'}}>#{idx + 1}</span>
                      <span style={{fontSize:10,padding:'2px 6px',border:'1px solid var(--border)',borderRadius:4,color:'var(--text2)'}}>v{r.routine_version}</span>
                      <span style={{fontSize:10,padding:'2px 6px',border:'1px solid var(--border)',borderRadius:4,color:'var(--kalro-green)'}}>{r.lifecycle_status}</span>
                      {routine.review_due && <span style={{fontSize:10,padding:'2px 6px',borderRadius:4,background:'var(--yellow)',color:'var(--bg)'}}>review due</span>}
                      {!routine.role_eligible && <span style={{fontSize:10,padding:'2px 6px',borderRadius:4,background:'var(--kalro-red)',color:'white'}}>role restriction</span>}
                    </div>
                    <h5 style={{fontSize:15,margin:0,color:'var(--text)'}}>{routine.title}</h5>
                    <div style={{fontSize:11,color:'var(--text3)',marginTop:5}}>Match: {routine.match_reasons?.join(', ') || 'institutional knowledge'} · by {routine.contributor_name}</div>
                  </div>
                  <div style={{textAlign:'right',flexShrink:0}}>
                    <div style={{fontSize:9,color:'var(--text3)',fontFamily:'var(--font-mono)'}}>MATCH</div>
                    <div style={{fontSize:21,fontWeight:700,color:'var(--kalro-green)',fontFamily:'var(--font-mono)'}}>{pct(routine.match_score)}</div>
                  </div>
                </div>

                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))',gap:8,marginTop:12}}>
                  {[
                    ['Success', pct(r.success_rate)],
                    ['Acceptance', pct(r.metrics?.acceptance_rate)],
                    ['Completion', pct(r.metrics?.completion_rate)],
                    ['Completed', r.metrics?.completed_count ?? 0],
                    ['Est. time', r.estimated_time_minutes ? `${r.estimated_time_minutes} min` : (r.estimated_time_to_resolve || '—')]
                  ].map(([label,value]) => <div key={label} style={{background:'var(--bg2)',padding:8,borderRadius:6}}><div style={{fontSize:9,color:'var(--text3)',fontFamily:'var(--font-mono)'}}>{label}</div><div style={{fontSize:12,color:'var(--text)',fontWeight:600,marginTop:2}}>{value}</div></div>)}
                </div>
              </div>

              {expanded && (
                <div style={{marginTop:15,paddingTop:15,borderTop:'1px solid var(--border)'}}>
                  {r.primary_goal && <div style={{marginBottom:10}}><strong style={{fontSize:11,color:'var(--text3)'}}>Primary goal: </strong><span style={{fontSize:12,color:'var(--text2)'}}>{r.primary_goal}</span></div>}
                  <div style={{fontSize:12,color:'var(--text2)',lineHeight:1.6,marginBottom:12}}>{routine.content_preview}</div>

                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:10,marginBottom:14}}>
                    <Info title="Trigger conditions" items={r.trigger_conditions} empty="Type/tag match" />
                    <Info title="Required roles" items={r.required_roles} />
                    <Info title="Escalate when" items={r.escalation_conditions} empty="No explicit escalation rule" />
                    <Info title="Application risks" items={r.application_risks} empty="No documented risks" />
                  </div>

                  {r.expected_outcome && <div style={{padding:10,background:'var(--bg2)',borderRadius:7,marginBottom:14,fontSize:12}}><strong>Expected outcome:</strong> {r.expected_outcome}</div>}

                  {!execution && (
                    <>
                      <div style={{fontSize:11,fontFamily:'var(--font-mono)',color:'var(--text3)',marginBottom:8}}>PROCEDURE ({r.steps.length} STEPS)</div>
                      <div style={{display:'grid',gap:6,marginBottom:14}}>
                        {r.steps.map(step => <div key={step.id} style={{display:'flex',gap:8,fontSize:12,color:'var(--text2)'}}><span style={{fontFamily:'var(--font-mono)',color:'var(--kalro-green)'}}>{step.order}.</span><span>{step.action}{step.required ? ' *' : ''}{step.evidence_required ? ' · evidence required' : ''}</span></div>)}
                      </div>
                      <div style={{display:'flex',gap:8,alignItems:'stretch',flexWrap:'wrap'}}>
                        <button className="btn btn-primary" disabled={busy || !routine.role_eligible} onClick={() => startRoutine(routine.knowledge_id)}>{busy === `start:${routine.knowledge_id}` ? 'Starting...' : 'Start & apply routine'}</button>
                        <input value={rejectReasons[routine.knowledge_id] || ''} onChange={e => setRejectReasons(x => ({...x,[routine.knowledge_id]:e.target.value}))} placeholder="Reason if rejecting (optional)" style={{flex:'1 1 220px',padding:'8px 10px',border:'1px solid var(--border)',borderRadius:6,background:'var(--bg2)',color:'var(--text)'}} />
                        <button disabled={busy} onClick={() => rejectRoutine(routine.knowledge_id)} style={{padding:'8px 12px',border:0,borderRadius:6,background:'var(--kalro-red)',color:'white',cursor:'pointer'}}>Reject</button>
                      </div>
                    </>
                  )}

                  {execution && (
                    <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:8,padding:14}}>
                      <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',marginBottom:12}}>
                        <div><div style={{fontSize:11,fontFamily:'var(--font-mono)',color:'var(--text3)'}}>ROUTINE EXECUTION</div><div style={{fontSize:12,color:'var(--text2)',marginTop:3}}>Required steps: {completedRequired}/{totalRequired}</div></div>
                        <span style={{fontSize:11,padding:'3px 8px',borderRadius:10,background:execution.status === 'completed' ? 'var(--kalro-green)' : 'var(--accent)',color:'white'}}>{execution.status}{execution.outcome ? ` · ${execution.outcome}` : ''}</span>
                      </div>

                      <div style={{display:'grid',gap:10}}>
                        {execution.steps.map(step => {
                          const key = `${execution.id}:${step.id}`
                          const draft = stepDrafts[key] || {}
                          return <div key={step.id} style={{border:'1px solid var(--border)',borderRadius:7,padding:10,opacity:execution.status === 'completed' ? .85 : 1}}>
                            <div style={{display:'flex',justifyContent:'space-between',gap:10,marginBottom:7}}>
                              <div style={{fontSize:12,color:'var(--text)',fontWeight:600}}>{step.order}. {step.action}</div>
                              <div style={{fontSize:10,color:step.completed ? 'var(--kalro-green)' : 'var(--text3)'}}>{step.completed ? 'Completed' : step.required ? 'Required' : 'Optional'}</div>
                            </div>
                            {step.success_criteria && <div style={{fontSize:11,color:'var(--text3)',marginBottom:7}}>Success evidence: {step.success_criteria}</div>}
                            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                              <input disabled={execution.status === 'completed'} value={draft.evidence !== undefined ? draft.evidence : (step.evidence || '')} onChange={e => setStepDrafts(x => ({...x,[key]:{...x[key],evidence:e.target.value}}))} placeholder={step.evidence_required ? (step.evidence_hint || 'Evidence required') : 'Evidence / verification'} style={{padding:'7px 8px',border:'1px solid var(--border)',borderRadius:5,background:'var(--bg3)',color:'var(--text)'}} />
                              <input disabled={execution.status === 'completed'} value={draft.notes !== undefined ? draft.notes : (step.notes || '')} onChange={e => setStepDrafts(x => ({...x,[key]:{...x[key],notes:e.target.value}}))} placeholder="Notes" style={{padding:'7px 8px',border:'1px solid var(--border)',borderRadius:5,background:'var(--bg3)',color:'var(--text)'}} />
                            </div>
                            {execution.status === 'in-progress' && <div style={{marginTop:8}}><button className={`btn btn-sm ${step.completed ? 'btn-ghost' : 'btn-primary'}`} disabled={busy === `step:${key}`} onClick={() => saveStep(execution, step, !step.completed)}>{busy === `step:${key}` ? 'Saving...' : step.completed ? 'Reopen step' : 'Mark complete'}</button></div>}
                          </div>
                        })}
                      </div>

                      {execution.status === 'in-progress' && (
                        <div style={{marginTop:14,paddingTop:14,borderTop:'1px solid var(--border)'}}>
                          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                            <textarea rows={2} value={completionDrafts[execution.id]?.summary || ''} onChange={e => setCompletionDrafts(x => ({...x,[execution.id]:{...x[execution.id],summary:e.target.value}}))} placeholder="Outcome summary" style={{padding:8,border:'1px solid var(--border)',borderRadius:6,background:'var(--bg3)',color:'var(--text)'}} />
                            <textarea rows={2} value={completionDrafts[execution.id]?.evidence || ''} onChange={e => setCompletionDrafts(x => ({...x,[execution.id]:{...x[execution.id],evidence:e.target.value}}))} placeholder="Final evidence / verification" style={{padding:8,border:'1px solid var(--border)',borderRadius:6,background:'var(--bg3)',color:'var(--text)'}} />
                          </div>
                          <div style={{display:'flex',gap:12,marginTop:8,fontSize:11,color:'var(--text2)',flexWrap:'wrap'}}>
                            <label><input type="checkbox" checked={Boolean(completionDrafts[execution.id]?.escalated)} onChange={e => setCompletionDrafts(x => ({...x,[execution.id]:{...x[execution.id],escalated:e.target.checked}}))} /> Escalation used</label>
                            <label><input type="checkbox" checked={Boolean(completionDrafts[execution.id]?.rollback_used)} onChange={e => setCompletionDrafts(x => ({...x,[execution.id]:{...x[execution.id],rollback_used:e.target.checked}}))} /> Rollback used</label>
                          </div>
                          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginTop:10}}>
                            <button className="btn btn-success" disabled={busy} onClick={() => completeExecution(execution,'successful')}>Successful</button>
                            <button disabled={busy} onClick={() => completeExecution(execution,'partial')} style={{padding:'8px 10px',border:0,borderRadius:6,background:'var(--yellow)',color:'var(--bg)',cursor:'pointer'}}>Partial</button>
                            <button disabled={busy} onClick={() => completeExecution(execution,'failed')} style={{padding:'8px 10px',border:0,borderRadius:6,background:'var(--kalro-red)',color:'white',cursor:'pointer'}}>Failed</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Info({ title, items = [], empty = 'None' }) {
  return <div style={{background:'var(--bg2)',padding:9,borderRadius:6}}><div style={{fontSize:9,fontFamily:'var(--font-mono)',color:'var(--text3)',marginBottom:5}}>{title.toUpperCase()}</div>{items?.length ? <ul style={{margin:0,paddingLeft:16,fontSize:11,color:'var(--text2)',lineHeight:1.5}}>{items.map((x,i)=><li key={`${x}-${i}`}>{x}</li>)}</ul> : <div style={{fontSize:11,color:'var(--text3)'}}>{empty}</div>}</div>
}
