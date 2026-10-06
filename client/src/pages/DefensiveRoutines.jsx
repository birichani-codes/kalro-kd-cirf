import { useEffect, useState } from 'react'
import api from '../api/axios'
import { Loading, Badge } from '../components/Shared'
import { useAuth } from '../context/AuthContext'

const csv = value => String(value || '').split(',').map(x => x.trim()).filter(Boolean)
const lines = value => String(value || '').split('\n').map(x => x.trim()).filter(Boolean)
const toPct = v => v === null || v === undefined ? '—' : `${Number(v).toFixed(1)}%`

const lifecycleNext = {
  draft:['reviewed','archived'], reviewed:['draft','approved','archived'], approved:['reviewed','active','archived'],
  active:['superseded','archived'], superseded:['archived'], archived:['draft']
}

const emptyForm = () => ({
  title:'', content:'', tags:'', category:'response-checklist', primary_goal:'', payoff_weight:0.6,
  nist_function:'RS', socio_technical_focus:'both', applicable_incident_types:'', applicable_severities:'critical, high, medium, low',
  trigger_conditions:'', required_roles:'analyst, super_admin', prerequisites:'', steps:'', evidence_requirements:'',
  expected_outcome:'', failure_conditions:'', escalation_conditions:'', rollback_instructions:'', application_risks:'',
  estimated_time_minutes:'', estimated_cost:'', review_interval_days:180, associated_scripts:'', institutional_enablers:'',
  routine_signature:'', change_note:''
})

