import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api/axios'
import { Loading, Badge } from '../components/Shared'
import { useAuth } from '../context/AuthContext'

const FALLBACK_CONTAINMENT = [
  'Revoke active sessions / tokens',
  'Temporarily disable or lock the compromised account',
  'Remove unauthorized forwarding rules, delegates, or persistence',
  'Block malicious sender, domain, URL, IP, or related indicators',
  'Preserve authentication and mailbox audit logs',
  'Search for other recipients and additional affected users',
  'Review privilege, MFA, recovery-information, and password-reset changes',
  'Assess potential access to sensitive data or connected services'
]
const FALLBACK_RECOVERY = [
  'Reset the password using a verified administrator workflow',
  'Verify or re-register MFA and confirm recovery information',
  'Confirm sessions, forwarding rules, delegates, and persistence are removed',
  'Review sign-in, mailbox, and access logs for suspicious activity',
  'Restore account access only after validation checks pass',
  'Notify the affected user of recovery actions and precautions',
  'Monitor the account for recurring suspicious activity',
  'Confirm no other users remain affected by the same phishing campaign'
]
const ACTION_STATUSES = [
  ['not_started','Not started'],['in_progress','In progress'],['completed','Completed'],['not_applicable','Not applicable']
]
const fmt = mins => mins === null || mins === undefined ? 'Pending' : mins < 1 ? `${Math.round(mins*60)}s` : `${Number(mins).toFixed(2)}m`
const pct = value => value === null || value === undefined ? 'Pending' : `${Number(value).toFixed(1)}%`
const array = v => Array.isArray(v) ? v : []
const human = v => String(v||'').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())

function normalizeRecords(actions=[], records=[]) {
  const byAction = new Map(array(records).map(r=>[r.action,r]))
  return array(actions).map(action=>({ action, status:byAction.get(action)?.status||'not_started', evidence:byAction.get(action)?.evidence||'' }))
}

function MetricCard({ label, value, sub, diagnostic }) {
  const ready = diagnostic?.status === 'ready'
  return <div className="stat-card teal" style={{minHeight:112}}>
    <div className="stat-label">{label}</div>
    <div className="stat-value" style={{fontSize:24}}>{value}</div>
    <div className="stat-sub">{sub}</div>
    {diagnostic&&<div style={{fontSize:10,marginTop:7,color:ready?'var(--kalro-green-light)':'var(--text3)',lineHeight:1.35}}>{diagnostic.message}</div>}
  </div>
}

function WorkflowSection({ title, complete=false, status, children, disabled=false, initiallyOpen=true }) {
  const [open,setOpen]=useState(initiallyOpen && !complete)
  useEffect(()=>{ if(complete) setOpen(false) },[complete])
  return <div className="card" style={{marginBottom:14,opacity:disabled?0.58:1,borderLeft:`3px solid ${complete?'var(--kalro-green)':'var(--accent)'}`}}>
    <button type="button" onClick={()=>!disabled&&setOpen(!open)} style={{width:'100%',background:'transparent',textAlign:'left',padding:0,color:'inherit',cursor:disabled?'default':'pointer'}}>
      <div className="flex-between" style={{gap:12,alignItems:'center'}}>
        <div>
          <h2 style={{margin:0,fontSize:16}}>{complete?'✓ ':''}{title}</h2>
          {status&&<div style={{fontSize:11,color:'var(--text3)',marginTop:4}}>{status}</div>}
        </div>
        {!disabled&&<span style={{fontSize:18,color:'var(--text3)'}}>{open?'▾':'▸'}</span>}
      </div>
    </button>
    {open&&!disabled&&<div style={{marginTop:14,paddingTop:14,borderTop:'1px solid var(--border)'}}>{children}</div>}
  </div>
}

function AlertPanel({ alert, incident, acknowledged, onAcknowledge, disabled }) {
  if(!alert) return <div className="alert alert-info">Review the incident evidence and acknowledge the alert when you understand what was detected.</div>
  const mail=alert.phishing_email
  return <>
    <div style={{padding:'14px 16px',border:'1px solid var(--border)',borderRadius:10,background:'var(--bg3)',marginBottom:12}}>
      <div className="flex-between" style={{gap:10,alignItems:'flex-start'}}>
        <div><div className="text-mono" style={{fontSize:11,color:'var(--accent)'}}>{alert.alert_id}</div><h3 style={{margin:'5px 0'}}>{alert.title}</h3><div style={{fontSize:12,color:'var(--text3)'}}>{alert.source}</div></div>
        <span className="tag">{incident?.severity||'high'} priority</span>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:8,marginTop:12,fontSize:12}}>
        <div><b>Account:</b> {alert.account||incident?.entities?.affected_user||'—'}</div>
        <div><b>Source IP:</b> {alert.source_ip||incident?.entities?.source_ip||'—'}</div>
        <div><b>Device:</b> {alert.device||'—'}</div>
        <div><b>Failed attempts:</b> {alert.failed_attempts??'—'}</div>
      </div>
      {array(alert.observations).length>0&&<ul style={{margin:'12px 0 0 18px',fontSize:12,color:'var(--text2)'}}>{alert.observations.map(x=><li key={x} style={{marginBottom:5}}>{x}</li>)}</ul>}
    </div>
    {mail&&<div style={{padding:'12px 14px',border:'1px solid var(--border)',borderRadius:10,marginBottom:12}}>
      <div style={{fontWeight:700,marginBottom:8}}>Reported phishing email</div>
      <div style={{fontSize:12,lineHeight:1.7}}><b>From:</b> {mail.from_display} &lt;{mail.from_address}&gt;<br/><b>To:</b> {mail.to}<br/><b>Subject:</b> {mail.subject}<br/><b>Link:</b> <span className="text-mono">{mail.suspicious_url}</span></div>
      <div style={{fontSize:12,color:'var(--text3)',marginTop:8}}>{mail.body_preview}</div>
      <div className="alert alert-warning" style={{marginTop:10,marginBottom:0}}>{mail.indicator_note}</div>
    </div>}
    <button className="btn btn-primary" disabled={acknowledged||disabled} onClick={onAcknowledge}>{acknowledged?'Alert acknowledged ✓':'Acknowledge alert'}</button>
  </>
}

function ActionStatusList({ records, onChange, disabled=false }) {
  const update=(idx,patch)=>onChange(records.map((r,i)=>i===idx?{...r,...patch}:r))
  return <div style={{display:'flex',flexDirection:'column',gap:9}}>
    {records.map((r,idx)=><div key={r.action} style={{padding:'11px 12px',border:'1px solid var(--border)',borderRadius:9,background:'var(--bg3)'}}>
      <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) 150px',gap:10,alignItems:'center'}}>
        <div style={{fontSize:12,fontWeight:600,lineHeight:1.4}}>{idx+1}. {r.action}</div>
        <select value={r.status} disabled={disabled} onChange={e=>update(idx,{status:e.target.value})}>{ACTION_STATUSES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
      </div>
      {r.status==='completed'&&<input style={{marginTop:9}} disabled={disabled} value={r.evidence||''} onChange={e=>update(idx,{evidence:e.target.value})} placeholder="Evidence for this action (recommended)"/>}
    </div>)}
  </div>
}

function Readiness({ incidentClosed, lessonCaptured, recoverySuccessful, containmentSuccessful }) {
  const rows=[['Containment confirmed',containmentSuccessful],['Recovery validated',recoverySuccessful],['Incident closed',incidentClosed],['Lesson captured',lessonCaptured]]
  return <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:8}}>{rows.map(([l,ok])=><div key={l} style={{padding:'9px 10px',border:'1px solid var(--border)',borderRadius:8,fontSize:11,color:ok?'var(--kalro-green-light)':'var(--text3)'}}>{ok?'✓':'○'} {l}</div>)}</div>
}


function TeamSelector({ users=[], selectedIds=[], onChange, station }) {
  const responders = users.filter(u => ['analyst','super_admin'].includes(u.role));
  const toggle = id => onChange(selectedIds.includes(id) ? selectedIds.filter(x=>x!==id) : [...selectedIds,id]);
  return <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:7}}>
    {responders.map(u=><label key={u.id} style={{display:'flex',gap:8,alignItems:'flex-start',padding:'9px 10px',border:'1px solid var(--border)',borderRadius:8,background:selectedIds.includes(u.id)?'var(--bg3)':'transparent',fontSize:11,cursor:'pointer'}}><input type="checkbox" style={{width:'auto',marginTop:2}} checked={selectedIds.includes(u.id)} onChange={()=>toggle(u.id)}/><span><b>{u.name}</b><br/><span style={{color:'var(--text3)'}}>{u.role.replace('_',' ')} · {u.station_id||'No station'}{station&&u.station_id===station?' · same station':''}</span></span></label>)}
  </div>
}

function MeetControls({ value, onChange, agenda, onAgendaChange }) {
  const valid = /^https:\/\/meet\.google\.com\//i.test(value||'');
  const createMeet = () => window.open('https://meet.google.com/new','_blank','noopener,noreferrer');
  return <div style={{padding:'11px 12px',border:'1px solid var(--border)',borderRadius:9,background:'var(--surface)',marginTop:10}}>
    <div className="flex-between" style={{gap:10,alignItems:'center',marginBottom:8}}><div><b style={{fontSize:12}}>Google Meet collaboration room</b><div style={{fontSize:10,color:'var(--text3)',marginTop:3}}>Open a real Meet room, then paste its generated link below so the response team can join from this incident.</div></div><button type="button" className="btn btn-ghost btn-sm" onClick={createMeet}>Open Google Meet</button></div>
    <div className="form-row"><div className="form-group"><label className="form-label">Meet URL</label><input value={value||''} onChange={e=>onChange(e.target.value)} placeholder="https://meet.google.com/abc-defg-hij"/></div><div className="form-group"><label className="form-label">Meeting agenda</label><input value={agenda||''} onChange={e=>onAgendaChange(e.target.value)} placeholder="Containment decisions, evidence review, next actions"/></div></div>
    {valid&&<a className="btn btn-primary btn-sm" href={value} target="_blank" rel="noreferrer">Join Google Meet</a>}
  </div>
}