export default function DefensiveRoutines() {
  const { isAdmin, isAnalyst } = useAuth()
  const [routines,setRoutines] = useState(null)
  const [metrics,setMetrics] = useState(null)
  const [coverage,setCoverage] = useState(null)
  const [pirs,setPirs] = useState([])
  const [loading,setLoading] = useState(true)
  const [tab,setTab] = useState('routines')
  const [expanded,setExpanded] = useState(null)
  const [editingId,setEditingId] = useState(null)
  const [selectedPir,setSelectedPir] = useState('')
  const [form,setForm] = useState(emptyForm)
  const [busy,setBusy] = useState(false)
  const [message,setMessage] = useState('')
  const [error,setError] = useState('')

  useEffect(()=>{ fetchData() },[])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [r,m,c] = await Promise.all([
        api.get('/knowledge/defensive-routines/list'),
        api.get('/knowledge/defensive-routines/metrics'),
        api.get('/knowledge/defensive-routines/coverage')
      ])
      setRoutines(r.data); setMetrics(m.data); setCoverage(c.data)
      if (isAdmin) {
        const p = await api.get('/pir')
        setPirs((p.data || []).filter(x => x.status !== 'converted'))
      }
    } catch(e) { setError(e.response?.data?.error || 'Failed to load defensive routines') }
    finally { setLoading(false) }
  }

  const parseSteps = value => lines(value).map((row,index) => {
    const [action,evidenceHint,successCriteria,ownerRole] = row.split('|').map(x => x?.trim() || '')
    return {
      id:`step-${index+1}`, order:index+1, action, required:true,
      owner_role:ownerRole || 'analyst', evidence_required:Boolean(evidenceHint), evidence_hint:evidenceHint,
      success_criteria:successCriteria
    }
  })

  const payload = () => ({
    ...form,
    payoff_weight:Number(form.payoff_weight || 0.5),
    review_interval_days:Number(form.review_interval_days || 180),
    estimated_time_minutes:form.estimated_time_minutes === '' ? null : Number(form.estimated_time_minutes),
    tags:csv(form.tags),
    applicable_incident_types:csv(form.applicable_incident_types),
    applicable_severities:csv(form.applicable_severities),
    trigger_conditions:lines(form.trigger_conditions), required_roles:csv(form.required_roles), prerequisites:lines(form.prerequisites),
    steps:parseSteps(form.steps), evidence_requirements:lines(form.evidence_requirements), failure_conditions:lines(form.failure_conditions),
    escalation_conditions:lines(form.escalation_conditions), rollback_instructions:lines(form.rollback_instructions), application_risks:lines(form.application_risks),
    associated_scripts:csv(form.associated_scripts), institutional_enablers:csv(form.institutional_enablers), routine_signature:csv(form.routine_signature)
  })

  const loadEditor = routine => {
    setEditingId(routine.id); setSelectedPir('')
    setForm({
      title:routine.title || '', content:routine.content || '', tags:(routine.tags || []).join(', '), category:routine.category || 'response-checklist',
      primary_goal:routine.primary_goal || '', payoff_weight:routine.payoff_weight ?? 0.6, nist_function:routine.nist_function || 'RS',
      socio_technical_focus:routine.socio_technical_focus || 'both', applicable_incident_types:(routine.applicable_incident_types || []).join(', '),
      applicable_severities:(routine.applicable_severities || []).join(', '), trigger_conditions:(routine.trigger_conditions || []).join('\n'),
      required_roles:(routine.required_roles || []).join(', '), prerequisites:(routine.prerequisites || []).join('\n'),
      steps:(routine.steps || []).map(s => [s.action,s.evidence_required ? s.evidence_hint || 'Evidence required' : '',s.success_criteria || '',s.owner_role || 'analyst'].join(' | ')).join('\n'),
      evidence_requirements:(routine.evidence_requirements || []).join('\n'), expected_outcome:routine.expected_outcome || '',
      failure_conditions:(routine.failure_conditions || []).join('\n'), escalation_conditions:(routine.escalation_conditions || []).join('\n'),
      rollback_instructions:(routine.rollback_instructions || []).join('\n'), application_risks:(routine.application_risks || []).join('\n'),
      estimated_time_minutes:routine.estimated_time_minutes ?? '', estimated_cost:routine.estimated_cost || '', review_interval_days:routine.review_interval_days || 180,
      associated_scripts:(routine.associated_scripts || []).join(', '), institutional_enablers:(routine.institutional_enablers || []).join(', '),
      routine_signature:(routine.routine_signature || []).join(', '), change_note:''
    })
    setTab('editor'); setMessage(''); setError('')
  }

  const resetEditor = () => { setEditingId(null); setSelectedPir(''); setForm(emptyForm()); setMessage(''); setError('') }

  const saveRoutine = async () => {
    if (!form.title || !form.content) return setError('Routine title and content are required.')
    setBusy(true); setError(''); setMessage('')
    try {
      if (editingId) {
        await api.put(`/knowledge/${editingId}/routine`, payload())
        setMessage('Routine definition updated.')
      } else if (selectedPir) {
        await api.post(`/knowledge/from-pir/${selectedPir}`, payload())
        setMessage('Draft routine created from PIR.')
      } else {
        await api.post('/knowledge/defensive-routines', payload())
        setMessage('Draft routine created.')
      }
      await fetchData()
    } catch(e) { setError(e.response?.data?.error || 'Failed to save routine') }
    finally { setBusy(false) }
  }

  const changeLifecycle = async (id,status) => {
    setBusy(true); setError(''); setMessage('')
    try {
      await api.post(`/knowledge/${id}/routine-lifecycle`, { status, comment:`Changed to ${status} from Defensive Routines Library` })
      setMessage(`Routine moved to ${status}.`); await fetchData()
    } catch(e) { setError(e.response?.data?.error || 'Failed to change lifecycle') }
    finally { setBusy(false) }
  }

  const newVersion = async id => {
    setBusy(true); setError('')
    try {
      const res = await api.post(`/knowledge/${id}/routine-version`, {})
      setMessage(`New draft version ${res.data.defensive_routine?.routine_version || ''} created.`); await fetchData()
    } catch(e) { setError(e.response?.data?.error || 'Failed to create routine version') }
    finally { setBusy(false) }
  }

  if (loading) return <Loading />

  return <div style={{padding:20}}>
    <div style={{marginBottom:26}}><h1 style={{fontFamily:'var(--font-mono)',fontSize:28,marginBottom:8}}>Defensive Routines Library</h1><p className="subtitle">Controlled response procedures with triggers, evidence, lifecycle governance and measured effectiveness.</p></div>
    {error && <div className="alert alert-error" style={{marginBottom:14}}>{error}</div>}
    {message && <div className="alert alert-success" style={{marginBottom:14}}>✓ {message}</div>}

    {metrics && <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(155px,1fr))',gap:12,marginBottom:24}}>
      <Metric label="Total routines" value={metrics.total_routines}/><Metric label="Active" value={metrics.active_routines}/><Metric label="Drafts" value={metrics.draft_routines}/><Metric label="Review due" value={metrics.review_due}/>
      <Metric label="Success rate" value={toPct(metrics.avg_success_rate)}/><Metric label="Acceptance" value={toPct(metrics.acceptance_rate)}/><Metric label="Completion" value={toPct(metrics.completion_rate)}/>
    </div>}

    <div style={{display:'flex',gap:14,borderBottom:'1px solid var(--border)',marginBottom:20,flexWrap:'wrap'}}>
      {[['routines','📚 Routine Library'],['coverage','🎯 Coverage'],...(isAnalyst?[['editor','✍️ Routine Editor']]:[])].map(([id,label])=><button key={id} onClick={()=>setTab(id)} style={{padding:'11px 14px',background:'none',border:'none',borderBottom:tab===id?'2px solid var(--kalro-green)':'2px solid transparent',color:tab===id?'var(--kalro-green)':'var(--text3)',fontFamily:'var(--font-mono)',cursor:'pointer'}}>{label}</button>)}
    </div>

    {tab==='routines' && <div style={{display:'grid',gap:12}}>{(routines || []).map(r => {
      const open=expanded===r.id; const reviewDue=r.next_review_at && new Date(r.next_review_at)<new Date()
      return <div key={r.id} style={{background:'var(--bg2)',border:`1px solid ${open?'var(--kalro-green)':'var(--border)'}`,borderRadius:'var(--radius-lg)',padding:18}}>
        <div onClick={()=>setExpanded(open?null:r.id)} style={{cursor:'pointer',display:'flex',justifyContent:'space-between',gap:18}}>
          <div><h4 style={{margin:'0 0 7px',fontSize:16}}>{r.title}</h4><div style={{display:'flex',gap:6,flexWrap:'wrap'}}><Badge label={`v${r.routine_version}`} bg="var(--bg3)"/><Badge label={r.lifecycle_status} bg={r.lifecycle_status==='active'?'var(--kalro-green)':'var(--accent)'}/><Badge label={r.category} bg="var(--bg3)"/>{reviewDue&&<Badge label="review due" bg="var(--kalro-red)"/>}</div></div>
          <div style={{textAlign:'right'}}><div style={{fontSize:9,color:'var(--text3)',fontFamily:'var(--font-mono)'}}>SUCCESS</div><div style={{fontSize:23,fontWeight:700,color:'var(--kalro-green)'}}>{(r.success_rate*100).toFixed(0)}%</div></div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))',gap:8,marginTop:12}}>
          <Small label="Recommended" value={r.metrics?.recommended_count || 0}/><Small label="Accepted" value={r.metrics?.accepted_count || 0}/><Small label="Completed" value={r.metrics?.completed_count || 0}/><Small label="Acceptance" value={r.metrics?.acceptance_rate==null?'—':`${(r.metrics.acceptance_rate*100).toFixed(0)}%`}/><Small label="Completion" value={r.metrics?.completion_rate==null?'—':`${(r.metrics.completion_rate*100).toFixed(0)}%`}/>
        </div>
        {open && <div style={{marginTop:15,paddingTop:15,borderTop:'1px solid var(--border)'}}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:10}}>
            <List title="Trigger conditions" items={r.trigger_conditions}/><List title="Incident types" items={r.applicable_incident_types}/><List title="Required roles" items={r.required_roles}/><List title="Prerequisites" items={r.prerequisites}/><List title="Evidence requirements" items={r.evidence_requirements}/><List title="Escalation conditions" items={r.escalation_conditions}/><List title="Failure conditions" items={r.failure_conditions}/><List title="Application risks" items={r.application_risks}/><List title="Rollback" items={r.rollback_instructions}/>
          </div>
          {r.expected_outcome && <div style={{marginTop:10,padding:10,background:'var(--bg3)',borderRadius:6,fontSize:12}}><strong>Expected outcome:</strong> {r.expected_outcome}</div>}
          <div style={{marginTop:12}}><div style={{fontSize:10,color:'var(--text3)',fontFamily:'var(--font-mono)',marginBottom:7}}>PROCEDURE</div>{(r.steps||[]).map(s=><div key={s.id} style={{fontSize:12,color:'var(--text2)',marginBottom:5}}><strong>{s.order}.</strong> {s.action} {s.evidence_required&&<span style={{color:'var(--yellow)'}}>· evidence required</span>} {s.success_criteria&&<span style={{color:'var(--text3)'}}>· {s.success_criteria}</span>}</div>)}</div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:14}}>{isAnalyst&&<button className="btn btn-ghost btn-sm" onClick={()=>loadEditor(r)}>Edit definition</button>}{isAdmin&&<><button className="btn btn-ghost btn-sm" onClick={()=>newVersion(r.id)}>Create new version</button>{(lifecycleNext[r.lifecycle_status]||[]).map(x=><button key={x} className="btn btn-ghost btn-sm" disabled={busy} onClick={()=>changeLifecycle(r.id,x)}>→ {x}</button>)}</>}</div>
          <div style={{fontSize:11,color:'var(--text3)',marginTop:10}}>Review interval: {r.review_interval_days} days · Next review: {r.next_review_at?new Date(r.next_review_at).toLocaleDateString():'Not scheduled'} · Est. time: {r.estimated_time_minutes?`${r.estimated_time_minutes} min`:'Not set'}</div>
        </div>}
      </div>
    })}</div>}

    {tab==='coverage' && coverage && <div>
      <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',padding:18,marginBottom:15}}><h3 style={{fontSize:15,marginTop:0}}>Coverage by Incident Type</h3>{Object.entries(coverage.coverage_by_type||{}).map(([type,d])=><div key={type} style={{display:'flex',justifyContent:'space-between',padding:'9px 0',borderBottom:'1px solid var(--border)',fontSize:12}}><span>{type}</span><span>{d.available_routines} routine(s) · {d.covered_by_routines}</span></div>)}</div>
      {coverage.gaps?.length>0&&<div className="alert alert-error"><strong>Coverage gaps:</strong><ul>{coverage.gaps.map(x=><li key={x}>{x}</li>)}</ul></div>}
    </div>}

    {tab==='editor' && isAnalyst && <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) 300px',gap:18}}>
      <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',padding:20}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:15}}><div><h3 style={{fontSize:16,margin:0}}>{editingId?'Edit Routine':'Create Defensive Routine'}</h3><div style={{fontSize:11,color:'var(--text3)',marginTop:4}}>New routines begin as Draft and should be reviewed/approved before activation.</div></div><button className="btn btn-ghost btn-sm" onClick={resetEditor}>New / Reset</button></div>
        {!editingId&&isAdmin&&<Field label="Optional PIR source"><select value={selectedPir} onChange={e=>{setSelectedPir(e.target.value);const p=pirs.find(x=>x.id===e.target.value);if(p)setForm(f=>({...f,title:p.root_cause?`Routine: ${p.root_cause.slice(0,55)}`:f.title,content:p.what_worked||p.root_cause||f.content}))}} style={inputStyle}><option value="">Create from scratch</option>{pirs.map(p=><option key={p.id} value={p.id}>{p.incident_title || p.id}</option>)}</select></Field>}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}><Field label="Routine title"><input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} style={inputStyle}/></Field><Field label="Primary goal"><input value={form.primary_goal} onChange={e=>setForm({...form,primary_goal:e.target.value})} style={inputStyle}/></Field></div>
        <Field label="Routine content / rationale"><textarea rows={5} value={form.content} onChange={e=>setForm({...form,content:e.target.value})} style={inputStyle}/></Field>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}><Field label="Category"><select value={form.category} onChange={e=>setForm({...form,category:e.target.value})} style={inputStyle}><option>response-checklist</option><option>playbook</option><option>runbook</option><option>procedure</option></select></Field><Field label="Response function"><select value={form.nist_function} onChange={e=>setForm({...form,nist_function:e.target.value})} style={inputStyle}><option value="ID">Identify</option><option value="PR">Protect</option><option value="DE">Detect</option><option value="RS">Respond</option><option value="RC">Recover</option></select></Field><Field label="Socio-technical"><select value={form.socio_technical_focus} onChange={e=>setForm({...form,socio_technical_focus:e.target.value})} style={inputStyle}><option value="both">Both</option><option value="technical">Technical</option><option value="social">Social</option></select></Field></div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}><Field label="Incident types (CSV)"><input value={form.applicable_incident_types} onChange={e=>setForm({...form,applicable_incident_types:e.target.value})} style={inputStyle}/></Field><Field label="Severities (CSV)"><input value={form.applicable_severities} onChange={e=>setForm({...form,applicable_severities:e.target.value})} style={inputStyle}/></Field></div>
        <Field label="Trigger conditions — one per line"><textarea rows={3} value={form.trigger_conditions} onChange={e=>setForm({...form,trigger_conditions:e.target.value})} style={inputStyle}/></Field>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}><Field label="Required roles (CSV)"><input value={form.required_roles} onChange={e=>setForm({...form,required_roles:e.target.value})} style={inputStyle}/></Field><Field label="Tags (CSV)"><input value={form.tags} onChange={e=>setForm({...form,tags:e.target.value})} style={inputStyle}/></Field></div>
        <Field label="Steps — Action | evidence hint (blank = not required) | success criteria | owner role"><textarea rows={7} value={form.steps} onChange={e=>setForm({...form,steps:e.target.value})} style={{...inputStyle,fontFamily:'monospace'}} placeholder={'Revoke active sessions | Screenshot/session log | No unauthorized sessions remain | analyst\nReset password | Reset confirmation | New credential active | analyst'}/></Field>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}><Field label="Prerequisites — one per line"><textarea rows={3} value={form.prerequisites} onChange={e=>setForm({...form,prerequisites:e.target.value})} style={inputStyle}/></Field><Field label="Evidence requirements — one per line"><textarea rows={3} value={form.evidence_requirements} onChange={e=>setForm({...form,evidence_requirements:e.target.value})} style={inputStyle}/></Field></div>
        <Field label="Expected outcome"><textarea rows={2} value={form.expected_outcome} onChange={e=>setForm({...form,expected_outcome:e.target.value})} style={inputStyle}/></Field>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}><Field label="Failure conditions"><textarea rows={3} value={form.failure_conditions} onChange={e=>setForm({...form,failure_conditions:e.target.value})} style={inputStyle}/></Field><Field label="Escalation conditions"><textarea rows={3} value={form.escalation_conditions} onChange={e=>setForm({...form,escalation_conditions:e.target.value})} style={inputStyle}/></Field><Field label="Rollback instructions"><textarea rows={3} value={form.rollback_instructions} onChange={e=>setForm({...form,rollback_instructions:e.target.value})} style={inputStyle}/></Field><Field label="Application risks"><textarea rows={3} value={form.application_risks} onChange={e=>setForm({...form,application_risks:e.target.value})} style={inputStyle}/></Field></div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}><Field label="Estimated time (min)"><input type="number" value={form.estimated_time_minutes} onChange={e=>setForm({...form,estimated_time_minutes:e.target.value})} style={inputStyle}/></Field><Field label="Review interval (days)"><input type="number" value={form.review_interval_days} onChange={e=>setForm({...form,review_interval_days:e.target.value})} style={inputStyle}/></Field><Field label="Payoff weight (0-1)"><input type="number" min="0" max="1" step="0.05" value={form.payoff_weight} onChange={e=>setForm({...form,payoff_weight:e.target.value})} style={inputStyle}/></Field></div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}><Field label="Institutional enablers (CSV)"><input value={form.institutional_enablers} onChange={e=>setForm({...form,institutional_enablers:e.target.value})} style={inputStyle}/></Field><Field label="Associated scripts (CSV)"><input value={form.associated_scripts} onChange={e=>setForm({...form,associated_scripts:e.target.value})} style={inputStyle}/></Field></div>
        {editingId&&<Field label="Change note"><input value={form.change_note} onChange={e=>setForm({...form,change_note:e.target.value})} style={inputStyle} placeholder="Why this definition changed"/></Field>}
        <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:12}}><button className="btn btn-ghost" onClick={resetEditor}>Reset</button><button className="btn btn-primary" disabled={busy} onClick={saveRoutine}>{busy?'Saving...':editingId?'Save changes':'Create draft routine'}</button></div>
      </div>
      <div style={{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',padding:18,height:'fit-content'}}><h4 style={{fontSize:14,marginTop:0}}>Routine governance</h4><div style={{fontSize:12,color:'var(--text2)',lineHeight:1.7}}>Use the lifecycle <strong>Draft → Reviewed → Approved → Active</strong>. Only Active routines are automatically recommended. Successful execution requires all required procedure steps. Evidence-required steps cannot be completed without evidence. Version changes preserve the old routine as Superseded.</div></div>
    </div>}
  </div>
}