export default function OperationalTesting(){
  const { user, isAnalyst } = useAuth()
  const navigate = useNavigate()
  const [sp,setSp]=useSearchParams()
  const [tests,setTests]=useState([]), [selected,setSelected]=useState(null), [loading,setLoading]=useState(true)
  const [scenarios,setScenarios]=useState([]), [analytics,setAnalytics]=useState(null), [comparison,setComparison]=useState(null)
  const [stations,setStations]=useState([]), [directoryUsers,setDirectoryUsers]=useState([])
  const [form,setForm]=useState({scenario_id:'',scenario_name:'',scenario_type:'tabletop',test_mode:'kd_cirf',comparison_group:'',participant_label:user?.name||'',participant_role:user?.role||'analyst',station_id:user?.station_id||'',notes:''})
  const [error,setError]=useState(''), [success,setSuccess]=useState(''), [saving,setSaving]=useState(false)
  const [observer,setObserver]=useState({decision_accuracy:'',classification_accuracy:'',escalation_accuracy:'',collaboration_score:'',role_adherence:'',facilitator_interventions:0,critical_omissions:0})
  const [classification,setClassification]=useState({category:'',severity:'high',confidence:'medium',affected_asset:'',impact:'',suspected_cause:'',notes:''})
  const [containment,setContainment]=useState({planned_actions:[],completed_actions:[],action_records:[],verification_checks:[],notes:'',evidence:'',outcome:'successful'})
  const [recovery,setRecovery]=useState({actions:[],action_records:[],notes:'',evidence:'',outcome:'successful'})
  const [lesson,setLesson]=useState({title:'',what_happened:'',what_worked:'',what_failed:'',next_time:'',reusable_procedure:'',routine_used:'',confidence_level:'medium',visibility:'local',tags:'',mode:'new',target_knowledge_id:'',knowledge_reviews:[]})
  const [escalation,setEscalation]=useState({reason:'Knowledge-guided response was incomplete or unsuccessful',escalated_to:'ICT Security Lead',priority:'high',assistance_required:'',shared_summary:'',team_member_ids:[],meeting_url:'',meeting_agenda:'Escalated incident response and containment decisions'})
  const [collaboration,setCollaboration]=useState({collaborate_with:'Email / Identity Administrator',reason:'Additional specialist assistance is required to complete containment',assistance_required:'',shared_summary:'',team_member_ids:[],meeting_url:'',meeting_agenda:'Incident response collaboration and next actions'})
  const [closeResolution,setCloseResolution]=useState('Incident contained, account safely recovered, and validation completed.')

  const hydrate=data=>{
    setSelected(data)
    setObserver(o=>({...o,...(data.observer_scores||{})}))
    setClassification({category:data.classification?.category||data.linked_incident?.type||'',severity:data.classification?.severity||data.linked_incident?.severity||'high',confidence:data.classification?.confidence||'medium',affected_asset:data.classification?.affected_asset||data.linked_incident?.entities?.affected_user||'',impact:data.classification?.impact||'',suspected_cause:data.classification?.suspected_cause||'',notes:data.classification?.notes||''})
    const planned=array(data.containment?.planned_actions)
    setContainment({planned_actions:planned,completed_actions:array(data.containment?.completed_actions),action_records:normalizeRecords(planned,data.containment?.action_records),verification_checks:array(data.containment?.verification_checks),notes:data.containment?.notes||'',evidence:data.containment?.evidence||'',outcome:data.containment?.outcome||'successful'})
    const recoveryActions=array(data.recovery?.actions)
    setRecovery({actions:recoveryActions,action_records:normalizeRecords(recoveryActions,data.recovery?.action_records),notes:data.recovery?.notes||'',evidence:data.recovery?.evidence||'',outcome:data.recovery?.outcome||'successful'})
    setEscalation(e=>({...e,...(data.escalation||{}),team_member_ids:array(data.escalation?.team_member_ids)}))
    const latestCollaboration=array(data.collaborations).slice(-1)[0]||data.collaboration||{}
    setCollaboration(c=>({...c,...latestCollaboration,team_member_ids:array(latestCollaboration.team_member_ids)}))
    const ids=array(data.selected_knowledge_ids); const selectedLabel=array(data.selected_knowledge_items).map(x=>`${x.id} — ${x.title}`).join('; ')
    if(!(data.captured_knowledge_ids||[]).length){const base=data.linked_incident?.title||data.scenario_name||'Operational test';setLesson(l=>({...l,title:`Lessons learned: ${base}`,routine_used:selectedLabel||l.routine_used,tags:data.linked_incident?.type?String(data.linked_incident.type).replace(/_/g,'-'):l.tags,target_knowledge_id:l.target_knowledge_id||ids[0]||'',knowledge_reviews:ids.map(id=>({knowledge_id:id,assessment:'effective',notes:''}))}))}
  }
  const loadMeta=async(group=null)=>{const cu=group?`/operational-tests/comparison?group=${encodeURIComponent(group)}`:'/operational-tests/comparison';const [s,a,c,st,u]=await Promise.all([api.get('/operational-tests/scenarios/library').catch(()=>({data:[]})),api.get('/operational-tests/analytics/trends').catch(()=>({data:null})),api.get(cu).catch(()=>({data:null})),api.get('/stations').catch(()=>({data:[]})),api.get('/auth/users').catch(()=>({data:[]}))]);setScenarios(s.data||[]);setAnalytics(a.data);setComparison(c.data);setStations(st.data||[]);setDirectoryUsers(u.data||[]);setForm(f=>({...f,station_id:f.station_id||user?.station_id||st.data?.[0]?.name||''}))}
  const load=async(selectId)=>{setLoading(true);try{const r=await api.get('/operational-tests');setTests(r.data);const id=selectId||sp.get('test')||selected?.id||r.data[0]?.id;let group=null;if(id){const d=await api.get('/operational-tests/'+id);hydrate(d.data);group=d.data.comparison_group||d.data.scenario_id||d.data.scenario_name}else setSelected(null);await loadMeta(group)}catch(e){setError(e.response?.data?.error||'Failed to load operational tests')}finally{setLoading(false)}}
  useEffect(()=>{load(sp.get('test'))},[])
  const selectTest=id=>{setSp({test:id});load(id)}

  const chooseScenario=id=>{const sc=scenarios.find(s=>s.id===id);if(!sc)return setForm({...form,scenario_id:'',scenario_name:'',comparison_group:''});setForm({...form,scenario_id:sc.id,scenario_name:sc.title,scenario_type:sc.scenario_type||'tabletop',comparison_group:sc.id,notes:sc.description||''})}
  const create=async e=>{e.preventDefault();setSaving(true);setError('');try{const r=await api.post('/operational-tests',form);setSp({test:r.data.id});await load(r.data.id);setForm(f=>({...f,scenario_id:'',scenario_name:'',comparison_group:'',notes:''}));setSuccess('Operational test created.')}catch(e){setError(e.response?.data?.error||'Failed to create operational test')}finally{setSaving(false)}}
  const action=async(path,body={})=>{setError('');setSuccess('');try{await api.post(`/operational-tests/${selected.id}/${path}`,body);await load(selected.id);return true}catch(e){setError(e.response?.data?.error||'Action failed');return false}}
  const addEvent=(type,details={})=>action('events',{event_type:type,incident_id:selected?.incident_id||null,details})
  const saveObserver=async()=>{setSaving(true);try{await api.put(`/operational-tests/${selected.id}/observer-scores`,observer);await load(selected.id);setSuccess('Assessment saved.')}catch(e){setError(e.response?.data?.error||'Failed to save assessment')}finally{setSaving(false)}}
  const downloadBlob=async(path,name,type)=>{const r=await api.get(path,{responseType:'blob'});const url=URL.createObjectURL(new Blob([r.data],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url)}
  const exportCsv=()=>downloadBlob(`/operational-tests/${selected.id}/export.csv`,`${selected.id}-operational-test.csv`,'text/csv')
  const downloadPdf=()=>downloadBlob(`/operational-tests/${selected.id}/report.pdf`,`${selected.id}-operational-test-report.pdf`,'application/pdf')
  const injectIncident=async()=>{if(await addEvent('INCIDENT_OCCURRED',{scenario:selected.scenario_name})){const rt=`/operational-testing?test=${encodeURIComponent(selected.id)}`;navigate(`/incidents?create=1&operational_test_id=${encodeURIComponent(selected.id)}&return_to=${encodeURIComponent(rt)}`)}}
  const acknowledge=()=>addEvent('ALERT_ACKNOWLEDGED',{alert_id:selected.alert_context?.alert_id,title:selected.alert_context?.title})
  const submitClassification=async()=>{setSaving(true);try{if(await action('classification',classification))setSuccess('Classification saved.')}finally{setSaving(false)}}
  const startKnowledgeSearch=async()=>{const q=[classification.category,selected.linked_incident?.type,'credential compromise',selected.scenario_name].filter(Boolean).join(' ');if(await addEvent('KNOWLEDGE_SEARCH_STARTED',{query:q})){const rt=`/operational-testing?test=${encodeURIComponent(selected.id)}`;navigate(`/knowledge?operational_test_id=${encodeURIComponent(selected.id)}&incident_id=${encodeURIComponent(selected.incident_id)}&q=${encodeURIComponent(q)}&return_to=${encodeURIComponent(rt)}`)}}
  const addMoreKnowledge=()=>{const q=[classification.category,selected.linked_incident?.type,'credential compromise',selected.scenario_name].filter(Boolean).join(' ');const rt=`/operational-testing?test=${encodeURIComponent(selected.id)}`;navigate(`/knowledge?operational_test_id=${encodeURIComponent(selected.id)}&incident_id=${encodeURIComponent(selected.incident_id)}&q=${encodeURIComponent(q)}&return_to=${encodeURIComponent(rt)}`)}
  const confirmKnowledgeSet=async()=>{setSaving(true);try{if(await action('knowledge/confirm'))setSuccess('Knowledge set confirmed. The combined response plan is ready to apply.')}finally{setSaving(false)}}
  const removeKnowledge=async id=>{setSaving(true);try{if(await action('knowledge/remove',{knowledge_id:id}))setSuccess('Knowledge removed from the response set.')}finally{setSaving(false)}}
  const applyKnowledge=async()=>{setSaving(true);try{if(await action('knowledge/apply'))setSuccess('Selected knowledge applied. A combined containment and recovery plan has been created.')}finally{setSaving(false)}}
  const confirmContainment=async()=>{
    const records=containment.action_records
    const completed=records.filter(r=>r.status==='completed').map(r=>r.action)
    if(!completed.length)return setError('Complete at least one containment action.')
    if(!containment.evidence.trim())return setError('Record overall verification evidence.')
    setSaving(true);try{if(await action('containment/confirm',{completed_actions:completed,action_records:records,verification_checks:containment.verification_checks,notes:containment.notes,evidence:containment.evidence,outcome:containment.outcome}))setSuccess(containment.outcome==='successful'?'Containment verified successfully.':'Containment result recorded. Escalation is now available.')}finally{setSaving(false)}
  }
  const collaborate=async()=>{if(!collaboration.team_member_ids.length)return setError('Select at least one response-team member for collaboration.');setSaving(true);try{if(await action('collaborate',collaboration))setSuccess('Collaboration session recorded and selected team members notified.')}finally{setSaving(false)}}
  const escalate=async()=>{if(!escalation.team_member_ids.length)return setError('Select at least one escalation-team member.');setSaving(true);try{if(await action('escalate',escalation))setSuccess('Incident escalated and the selected response team notified.')}finally{setSaving(false)}}
  const confirmRecovery=async()=>{
    const records=recovery.action_records
    const completed=records.filter(r=>r.status==='completed').map(r=>r.action)
    if(!completed.length)return setError('Complete at least one recovery action.')
    if(!recovery.evidence.trim())return setError('Record recovery validation evidence.')
    setSaving(true);try{if(await action('recovery/confirm',{...recovery,actions:completed,action_records:records}))setSuccess(recovery.outcome==='successful'?'Recovery validated. The incident can now be closed.':'Recovery result recorded.')}finally{setSaving(false)}
  }
  const closeIncident=async()=>{setSaving(true);try{if(await action('close-incident',{resolution:closeResolution}))setSuccess('Incident closed. MTTR is now available.')}finally{setSaving(false)}}
  const captureLesson=async e=>{e.preventDefault();setSaving(true);try{const payload={...lesson,tags:lesson.tags.split(',').map(t=>t.trim()).filter(Boolean)};const r=await api.post(`/operational-tests/${selected.id}/lesson`,payload);await load(selected.id);setSuccess(`${lesson.mode==='update'?'Knowledge update proposed':'Lesson captured'} as draft ${r.data.knowledge.id}.`);setLesson(l=>({...l,title:'',what_happened:'',what_worked:'',what_failed:'',next_time:'',reusable_procedure:'',mode:'new'}))}catch(e){setError(e.response?.data?.error||'Failed to capture lesson')}finally{setSaving(false)}}
  const finalize=async()=>{setSaving(true);try{if(await action('finish'))setSuccess('Operational test finalized successfully.')}finally{setSaving(false)}}

  const k=selected?.kpis||{}
  const cards=useMemo(()=>[
    ['MTTD',fmt(k.mttd_minutes),'Occurrence → detection',k.diagnostics?.mttd],
    ['MTTA',fmt(k.mtta_minutes),'Alert → acknowledgement',k.diagnostics?.mtta],
    ['Classification',fmt(k.classification_minutes),'Detection → classification',k.diagnostics?.classification],
    ['Knowledge retrieval',fmt(k.knowledge_retrieval_minutes),'Search → selected knowledge',k.diagnostics?.knowledge_retrieval],
    ['MTTC',fmt(k.mttc_minutes),'Detection → verified containment',k.diagnostics?.mttc],
    ['MTTR',fmt(k.mttr_minutes),'Detection → incident closure',k.diagnostics?.mttr]
  ],[selected])
  const incidentInjected=Boolean(k?.milestones?.incidentOccurred), incidentLinked=Boolean(selected?.incident_id), alertAck=Boolean(k?.milestones?.ack), classified=Boolean(selected?.classification?.classified_at)
  const selectedKnowledgeItems=array(selected?.selected_knowledge_items), selectedKnowledgeIds=array(selected?.selected_knowledge_ids)
  const appliedKnowledgeIds=array(selected?.knowledge_applications).map(x=>x.knowledge_id), knowledgeFound=selectedKnowledgeIds.length>0, knowledgeConfirmed=Boolean(selected?.knowledge_selection_confirmed_at), knowledgeNotFound=selected?.knowledge_search_result?.status==='not_found', knowledgeApplied=selectedKnowledgeIds.length>0?(selectedKnowledgeIds.every(id=>appliedKnowledgeIds.includes(id))||(appliedKnowledgeIds.length===0&&Boolean(selected?.knowledge_application?.applied_at))):false
  const containmentSuccessful=selected?.containment?.outcome==='successful', containmentAttempted=['successful','partial','failed'].includes(selected?.containment?.outcome), containmentAttempts=array(selected?.containment?.attempts), hadIncompleteAttempt=containmentAttempts.some(a=>['partial','failed'].includes(a.outcome))
  const responseNeedsHelp=knowledgeNotFound||['partial','failed'].includes(selected?.containment?.outcome)||(selected?.containment?.status==='in_progress'&&hadIncompleteAttempt), escalated=Boolean(k?.milestones?.escalated)||Boolean(selected?.escalation), collaborations=array(selected?.collaborations), collaborated=collaborations.length>0
  const recoverySuccessful=selected?.recovery?.outcome==='successful', incidentClosed=selected?.linked_incident?.status==='closed'||Boolean(k?.milestones?.closed), captured=selected?.captured_knowledge||[]
  const knowledgePlan=selected?.combined_response_plan||selected?.knowledge_application||{}
  const containmentOptions=array(knowledgePlan.containment_actions).length?array(knowledgePlan.containment_actions):FALLBACK_CONTAINMENT
  const recoveryOptions=array(knowledgePlan.recovery_actions).length?array(knowledgePlan.recovery_actions):FALLBACK_RECOVERY
  const verificationOptions=array(knowledgePlan.verification_checks).length?array(knowledgePlan.verification_checks):array(knowledgePlan.success_criteria)
  const ensureContainmentRecords=()=>containment.action_records.length?containment.action_records:normalizeRecords(containmentOptions,[])
  const ensureRecoveryRecords=()=>recovery.action_records.length?recovery.action_records:normalizeRecords(recoveryOptions,[])
  const completedCount=[incidentLinked,alertAck,classified,(selected?.test_mode==='baseline'||knowledgeConfirmed||knowledgeNotFound),containmentSuccessful,recoverySuccessful,incidentClosed,captured.length>0].filter(Boolean).length
  const progress=Math.round(completedCount/8*100)
  const currentStage=!incidentLinked?'Detection':!alertAck?'Alert review':!classified?'Classification':selected?.test_mode!=='baseline'&&!knowledgeFound&&!knowledgeNotFound?'Knowledge search':selected?.test_mode!=='baseline'&&knowledgeFound&&!knowledgeConfirmed?'Knowledge review':!containmentSuccessful?(responseNeedsHelp?'Additional response':'Containment'):!recoverySuccessful?'Recovery':!incidentClosed?'Closure':captured.length===0?'Lessons learned':'Final review'
  const finalReady=incidentClosed&&captured.length>0&&recoverySuccessful&&containmentSuccessful
  const diff=comparison?.differences||{}
  const trendRows=analytics?.rows||[]

  return <div>
    <div className="page-header"><div style={{paddingBottom:20}}><h1>Operational Testing</h1><p>Guided incident response with automatic performance measurement and knowledge reuse</p></div></div>
    <div className="page-body">
      {error&&<div className="alert alert-error" style={{marginBottom:12}}>{error}</div>}
      {success&&<div className="alert alert-success" style={{marginBottom:12}}>✓ {success}</div>}

      {isAnalyst&&<WorkflowSection title="Create operational test" complete={Boolean(selected)} status={selected?`Current test: ${selected.id}`:undefined} initiallyOpen={!selected}>
        <form onSubmit={create}>
          <div className="form-row"><div className="form-group"><label className="form-label">Scenario</label><select value={form.scenario_id} onChange={e=>chooseScenario(e.target.value)}><option value="">Custom scenario</option>{scenarios.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></div><div className="form-group"><label className="form-label">Test mode</label><select value={form.test_mode} onChange={e=>setForm({...form,test_mode:e.target.value})}><option value="kd_cirf">KD-CIRF assisted</option><option value="baseline">Baseline / without knowledge support</option></select></div></div>
          <div className="form-row"><div className="form-group"><label className="form-label">Test title *</label><input required value={form.scenario_name} onChange={e=>setForm({...form,scenario_name:e.target.value})}/></div><div className="form-group"><label className="form-label">Comparison group</label><input value={form.comparison_group} onChange={e=>setForm({...form,comparison_group:e.target.value})}/></div></div>
          <div className="form-row"><div className="form-group"><label className="form-label">Participant</label><select value={form.participant_id||user?.id||''} onChange={e=>{const p=directoryUsers.find(u=>u.id===e.target.value);setForm({...form,participant_id:e.target.value,participant_label:p?.name||'',participant_role:p?.role||'analyst',station_id:p?.station_id||form.station_id})}}><option value={user?.id||''}>{user?.name||form.participant_label} — {user?.role}</option>{directoryUsers.filter(u=>u.id!==user?.id).map(u=><option key={u.id} value={u.id}>{u.name} — {u.role}</option>)}</select></div><div className="form-group"><label className="form-label">Role</label><input value={form.participant_role} readOnly/></div><div className="form-group"><label className="form-label">Station / site *</label><select required value={form.station_id} onChange={e=>setForm({...form,station_id:e.target.value})}><option value="">Select station</option>{stations.map(st=><option key={st.id||st.name} value={st.name}>{st.label||st.name}</option>)}</select></div></div>
          <button className="btn btn-primary" disabled={saving}>Create operational test</button>
        </form>
      </WorkflowSection>}

      {loading?<Loading/>:<div className="operational-layout">
        <div className="card operational-sidebar" style={{padding:0,overflow:'hidden',alignSelf:'start'}}>
          <div style={{padding:'14px 16px',borderBottom:'1px solid var(--border)',fontSize:12,fontFamily:'var(--font-mono)'}}>OPERATIONAL TESTS</div>
          {tests.map(t=><button key={t.id} onClick={()=>selectTest(t.id)} style={{display:'block',width:'100%',textAlign:'left',padding:'13px 16px',background:selected?.id===t.id?'var(--bg3)':'transparent',borderBottom:'1px solid var(--border)',color:'var(--text)'}}><b style={{fontSize:12}}>{t.scenario_name}</b><div style={{fontSize:10,color:'var(--text3)',marginTop:4}}>{t.participant_label} · {t.status}</div></button>)}
        </div>

        <div>{selected&&<>
          <div className="card" style={{marginBottom:14}}>
            <div className="flex-between" style={{gap:12,alignItems:'flex-start'}}>
              <div><div className="text-mono" style={{fontSize:11,color:'var(--accent)'}}>{selected.id}</div><h2 style={{margin:'5px 0'}}>{selected.scenario_name}</h2><div style={{fontSize:12,color:'var(--text3)'}}>{selected.participant_label} · {selected.participant_role} · {selected.station_id}</div></div>
              <Badge value={selected.status}/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:8,marginTop:14}}>
              <div style={{padding:'10px 12px',border:'1px solid var(--border)',borderRadius:8,background:'var(--bg3)'}}><div className="stat-label">Current stage</div><div style={{fontWeight:700,marginTop:4}}>{currentStage}</div></div>
              <div style={{padding:'10px 12px',border:'1px solid var(--border)',borderRadius:8,background:'var(--bg3)'}}><div className="stat-label">Response progress</div><div style={{fontWeight:700,marginTop:4}}>{progress}%</div></div>
              <div style={{padding:'10px 12px',border:'1px solid var(--border)',borderRadius:8,background:'var(--bg3)'}}><div className="stat-label">Incident status</div><div style={{fontWeight:700,marginTop:4}}>{human(selected.linked_incident?.status||'Not linked')}</div></div>
            </div>
            {selected.status==='draft'&&<button className="btn btn-primary" style={{marginTop:13}} onClick={()=>action('start')}>Start operational test</button>}
          </div>

          {selected.status!=='draft'&&<>
            {/* Performance is intentionally above the timeline and workflow evidence. */}
            <div className="stats-grid" style={{marginBottom:14}}>{cards.map(([label,val,sub,d])=><MetricCard key={label} label={label} value={val} sub={sub} diagnostic={d}/>)}</div>

            {incidentLinked&&<div className="card" style={{marginBottom:14}}>
              <div className="flex-between" style={{gap:10,alignItems:'flex-start'}}><div><div className="stat-label">Incident</div><h3 style={{margin:'5px 0'}}>{selected.linked_incident?.title}</h3><div className="text-mono" style={{fontSize:11,color:'var(--text3)'}}>{selected.linked_incident?.id}</div></div><Badge value={selected.classification?.severity||selected.linked_incident?.severity}/></div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:10,marginTop:12,fontSize:12}}><div><b>Station:</b> {selected.linked_incident?.station_id||selected.station_id}</div><div><b>Category:</b> {selected.classification?.category||'Pending classification'}</div><div><b>Affected:</b> {selected.classification?.affected_asset||selected.linked_incident?.entities?.affected_user||'—'}</div><div><b>Confidence:</b> {selected.classification?.confidence||'—'}</div><div><b>Detection source:</b> {selected.linked_incident?.detection_source||'—'}</div><div><b>Impacted service:</b> {selected.linked_incident?.impacted_service||'—'}</div><div><b>Impact:</b> {selected.classification?.impact||'—'}</div></div>
            </div>}

            <WorkflowSection title="Incident occurrence and detection" complete={incidentLinked} status={incidentLinked?`Incident ${selected.linked_incident?.id} linked · MTTD ${fmt(k.mttd_minutes)}`:incidentInjected?'Incident occurrence recorded — complete the incident form':'Record the moment the simulated incident begins'}>
              {!incidentInjected?<><p style={{fontSize:12,color:'var(--text3)'}}>Record the incident occurrence at the moment the scenario begins. The incident form opens automatically and returns here after it is saved.</p><button className="btn btn-primary" onClick={injectIncident}>Inject incident and create incident</button></>:!incidentLinked?<button className="btn btn-primary" onClick={()=>{const rt=`/operational-testing?test=${selected.id}`;navigate(`/incidents?create=1&operational_test_id=${selected.id}&return_to=${encodeURIComponent(rt)}`)}}>Continue incident creation</button>:<div className="alert alert-success">Detection recorded automatically. MTTD: <b>{fmt(k.mttd_minutes)}</b>.</div>}
            </WorkflowSection>

            {incidentLinked&&<WorkflowSection title="Review and acknowledge security alert" complete={alertAck} status={alertAck?`Alert acknowledged · MTTA ${fmt(k.mtta_minutes)}`:'Review what the system detected before acknowledging'}>
              <AlertPanel alert={selected.alert_context} incident={selected.linked_incident} acknowledged={alertAck} onAcknowledge={acknowledge} disabled={selected.status!=='active'}/>
            </WorkflowSection>}

            {incidentLinked&&<WorkflowSection title="Structured incident classification" complete={classified} status={classified?`${selected.classification.category} · ${selected.classification.severity} · ${fmt(k.classification_minutes)}`:'Classify the incident from the available evidence'}>
              <div className="form-row"><div className="form-group"><label className="form-label">Category *</label><input value={classification.category} onChange={e=>setClassification({...classification,category:e.target.value})} placeholder="Phishing / Credential Compromise"/></div><div className="form-group"><label className="form-label">Severity *</label><select value={classification.severity} onChange={e=>setClassification({...classification,severity:e.target.value})}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></div><div className="form-group"><label className="form-label">Confidence</label><select value={classification.confidence} onChange={e=>setClassification({...classification,confidence:e.target.value})}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></div></div>
              <div className="form-row"><div className="form-group"><label className="form-label">Affected asset / account</label><input value={classification.affected_asset} onChange={e=>setClassification({...classification,affected_asset:e.target.value})} placeholder="carol@kalro.org"/></div><div className="form-group"><label className="form-label">Initial impact</label><input value={classification.impact} onChange={e=>setClassification({...classification,impact:e.target.value})}/></div></div>
              <div className="form-row"><div className="form-group"><label className="form-label">Suspected cause</label><input value={classification.suspected_cause} onChange={e=>setClassification({...classification,suspected_cause:e.target.value})} placeholder="Credential harvesting via phishing"/></div><div className="form-group"><label className="form-label">Notes</label><input value={classification.notes} onChange={e=>setClassification({...classification,notes:e.target.value})}/></div></div>
              <button className="btn btn-primary" disabled={saving||selected.status!=='active'} onClick={submitClassification}>{classified?'Update classification':'Confirm classification'}</button>
            </WorkflowSection>}

            {selected.test_mode!=='baseline'&&classified&&<WorkflowSection title="Institutional knowledge for this response" complete={knowledgeConfirmed||knowledgeNotFound} status={knowledgeNotFound?'No suitable knowledge found':knowledgeConfirmed?`${selectedKnowledgeIds.length} knowledge ${selectedKnowledgeIds.length===1?'entry':'entries'} confirmed · first retrieval ${fmt(k.knowledge_retrieval_minutes)}`:knowledgeFound?`${selectedKnowledgeIds.length} selected — review or add more before confirming`:'Search for one or more related knowledge entries'}>
              {!knowledgeFound&&!knowledgeNotFound?<><p style={{fontSize:12,color:'var(--text3)'}}>Search the Knowledge Base and add every relevant entry that may help this incident. The first selected entry stops the retrieval timer, but you can continue adding related knowledge before confirming the response set.</p><button className="btn btn-primary" onClick={startKnowledgeSearch}>Search Knowledge Base</button></>:knowledgeNotFound?<div className="alert alert-warning">No suitable institutional knowledge was found. You can collaborate with another responder or escalate the incident for additional support.</div>:<>
                <div style={{display:'flex',flexDirection:'column',gap:8}}>{selectedKnowledgeItems.map(item=><div key={item.id} style={{padding:'11px 12px',border:'1px solid var(--border)',borderRadius:9,background:'var(--bg3)'}}><div className="flex-between" style={{gap:10}}><div><div className="text-mono" style={{fontSize:11,color:'var(--accent)'}}>{item.id}</div><div style={{fontWeight:700,marginTop:3}}>{item.title}</div><div style={{fontSize:11,color:'var(--text3)',marginTop:4}}>Confidence {Math.round((item.confidence_score||0)*100)}% · {item.knowledge_type}</div></div>{!knowledgeConfirmed&&<button className="btn btn-ghost btn-sm" onClick={()=>removeKnowledge(item.id)}>Remove</button>}</div></div>)}</div>
                <div style={{display:'flex',gap:8,marginTop:12,flexWrap:'wrap'}}><button className="btn btn-ghost" onClick={addMoreKnowledge}>+ Add more knowledge</button>{!knowledgeConfirmed&&<button className="btn btn-primary" disabled={saving} onClick={confirmKnowledgeSet}>Confirm selected knowledge ({selectedKnowledgeIds.length})</button>}</div>
                {knowledgeConfirmed&&<div className="alert alert-success" style={{marginTop:12,marginBottom:0}}>Knowledge set confirmed. The system will combine the selected procedures into one response plan. You can still add more knowledge later if containment is incomplete.</div>}
              </>}
            </WorkflowSection>}

            {selected.test_mode!=='baseline'&&knowledgeConfirmed&&(!hadIncompleteAttempt||!knowledgeApplied)&&<WorkflowSection title="Apply knowledge and verify containment" complete={containmentSuccessful} status={containmentSuccessful?`Containment verified · MTTC ${fmt(k.mttc_minutes)}`:containmentAttempted?`Containment ${selected.containment.outcome} — additional response is available`:knowledgeApplied?'Knowledge-guided response in progress':'Review the combined response plan and apply it'}>
              {!knowledgeApplied?<>
                <div className="alert alert-info">The combined response plan uses <b>{selectedKnowledgeIds.length}</b> selected knowledge {selectedKnowledgeIds.length===1?'entry':'entries'}: {selectedKnowledgeIds.join(', ')}.</div>
                <div style={{padding:'12px 14px',border:'1px solid var(--border)',borderRadius:9,background:'var(--bg3)',marginBottom:12}}><div style={{fontWeight:700,marginBottom:8}}>Combined containment plan</div><ol style={{fontSize:12,margin:'0 0 0 20px'}}>{containmentOptions.map(x=><li key={x} style={{marginBottom:5}}>{x}</li>)}</ol></div>
                <button className="btn btn-primary" onClick={applyKnowledge} disabled={saving}>Apply selected knowledge</button>
              </>:<>
                <div className="alert alert-info"><b>Containment objective:</b> stop unauthorized access, remove persistence, preserve evidence, and verify that the affected account or asset is no longer under attacker control.</div>
                <ActionStatusList records={ensureContainmentRecords()} onChange={records=>setContainment({...containment,action_records:records})} disabled={containmentAttempted}/>
                {verificationOptions.length>0&&<div style={{marginTop:14}}><div className="form-label">Verification checks</div><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:8}}>{verificationOptions.map(check=><label key={check} style={{display:'flex',gap:8,padding:'9px 10px',border:'1px solid var(--border)',borderRadius:8,fontSize:12}}><input type="checkbox" disabled={containmentAttempted} checked={containment.verification_checks.includes(check)} onChange={e=>setContainment({...containment,verification_checks:e.target.checked?[...containment.verification_checks,check]:containment.verification_checks.filter(x=>x!==check)})}/><span>{check}</span></label>)}</div></div>}
                {!containmentAttempted&&<><div className="form-row" style={{marginTop:14}}><div className="form-group"><label className="form-label">Containment outcome</label><select value={containment.outcome} onChange={e=>setContainment({...containment,outcome:e.target.value})}><option value="successful">Successful — incident contained</option><option value="partial">Partial — additional action required</option><option value="failed">Failed — response did not contain incident</option></select></div><div className="form-group"><label className="form-label">Overall verification evidence *</label><input value={containment.evidence} onChange={e=>setContainment({...containment,evidence:e.target.value})} placeholder="No unauthorized sessions remain; persistence removed; no new suspicious sign-ins"/></div></div><div className="form-group"><label className="form-label">Containment notes</label><textarea rows="2" value={containment.notes} onChange={e=>setContainment({...containment,notes:e.target.value})}/></div><button className="btn btn-primary" onClick={confirmContainment} disabled={saving}>Confirm containment result</button></>}
                {containmentAttempted&&!containmentSuccessful&&<div className="alert alert-warning" style={{marginTop:12,marginBottom:0}}>The incident is not yet fully contained. Add more knowledge, collaborate with another responder, or escalate before the next containment attempt.</div>}
              </>}
            </WorkflowSection>}

            {selected.test_mode==='baseline'&&classified&&<WorkflowSection title="Containment response" complete={containmentSuccessful} status={containmentSuccessful?`Containment verified · MTTC ${fmt(k.mttc_minutes)}`:'Respond using the available incident evidence'}>
              {!selected.containment?.started_at?<><div className="form-label">Planned actions</div><ActionStatusList records={containment.action_records.length?containment.action_records:normalizeRecords(FALLBACK_CONTAINMENT,[])} onChange={records=>setContainment({...containment,planned_actions:records.map(r=>r.action),action_records:records})}/><button className="btn btn-primary" style={{marginTop:10}} onClick={()=>action('containment/start',{planned_actions:(containment.action_records.length?containment.action_records:FALLBACK_CONTAINMENT.map(action=>({action,status:'not_started',evidence:''}))).map(r=>r.action),notes:containment.notes})}>Start containment</button></>:<><ActionStatusList records={containment.action_records.length?containment.action_records:normalizeRecords(FALLBACK_CONTAINMENT,[])} onChange={records=>setContainment({...containment,action_records:records})}/><div className="form-row" style={{marginTop:10}}><select value={containment.outcome} onChange={e=>setContainment({...containment,outcome:e.target.value})}><option value="successful">Successful</option><option value="partial">Partial</option><option value="failed">Failed</option></select><input value={containment.evidence} onChange={e=>setContainment({...containment,evidence:e.target.value})} placeholder="Verification evidence"/></div><button className="btn btn-primary" style={{marginTop:10}} onClick={confirmContainment}>Confirm containment</button></>}
            </WorkflowSection>}

            {responseNeedsHelp&&!containmentSuccessful&&<WorkflowSection title="Additional response required" status="Choose the least disruptive next step: add knowledge, collaborate, or escalate when the incident exceeds the current response capability">
              <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:14}}>{selected.test_mode!=='baseline'&&<button className="btn btn-ghost" onClick={addMoreKnowledge}>+ Add more knowledge</button>}</div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:12}}>
                <div style={{padding:'14px',border:'1px solid var(--border)',borderRadius:10,background:'var(--bg3)'}}><h3 style={{margin:'0 0 6px'}}>Collaborate with response team</h3><div style={{fontSize:11,color:'var(--text3)',marginBottom:10}}>Keep incident ownership while bringing in another responder. Team members are selected from real application accounts and receive an in-app notification.</div><div className="form-group"><label className="form-label">Response function *</label><select value={collaboration.collaborate_with} onChange={e=>setCollaboration({...collaboration,collaborate_with:e.target.value})}><option>Email / Identity Administrator</option><option>Cybersecurity Analyst</option><option>Network Administrator</option><option>Station ICT Support</option><option>Headquarters ICT</option></select></div><div className="form-group"><label className="form-label">Select collaborators *</label><TeamSelector users={directoryUsers} selectedIds={collaboration.team_member_ids} station={selected.station_id} onChange={ids=>setCollaboration({...collaboration,team_member_ids:ids})}/></div><div className="form-group"><label className="form-label">Reason *</label><textarea rows="2" value={collaboration.reason} onChange={e=>setCollaboration({...collaboration,reason:e.target.value})}/></div><div className="form-group"><label className="form-label">Assistance required</label><input value={collaboration.assistance_required} onChange={e=>setCollaboration({...collaboration,assistance_required:e.target.value})} placeholder="Mailbox review, identity support, endpoint analysis..."/></div><div className="form-group"><label className="form-label">Response summary to share</label><textarea rows="2" value={collaboration.shared_summary} onChange={e=>setCollaboration({...collaboration,shared_summary:e.target.value})} placeholder="Knowledge used, actions attempted, current evidence and decisions needed"/></div><MeetControls value={collaboration.meeting_url} onChange={v=>setCollaboration({...collaboration,meeting_url:v})} agenda={collaboration.meeting_agenda} onAgendaChange={v=>setCollaboration({...collaboration,meeting_agenda:v})}/><button className="btn btn-primary" style={{marginTop:10}} onClick={collaborate} disabled={saving}>Start collaboration</button>{collaborations.length>0&&<div style={{fontSize:11,color:'var(--kalro-green-light)',marginTop:8}}>✓ {collaborations.length} collaboration {collaborations.length===1?'session':'sessions'} recorded</div>}{collaborations.slice(-1).map(c=>c.meeting_url&&<a key={c.id} href={c.meeting_url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{marginTop:8}}>Rejoin latest Google Meet</a>)}</div>
                <div style={{padding:'14px',border:'1px solid var(--border)',borderRadius:10,background:'var(--bg3)'}}><h3 style={{margin:'0 0 6px'}}>Escalate and coordinate</h3><div style={{fontSize:11,color:'var(--text3)',marginBottom:10}}>Escalate when severity, scope, authority, or available knowledge exceeds the current response capability. The same action can establish a Google Meet room for the escalation team.</div>{array(knowledgePlan.escalation_conditions).length>0&&<div className="alert alert-warning"><b>Escalation indicators:</b><ul style={{margin:'6px 0 0 18px'}}>{knowledgePlan.escalation_conditions.map(x=><li key={x}>{x}</li>)}</ul></div>}<div className="form-group"><label className="form-label">Reason *</label><textarea rows="2" value={escalation.reason} onChange={e=>setEscalation({...escalation,reason:e.target.value})}/></div><div className="form-row"><div className="form-group"><label className="form-label">Escalated to</label><select value={escalation.escalated_to} onChange={e=>setEscalation({...escalation,escalated_to:e.target.value})}><option>ICT Security Lead</option><option>Headquarters ICT</option><option>Station ICT Lead</option><option>Incident Response Team</option><option>Senior Management</option></select></div><div className="form-group"><label className="form-label">Priority</label><select value={escalation.priority} onChange={e=>setEscalation({...escalation,priority:e.target.value})}><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></div></div><div className="form-group"><label className="form-label">Select escalation team *</label><TeamSelector users={directoryUsers} selectedIds={escalation.team_member_ids} station={selected.station_id} onChange={ids=>setEscalation({...escalation,team_member_ids:ids})}/></div><div className="form-group"><label className="form-label">Specialist assistance required</label><input value={escalation.assistance_required} onChange={e=>setEscalation({...escalation,assistance_required:e.target.value})} placeholder="Identity forensics, network containment, executive decision..."/></div><div className="form-group"><label className="form-label">Situation summary</label><textarea rows="2" value={escalation.shared_summary} onChange={e=>setEscalation({...escalation,shared_summary:e.target.value})} placeholder="What has been tried, knowledge used, evidence and unresolved risk"/></div><MeetControls value={escalation.meeting_url} onChange={v=>setEscalation({...escalation,meeting_url:v})} agenda={escalation.meeting_agenda} onAgendaChange={v=>setEscalation({...escalation,meeting_agenda:v})}/><button className="btn btn-primary" style={{marginTop:10}} disabled={escalated||saving} onClick={escalate}>{escalated?'Escalated ✓':'Escalate and notify team'}</button>{selected.escalation?.meeting_url&&<a href={selected.escalation.meeting_url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{marginTop:8,marginLeft:8}}>Join escalation Meet</a>}</div>              </div>
            </WorkflowSection>}

            {hadIncompleteAttempt&&!containmentSuccessful&&(collaborated||escalated||knowledgeApplied)&&<WorkflowSection title="Additional containment attempt" status={selected.containment?.status==='in_progress'?'Additional response in progress':'Apply the revised response after new knowledge, collaboration, or escalation'}>
              {selected.containment?.status!=='in_progress'?<><ActionStatusList records={containment.action_records.length?containment.action_records:normalizeRecords(containmentOptions.length?containmentOptions:FALLBACK_CONTAINMENT,[])} onChange={records=>setContainment({...containment,action_records:records,planned_actions:records.map(r=>r.action)})}/><button className="btn btn-primary" style={{marginTop:10}} onClick={()=>action('containment/start',{planned_actions:(containment.action_records.length?containment.action_records:normalizeRecords(containmentOptions.length?containmentOptions:FALLBACK_CONTAINMENT,[])).map(r=>r.action),notes:containment.notes})}>Start another containment attempt</button></>:<><ActionStatusList records={containment.action_records.length?containment.action_records:normalizeRecords(containmentOptions.length?containmentOptions:FALLBACK_CONTAINMENT,[])} onChange={records=>setContainment({...containment,action_records:records})}/><div className="form-row" style={{marginTop:10}}><div className="form-group"><label className="form-label">Outcome</label><select value={containment.outcome} onChange={e=>setContainment({...containment,outcome:e.target.value})}><option value="successful">Successful</option><option value="partial">Partial</option><option value="failed">Failed</option></select></div><div className="form-group"><label className="form-label">Evidence *</label><input value={containment.evidence} onChange={e=>setContainment({...containment,evidence:e.target.value})}/></div></div><button className="btn btn-primary" onClick={confirmContainment}>Confirm revised containment</button></>}
            </WorkflowSection>}

            {containmentSuccessful&&<WorkflowSection title="Recovery and safe account restoration" complete={recoverySuccessful} status={recoverySuccessful?'Recovery validated':'Secure and validate the account before restoring access'}>
              <div className="alert alert-info"><b>After deactivation:</b> reset credentials, verify MFA and recovery information, confirm persistence is removed, review logs, restore access only after validation, notify the user, and monitor for recurrence.</div>
              <ActionStatusList records={ensureRecoveryRecords()} onChange={records=>setRecovery({...recovery,action_records:records})} disabled={recoverySuccessful}/>
              {!recoverySuccessful&&<><div className="form-row" style={{marginTop:12}}><div className="form-group"><label className="form-label">Recovery outcome</label><select value={recovery.outcome} onChange={e=>setRecovery({...recovery,outcome:e.target.value})}><option value="successful">Successful</option><option value="partial">Partial</option><option value="failed">Failed</option></select></div><div className="form-group"><label className="form-label">Validation evidence *</label><input value={recovery.evidence} onChange={e=>setRecovery({...recovery,evidence:e.target.value})} placeholder="Password reset; MFA verified; clean sign-in review; no suspicious activity during monitoring"/></div></div><div className="form-group"><label className="form-label">Recovery notes</label><textarea rows="2" value={recovery.notes} onChange={e=>setRecovery({...recovery,notes:e.target.value})}/></div><button className="btn btn-primary" onClick={confirmRecovery} disabled={saving}>Confirm recovery</button></>}
            </WorkflowSection>}

            {recoverySuccessful&&<WorkflowSection title="Incident closure" complete={incidentClosed} status={incidentClosed?`Incident closed · MTTR ${fmt(k.mttr_minutes)}`:'Close only after recovery has been validated'}>
              {!incidentClosed&&<><div className="form-group"><label className="form-label">Resolution summary</label><textarea rows="3" value={closeResolution} onChange={e=>setCloseResolution(e.target.value)}/></div><button className="btn btn-primary" onClick={closeIncident} disabled={saving}>Close incident</button></>}
            </WorkflowSection>}

            {incidentClosed&&<WorkflowSection title="Lessons learned and knowledge preservation" complete={captured.length>0} status={captured.length?`${captured.length} draft knowledge ${captured.length===1?'entry':'entries'} captured — reopen to add or propose more updates`:'Convert the response experience into reusable institutional knowledge'}>
              {captured.length>0&&<div style={{display:'flex',flexDirection:'column',gap:7,marginBottom:14}}>{captured.map(x=><div key={x.id} style={{padding:'9px 11px',border:'1px solid var(--border)',borderRadius:8,background:'var(--bg3)',fontSize:11}}><span className="text-mono" style={{color:'var(--accent)'}}>{x.id}</span> · {x.title} · <b>{x.status}</b>{x.proposed_update_for?` · proposed update for ${x.proposed_update_for}`:''}</div>)}</div>}
              {selectedKnowledgeItems.length>0&&<div style={{marginBottom:14}}><div className="form-label">Review the knowledge used</div><div style={{display:'flex',flexDirection:'column',gap:8}}>{selectedKnowledgeItems.map(item=>{const review=lesson.knowledge_reviews.find(r=>r.knowledge_id===item.id)||{knowledge_id:item.id,assessment:'effective',notes:''};const updateReview=patch=>setLesson({...lesson,knowledge_reviews:[...lesson.knowledge_reviews.filter(r=>r.knowledge_id!==item.id),{...review,...patch}]});return <div key={item.id} style={{padding:'10px 12px',border:'1px solid var(--border)',borderRadius:8,background:'var(--bg3)'}}><div style={{fontWeight:700,fontSize:12}}>{item.id} — {item.title}</div><div className="form-row" style={{marginTop:8}}><select value={review.assessment} onChange={e=>updateReview({assessment:e.target.value})}><option value="effective">Effective — no change required</option><option value="partial">Partially effective</option><option value="ineffective">Ineffective</option><option value="update_required">Update required</option></select><input value={review.notes} onChange={e=>updateReview({notes:e.target.value})} placeholder="What should be retained or changed?"/></div></div>})}</div></div>}
              <form onSubmit={captureLesson}>
                <div className="form-row"><div className="form-group"><label className="form-label">Knowledge action</label><select value={lesson.mode} onChange={e=>setLesson({...lesson,mode:e.target.value})}><option value="new">Create new draft lesson</option><option value="update">Propose update to existing knowledge</option></select></div>{lesson.mode==='update'&&<div className="form-group"><label className="form-label">Knowledge to improve *</label><select required value={lesson.target_knowledge_id} onChange={e=>setLesson({...lesson,target_knowledge_id:e.target.value})}><option value="">Select knowledge</option>{selectedKnowledgeItems.map(x=><option key={x.id} value={x.id}>{x.id} — {x.title}</option>)}</select></div>}</div>
                <div className="form-group"><label className="form-label">Lesson / proposed version title *</label><input required value={lesson.title} onChange={e=>setLesson({...lesson,title:e.target.value})}/></div><div className="form-group"><label className="form-label">What happened? *</label><textarea required rows="3" value={lesson.what_happened} onChange={e=>setLesson({...lesson,what_happened:e.target.value})}/></div><div className="form-row"><div className="form-group"><label className="form-label">What worked</label><textarea rows="3" value={lesson.what_worked} onChange={e=>setLesson({...lesson,what_worked:e.target.value})}/></div><div className="form-group"><label className="form-label">What failed / gaps</label><textarea rows="3" value={lesson.what_failed} onChange={e=>setLesson({...lesson,what_failed:e.target.value})}/></div></div><div className="form-group"><label className="form-label">What should change next time?</label><textarea rows="2" value={lesson.next_time} onChange={e=>setLesson({...lesson,next_time:e.target.value})}/></div><div className="form-group"><label className="form-label">Knowledge used</label><input value={lesson.routine_used} onChange={e=>setLesson({...lesson,routine_used:e.target.value})}/></div><div className="form-group"><label className="form-label">Reusable procedure *</label><textarea required rows="4" value={lesson.reusable_procedure} onChange={e=>setLesson({...lesson,reusable_procedure:e.target.value})}/></div><div className="form-row"><div className="form-group"><label className="form-label">Tags</label><input value={lesson.tags} onChange={e=>setLesson({...lesson,tags:e.target.value})}/></div><div className="form-group"><label className="form-label">Confidence</label><select value={lesson.confidence_level} onChange={e=>setLesson({...lesson,confidence_level:e.target.value})}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></div></div><div className="alert alert-info">Lessons are saved as <b>draft knowledge</b>. They can be reviewed and validated before becoming active institutional guidance.</div><button className="btn btn-primary" disabled={saving}>{lesson.mode==='update'?'Save proposed knowledge update':'Save draft lesson to Knowledge Base'}</button>
              </form>
            </WorkflowSection>}

            <WorkflowSection title="Operational assessment" complete={Boolean(selected.observer_scores&&Object.keys(selected.observer_scores).length)} initiallyOpen={false} status="Optional quality assessment of the response">
              <div className="form-row"><div className="form-group"><label className="form-label">Decision accuracy (%)</label><input type="number" min="0" max="100" value={observer.decision_accuracy} onChange={e=>setObserver({...observer,decision_accuracy:e.target.value===''?'':Number(e.target.value)})}/></div><div className="form-group"><label className="form-label">Classification accuracy (%)</label><input type="number" min="0" max="100" value={observer.classification_accuracy} onChange={e=>setObserver({...observer,classification_accuracy:e.target.value===''?'':Number(e.target.value)})}/></div></div>
              <div className="form-row"><div className="form-group"><label className="form-label">Escalation accuracy (%)</label><input type="number" min="0" max="100" value={observer.escalation_accuracy} onChange={e=>setObserver({...observer,escalation_accuracy:e.target.value===''?'':Number(e.target.value)})}/></div><div className="form-group"><label className="form-label">Role adherence (%)</label><input type="number" min="0" max="100" value={observer.role_adherence} onChange={e=>setObserver({...observer,role_adherence:e.target.value===''?'':Number(e.target.value)})}/></div></div>
              <div className="form-row"><div className="form-group"><label className="form-label">Assistance prompts required</label><input type="number" min="0" value={observer.facilitator_interventions} onChange={e=>setObserver({...observer,facilitator_interventions:Number(e.target.value)})}/></div><div className="form-group"><label className="form-label">Critical omissions</label><input type="number" min="0" value={observer.critical_omissions} onChange={e=>setObserver({...observer,critical_omissions:Number(e.target.value)})}/></div></div>
              <button className="btn btn-primary" onClick={saveObserver}>Save assessment</button>
            </WorkflowSection>

            {/* Timeline is passive evidence and deliberately comes after the operational workflow. */}
            <WorkflowSection title="Incident timeline" initiallyOpen={false} status="Automatically recorded response evidence">
              <div>{selected.events?.length?selected.events.map(e=><div key={e.id} style={{display:'grid',gridTemplateColumns:'125px 210px 1fr',gap:10,padding:'8px 0',borderBottom:'1px solid var(--border)',fontSize:11}}><span className="text-mono text-muted">{new Date(e.timestamp).toLocaleTimeString()}</span><span className="text-mono" style={{color:'var(--accent)'}}>{human(e.event_type)}</span><span style={{color:'var(--text3)'}}>{e.source}</span></div>):'No events yet.'}</div>
            </WorkflowSection>

            {selected.status==='completed'&&(comparison?.baseline?.tests>0||comparison?.kd_cirf?.tests>0)&&<WorkflowSection title="Baseline comparison" initiallyOpen={false}><div style={{overflowX:'auto'}}><table><thead><tr><th>Metric</th><th>Baseline</th><th>KD-CIRF</th><th>Change</th></tr></thead><tbody>{[['MTTD','mttd_minutes'],['MTTA','mtta_minutes'],['MTTC','mttc_minutes'],['MTTR','mttr_minutes'],['Knowledge utilization','knowledge_utilization_rate'],['Reuse success','knowledge_reuse_success_rate']].map(([l,key])=>{const d=diff[key]||{};return <tr key={key}><td>{l}</td><td>{d.baseline??'—'}</td><td>{d.kd_cirf??'—'}</td><td>{d.change==null?'—':`${d.change>0?'+':''}${d.change}%`}</td></tr>})}</tbody></table></div></WorkflowSection>}
            {selected.status==='completed'&&trendRows.length>0&&<WorkflowSection title="Performance trends" initiallyOpen={false}><div style={{fontSize:12,color:'var(--text3)'}}>{trendRows.length} completed operational tests are available in the trend dataset.</div></WorkflowSection>}

            <div className="card" style={{marginTop:18,borderTop:'3px solid var(--kalro-green)'}}>
              <div className="flex-between" style={{gap:12,alignItems:'flex-start'}}><div><h2 style={{margin:'0 0 5px'}}>Final operational review</h2><div style={{fontSize:12,color:'var(--text3)'}}>Confirm that containment, recovery, closure, and lessons learned are complete before finalizing the test.</div></div><Badge value={selected.status}/></div>
              <div style={{marginTop:14}}><Readiness incidentClosed={incidentClosed} lessonCaptured={captured.length>0} recoverySuccessful={recoverySuccessful} containmentSuccessful={containmentSuccessful}/></div>
              <div style={{display:'flex',gap:8,marginTop:14,flexWrap:'wrap'}}>
                <button className="btn btn-ghost" disabled={!incidentLinked} onClick={exportCsv}>Export CSV</button>
                <button className="btn btn-ghost" disabled={!incidentLinked} onClick={downloadPdf}>Download PDF report</button>
                {selected.incident_id&&<button className="btn btn-ghost" onClick={()=>navigate('/incidents/'+selected.incident_id)}>Open incident</button>}
                {selected.status==='active'&&<button className="btn btn-primary" disabled={!finalReady||saving} title={!finalReady?'Complete containment, recovery, incident closure, and lessons learned first':''} onClick={finalize}>Finalize operational test</button>}
              </div>
              {selected.status==='completed'&&<div className="alert alert-success" style={{marginTop:14,marginBottom:0}}>Operational test finalized. The response record and report are ready for review.</div>}
            </div>
          </>}
        </>}</div>
      </div>}
    </div>
  </div>
}