const inputStyle={width:'100%',padding:'9px 10px',border:'1px solid var(--border)',borderRadius:7,background:'var(--bg3)',color:'var(--text)',boxSizing:'border-box'}
function Field({label,children}){return <div style={{marginBottom:11}}><label style={{display:'block',fontSize:10,color:'var(--text3)',fontFamily:'var(--font-mono)',marginBottom:5}}>{label}</label>{children}</div>}
function Metric({label,value}){return <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',padding:15}}><div style={{fontSize:9,color:'var(--text3)',fontFamily:'var(--font-mono)',textTransform:'uppercase'}}>{label}</div><div style={{fontSize:25,fontWeight:700,color:'var(--kalro-green)',marginTop:5}}>{value}</div></div>}
function Small({label,value}){return <div style={{background:'var(--bg3)',padding:8,borderRadius:6}}><div style={{fontSize:9,color:'var(--text3)',fontFamily:'var(--font-mono)'}}>{label}</div><div style={{fontSize:12,fontWeight:600,marginTop:3}}>{value}</div></div>}
function List({title,items=[]}){return <div style={{background:'var(--bg3)',padding:10,borderRadius:7}}><div style={{fontSize:9,color:'var(--text3)',fontFamily:'var(--font-mono)',marginBottom:6}}>{title.toUpperCase()}</div>{items.length?<ul style={{margin:0,paddingLeft:16,fontSize:11,color:'var(--text2)',lineHeight:1.55}}>{items.map((x,i)=><li key={`${x}-${i}`}>{x}</li>)}</ul>:<div style={{fontSize:11,color:'var(--text3)'}}>Not defined</div>}</div>}
