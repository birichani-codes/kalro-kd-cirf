import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { Badge, Tags, ConfidenceBadge, Loading, fmtDate, fmtDateTime, SlaIndicator, KTypeBadge } from '../components/Shared'
import { useAuth } from '../context/AuthContext'
import SocioTechnicalTagger from '../components/SocioTechnicalTagger'
import GameTheoryAdvisor from '../components/GameTheoryAdvisor'
import DefensiveRoutinesPanel from '../components/DefensiveRoutinesPanel'

const STATUSES=['open','investigating','escalated','resolved','closed']

function CaptureModal({ incident, onClose, onSaved }) {
  const [form,setForm]=useState({ title:'Lessons learned: '+incident.title, content:'', tags:incident.type?incident.type.replace(/_/g,'-'):'', knowledge_type:'lessons-learned' })
  const [saving,setSaving]=useState(false), [error,setError]=useState('')
  const handleSave=async(e)=>{ e.preventDefault(); if(!form.content.trim()){setError('Content required');return}; setSaving(true); setError('')
    try{ await api.post('/knowledge',{...form,tags:form.tags.split(',').map(t=>t.trim()).filter(Boolean),incident_id:incident.id}); onSaved() }
    catch(err){ setError(err.response?.data?.error||'Failed') }finally{ setSaving(false) }
  }
  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{maxWidth:640}}>
        <div className="modal-header"><h2>Capture Knowledge from Incident</h2><button className="modal-close" onClick={onClose}>×</button></div>
        <div className="alert alert-info" style={{marginBottom:16}}>Per KALRO IRP: document what you learned so future analysts respond faster to similar incidents.</div>
        {error&&<div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSave}>
          <div className="form-group"><label className="form-label">Title *</label><input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} required/></div>
          <div className="form-group"><label className="form-label">Knowledge Type</label>
            <select value={form.knowledge_type} onChange={e=>setForm(f=>({...f,knowledge_type:e.target.value}))}>
              <option value="lessons-learned">Lessons Learned</option>
              <option value="playbook">Playbook (step-by-step response)</option>
              <option value="runbook">Runbook (operational procedure)</option>
              <option value="reference">Reference (technical facts)</option>
            </select>
          </div>
          <div className="form-group"><label className="form-label">Content *</label><textarea rows={8} value={form.content} onChange={e=>setForm(f=>({...f,content:e.target.value}))} placeholder={"What happened\nSteps that worked\nWhat to avoid\nKALRO-specific context (systems, contacts, configs)"} required/></div>
          <div className="form-group"><label className="form-label">Tags (comma-separated)</label><input value={form.tags} onChange={e=>setForm(f=>({...f,tags:e.target.value}))} placeholder="phishing, email, credentials"/></div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Skip</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving?'Saving...':'Save Entry'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function IncidentDetail() {
  const { id }=useParams()
  const [incident,setIncident]=useState(null), [loading,setLoading]=useState(true)
  const [updating,setUpdating]=useState(false), [showCapture,setShowCapture]=useState(false), [savedMsg,setSavedMsg]=useState('')
  const [reviewing,setReviewing]=useState(false)
  const [selectedReview,setSelectedReview]=useState(null)
  const [reviewScore,setReviewScore]=useState(0.8)
  const [reviewNotes,setReviewNotes]=useState('')
  const [reviewError,setReviewError]=useState('')
  const [reviewSuccess,setReviewSuccess]=useState('')
  const [comments,setComments]=useState([])
  const [commentsLoading,setCommentsLoading]=useState(false)
  const [newComment,setNewComment]=useState('')
  const [linkedIncidents,setLinkedIncidents]=useState([])
  const [linkTarget,setLinkTarget]=useState('')
  const [watchers,setWatchers]=useState([])
  const [watcherEmail,setWatcherEmail]=useState('')
  const [activity,setActivity]=useState([])
  const [activityLoading,setActivityLoading]=useState(true)
  const [collabStatus,setCollabStatus]=useState('')
  const [collabError,setCollabError]=useState('')
  const [showVideo,setShowVideo]=useState(false)
  const [inviteModal,setInviteModal]=useState(false)
  const [availableUsers,setAvailableUsers]=useState([])
  const [selectedUsers,setSelectedUsers]=useState([])
  const [inviting,setInviting]=useState(false)
  const [briefingAgenda,setBriefingAgenda]=useState('')
  const [briefingDecision,setBriefingDecision]=useState('')
  const [briefingSaving,setBriefingSaving]=useState(false)
  const [decisionSaving,setDecisionSaving]=useState(false)
  const [briefingStatus,setBriefingStatus]=useState('')
  const navigate=useNavigate(), { isAnalyst, user }=useAuth()

  const load=async()=>{
    setLoading(true)
    setCollabError('')
    try {
      const res = await api.get('/incidents/'+id)
      setIncident(res.data)
      setComments(res.data.comments || [])
      setLinkedIncidents(res.data.linked_incidents || [])
      setWatchers(res.data.watchers || [])
    } catch(err) {
      setCollabError(err.response?.data?.error || 'Failed to load incident')
    } finally {
      setLoading(false)
    }
  }

  const loadActivity = async () => {
    setActivityLoading(true)
    try {
      const res = await api.get(`/incidents/${id}/activity`)
      setActivity(res.data || [])
    } catch {
      setActivity([])
    } finally {
      setActivityLoading(false)
    }
  }

  const loadUsers = async () => {
    try {
      const res = await api.get('/users')
      setAvailableUsers(res.data.filter(u => u.id !== user.id))
    } catch(err) {
      console.error('Failed to load users:', err)
    }
  }

  const inviteUsers = async () => {
    if (selectedUsers.length === 0) {
      setCollabError('Select at least one user to invite.')
      return
    }
    setInviting(true)
    setCollabError('')
    setCollabStatus('Sending invites...')
    try {
      await api.post(`/incidents/${id}/invite`, { user_ids: selectedUsers })
      setCollabStatus('Team invited successfully.')
      setInviteModal(false)
      setSelectedUsers([])
      await loadActivity()
      await load()
    } catch(err) {
      setCollabError(err.response?.data?.error || 'Failed to invite team')
    } finally {
      setInviting(false)
      setCollabStatus('')
    }
  }

  const updateBriefing = async (payload) => {
    setBriefingSaving(true)
    setCollabError('')
    setBriefingStatus('Updating briefing...')
    try {
      await api.put(`/incidents/${id}/briefing`, payload)
      await loadActivity()
      await load()
      setBriefingStatus(payload.active === false ? 'Briefing ended.' : 'Briefing saved.' )
      return true
    } catch(err) {
      setCollabError(err.response?.data?.error || 'Failed to update briefing')
      return false
    } finally {
      setBriefingSaving(false)
      setTimeout(() => setBriefingStatus(''), 3000)
    }
  }

  const startBriefing = async () => {
    const success = await updateBriefing({ active: true, agenda: briefingAgenda })
    if (success) setShowVideo(true)
  }

  const endBriefing = async () => {
    const success = await updateBriefing({ active: false })
    if (success) setShowVideo(false)
  }

  const saveBriefingAgenda = async () => {
    await updateBriefing({ agenda: briefingAgenda })
  }

  const addBriefingDecision = async () => {
    if (!briefingDecision.trim()) {
      setCollabError('Add a briefing decision note before saving.')
      return
    }
    setDecisionSaving(true)
    setCollabError('')
    setBriefingStatus('Saving decision...')
    try {
      await api.post(`/incidents/${id}/briefing/decisions`, { message: briefingDecision.trim() })
      setBriefingDecision('')
      setBriefingStatus('Decision captured.')
      await loadActivity()
      await load()
    } catch(err) {
      setCollabError(err.response?.data?.error || 'Failed to capture briefing decision')
    } finally {
      setDecisionSaving(false)
      setTimeout(() => setBriefingStatus(''), 3000)
    }
  }

  const submitComment = async () => {
    if (!newComment.trim()) {
      setCollabError('Add a war room update before sharing.')
      return
    }
    setCollabError('')
    setCollabStatus('Posting comment...')
    try {
      const res = await api.post(`/incidents/${id}/comments`, { message: newComment.trim() })
      setComments(prev => [res.data, ...prev])
      setNewComment('')
      setCollabStatus('Comment posted.')
      await loadActivity()
      await load()
    } catch(err) {
      setCollabError(err.response?.data?.error || 'Failed to post comment')
    } finally {
      setCollabStatus('')
    }
  }

  const addLink = async () => {
    if (!linkTarget.trim()) {
      setCollabError('Enter an incident ID to link.')
      return
    }
    setCollabError('')
    setCollabStatus('Linking incident...')
    try {
      const res = await api.post(`/incidents/${id}/link`, { target_incident_id: linkTarget.trim() })
      setLinkedIncidents(res.data.linked_incidents || [])
      setLinkTarget('')
      setCollabStatus('Incident linked.')
      await loadActivity()
      await load()
    } catch(err) {
      setCollabError(err.response?.data?.error || 'Failed to link incident')
    } finally {
      setCollabStatus('')
    }
  }

  const addWatcher = async () => {
    if (!watcherEmail.trim()) {
      setCollabError('Enter a stakeholder email to add.')
      return
    }
    setCollabError('')
    setCollabStatus('Adding watcher...')
    try {
      const res = await api.post(`/incidents/${id}/watchers`, { email: watcherEmail.trim() })
      setWatchers(prev => [res.data.watcher, ...prev])
      setWatcherEmail('')
      setCollabStatus('Watcher added.')
      await loadActivity()
      await load()
    } catch(err) {
      setCollabError(err.response?.data?.error || 'Failed to add watcher')
    } finally {
      setCollabStatus('')
    }
  }

  const submitRoutineReview = async (routine) => {
    setReviewing(true)
    setReviewError('')
    setReviewSuccess('')
    try {
      await api.post(`/incidents/${id}/review-routine/${routine.knowledge_id}`, {
        rating: reviewScore,
        comments: reviewNotes
      })
      setReviewSuccess('Routine review saved. Payoff values updated.');
      setSelectedReview(null)
      setReviewNotes('')
      load()
    } catch(err) {
      setReviewError(err.response?.data?.error || 'Failed to submit review')
    } finally {
      setReviewing(false)
    }
  }

  useEffect(()=>{ load(); loadActivity(); if(isAnalyst) loadUsers(); },[id, isAnalyst])

  useEffect(()=>{
    setBriefingAgenda(incident?.briefing?.agenda || '')
    if (incident?.briefing?.active) {
      setShowVideo(true)
    }
  }, [incident?.briefing])

  const recordTestEvent=async(event_type)=>{ if(!incident?.operational_test_id) return; await api.post(`/operational-tests/${incident.operational_test_id}/events`,{event_type,incident_id:id}); }
  const openKnowledgeSearch=async()=>{ try{ await recordTestEvent('KNOWLEDGE_SEARCH_STARTED') }finally{ navigate('/search') } }

  const updateStatus=async(status)=>{ setUpdating(true); await api.put('/incidents/'+id,{status}); if((status==='resolved'||status==='closed')&&isAnalyst&&!incident?.operational_test_id) setShowCapture(true); load(); loadActivity(); setUpdating(false) }
  const handleCaptured=()=>{ setShowCapture(false); setSavedMsg('Knowledge entry saved.'); load(); setTimeout(()=>setSavedMsg(''),4000) }

  if(loading) return <Loading/>
  if(!incident) return <div className="page-body"><div className="alert alert-error">Incident not found.</div></div>

  const entitiesFlat=Object.entries(incident.entities||{}).flatMap(([k,v])=>Array.isArray(v)?v.map(val=>({type:k,val})):[{type:k,val:String(v)}])
  const hasKnowledge=incident.related_knowledge?.length>0
  const isCloseable=['resolved','closed'].includes(incident.status)
  const hasPIR=false // checked separately

  return (
    <div>
      <div className="page-header">
        <div style={{paddingBottom:20}}>
          <div style={{fontSize:12,color:'var(--text3)',fontFamily:'var(--font-mono)',marginBottom:8}}>
            <span style={{cursor:'pointer',color:'var(--accent)'}} onClick={()=>navigate('/incidents')}>Incidents</span> / #{incident.id}
          </div>
          <div className="flex-between">
            <div>
              <h1 style={{marginBottom:8,display:'flex',alignItems:'center',gap:10}}>
                {incident.is_major&&<span style={{background:'var(--kalro-critical-bg)',color:'var(--kalro-red-light)',fontSize:13,fontFamily:'var(--font-mono)',padding:'2px 10px',borderRadius:4,border:'1px solid rgba(198,40,40,0.3)'}}>★ MAJOR</span>}
                {incident.title}
              </h1>
              <div className="flex gap-2" style={{flexWrap:'wrap',alignItems:'center'}}>
                <Badge value={incident.severity}/><Badge value={incident.status}/>
                <span className="tag">{incident.type?.replace(/_/g,' ')}</span>
                <SlaIndicator inc={incident}/>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="page-body">
        {savedMsg&&<div className="alert alert-success" style={{marginBottom:16}}>✓ {savedMsg}</div>}
        {incident.operational_test_id&&<div className="alert alert-info" style={{marginBottom:16}}><div className="flex-between" style={{gap:12,flexWrap:'wrap'}}><div><strong>⏱ Operational test active</strong> <span className="text-mono">{incident.operational_test_id}</span><div style={{fontSize:12,marginTop:4}}>Response actions are timestamped for KPI measurement. Containment, recovery and final lesson capture use the structured Operational Testing workflow.</div></div><div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{isAnalyst&&<button className="btn btn-primary btn-sm" onClick={()=>navigate('/operational-testing')}>Manage test workflow</button>}</div></div></div>}

        {/* Major incident banner */}
        {incident.is_major&&(
          <div style={{background:'var(--kalro-critical-bg)',border:'1px solid rgba(198,40,40,0.4)',borderLeft:'4px solid var(--kalro-red)',borderRadius:'var(--radius)',padding:'14px 20px',marginBottom:20}}>
            <div style={{fontFamily:'var(--font-mono)',fontSize:13,fontWeight:700,color:'var(--kalro-red-light)',marginBottom:4}}>★ MAJOR INCIDENT — MIT ACTIVATION REQUIRED</div>
            <div style={{fontSize:13,color:'var(--text2)'}}>This is classified as a major incident. Senior leadership must be notified. All actions must be documented for the Post-Incident Review (PIR).</div>
          </div>
        )}

        {/* Escalation banner */}
        {incident.status==='escalated'&&(
          <div style={{background:'var(--kalro-critical-bg)',border:'1px solid rgba(198,40,40,0.4)',borderLeft:'4px solid var(--kalro-red)',borderRadius:'var(--radius)',padding:'14px 20px',marginBottom:20,display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:16}}>
            <div>
              <div style={{fontFamily:'var(--font-mono)',fontSize:13,fontWeight:700,color:'var(--kalro-red-light)',marginBottom:4}}>⚡ ESCALATED — No Institutional Knowledge Found</div>
              <div style={{fontSize:13,color:'var(--text2)'}}>No matching knowledge exists. A senior analyst should lead. Document findings for PIR on resolution.</div>
            </div>
            {isAnalyst&&<button className="btn btn-ghost btn-sm" style={{borderColor:'rgba(198,40,40,0.4)',color:'var(--kalro-red-light)',whiteSpace:'nowrap'}} onClick={()=>setShowCapture(true)}>Capture Now</button>}
          </div>
        )}

        {/* No knowledge warning */}
        {!hasKnowledge&&incident.status!=='escalated'&&(
          <div style={{background:'var(--yellow-bg)',border:'1px solid rgba(255,193,7,0.4)',borderLeft:'4px solid var(--yellow)',borderRadius:'var(--radius)',padding:'12px 20px',marginBottom:20,display:'flex',alignItems:'center',justifyContent:'space-between',gap:16}}>
            <div style={{fontSize:13,color:'var(--text2)'}}><span style={{fontFamily:'var(--font-mono)',color:'var(--yellow)',fontWeight:700}}>◈ No knowledge suggestions</span> — consider escalating if unfamiliar territory.</div>
            {isAnalyst&&<div style={{display:'flex',gap:8,flexShrink:0}}>
              <button className="btn btn-ghost btn-sm" style={{borderColor:'rgba(255,193,7,0.4)',color:'var(--yellow)'}} onClick={()=>updateStatus('escalated')}>Escalate</button>
              <button className="btn btn-ghost btn-sm" onClick={openKnowledgeSearch}>Search KB</button>
            </div>}
          </div>
        )}

        <div style={{display:'grid',gridTemplateColumns:'1fr 300px',gap:20}}>
          <div>
            <div className="card" style={{marginBottom:20}}>
              <div className="section-header"><h2>Description</h2></div>
              <p style={{color:'var(--text2)',lineHeight:1.8,fontSize:14,whiteSpace:'pre-wrap'}}>{incident.description||<span className="text-muted">No description.</span>}</p>
            </div>

            {entitiesFlat.length>0&&(
              <div className="card" style={{marginBottom:20}}>
                <div className="section-header"><h2>Affected Entities</h2></div>
                <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                  {entitiesFlat.map(({type,val},i)=>(
                    <div key={i} style={{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:6,padding:'6px 12px'}}>
                      <span style={{fontSize:10,color:'var(--text3)',fontFamily:'var(--font-mono)',textTransform:'uppercase',marginRight:6}}>{type}:</span>
                      <span style={{fontFamily:'var(--font-mono)',fontSize:13,color:'var(--kalro-green-light)'}}>{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="card">
              <div className="section-header">
                <h2>Related Knowledge {hasKnowledge&&<span style={{color:'var(--accent)',fontFamily:'var(--font-mono)',fontWeight:400}}>({incident.related_knowledge.length})</span>}</h2>
                {isAnalyst&&<button className="btn btn-ghost btn-sm" onClick={()=>setShowCapture(true)}>+ Capture</button>}
              </div>
              {!hasKnowledge?(
                <div style={{textAlign:'center',padding:'24px 0',color:'var(--text3)'}}>
                  <div style={{fontSize:28,marginBottom:8,opacity:0.4}}>◈</div>
                  <div style={{fontFamily:'var(--font-mono)',fontSize:13,color:'var(--text2)',marginBottom:12}}>No matching entries in knowledge base</div>
                  <div style={{display:'flex',gap:8,justifyContent:'center'}}>
                    <button className="btn btn-ghost btn-sm" onClick={openKnowledgeSearch}>Search KB</button>
                    {isAnalyst&&<button className="btn btn-primary btn-sm" onClick={()=>setShowCapture(true)}>Capture knowledge</button>}
                  </div>
                </div>
              ):incident.related_knowledge.map(k=>(
                <div key={k.id} onClick={()=>navigate('/knowledge/'+k.id)} style={{padding:'14px 0',borderBottom:'1px solid var(--border)',cursor:'pointer',transition:'padding 0.15s'}}
                  onMouseEnter={e=>e.currentTarget.style.paddingLeft='6px'} onMouseLeave={e=>e.currentTarget.style.paddingLeft='0'}>
                  <div className="flex-between" style={{marginBottom:8}}>
                    <span style={{fontWeight:500,fontSize:14}}>{k.title}</span>
                    <div style={{display:'flex',gap:6}}><KTypeBadge type={k.knowledge_type}/><Badge value={k.status}/></div>
                  </div>
                  <div style={{marginBottom:8}}><ConfidenceBadge score={k.confidence_score}/></div>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    <Tags tags={k.tags}/>
                    <span style={{fontSize:11,color:'var(--text3)',whiteSpace:'nowrap',marginLeft:8}}>used {k.use_count}×</span>
                  </div>
                  <p style={{fontSize:12,color:'var(--text3)',marginTop:8,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}}>{k.content}</p>
                  {isAnalyst&&<button className="btn btn-ghost btn-sm" style={{marginTop:8}} onClick={async(e)=>{e.stopPropagation();await api.post('/knowledge/'+k.id+'/use',{incident_id:id,operational_test_id:incident.operational_test_id});load()}}>✓ Mark as used</button>}
                </div>
              ))}
            </div>

            <div className="card" style={{marginTop:20}}>
              <div className="section-header">
                <h2>Incident War Room</h2>
                {incident.is_major && (
                  <div style={{display:'flex',flexDirection:'column',gap:12}}>
                    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                      <button className="btn btn-primary btn-sm" onClick={incident.briefing?.active ? endBriefing : startBriefing} disabled={briefingSaving}>
                        {incident.briefing?.active ? 'End' : 'Start'} Video Briefing
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={()=>{setInviteModal(true); loadUsers()}}>
                        Invite Team
                      </button>
                      {incident.briefing?.room_url && (
                        <a className="btn btn-secondary btn-sm" target="_blank" rel="noreferrer" href={incident.briefing.room_url}>
                          Open Meeting Room
                        </a>
                      )}
                    </div>
                    <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
                      <input value={briefingAgenda} onChange={e=>setBriefingAgenda(e.target.value)} placeholder="Briefing agenda or talking points" style={{flex:1,minWidth:260,padding:'10px 12px',borderRadius:8,border:'1px solid var(--border)',background:'var(--bg2)',color:'var(--text)'}} />
                      <button className="btn btn-sm btn-primary" onClick={saveBriefingAgenda} disabled={briefingSaving}>Save agenda</button>
                    </div>
                    <div style={{display:'flex',flexWrap:'wrap',gap:12,fontSize:13,color:'var(--text3)'}}>
                      <span>{incident.briefing?.active ? 'Live briefing active' : 'Briefing room ready'}</span>
                      {incident.briefing?.started_at && <span>Started {fmtDateTime(incident.briefing.started_at)}</span>}
                      {incident.briefing?.ended_at && !incident.briefing?.active && <span>Ended {fmtDateTime(incident.briefing.ended_at)}</span>}
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                      <div style={{padding:14,background:'var(--bg3)',borderRadius:10,border:'1px solid var(--border)'}}>
                        <div style={{fontSize:12,fontFamily:'var(--font-mono)',color:'var(--text3)',marginBottom:8}}>Attendees</div>
                        {watchers.length===0 ? (
                          <div style={{fontSize:13,color:'var(--text2)'}}>No attendees yet. Invite team members to the war room.</div>
                        ) : (
                          watchers.map(w=>(
                            <div key={w.user_id||w.email} style={{display:'flex',justifyContent:'space-between',gap:10,marginBottom:8}}>
                              <span>{w.user_name || w.email}</span>
                              <span style={{fontSize:11,color:'var(--text3)'}}>{w.role || 'stakeholder'}</span>
                            </div>
                          ))
                        )}
                      </div>
                      <div style={{padding:14,background:'var(--bg3)',borderRadius:10,border:'1px solid var(--border)'}}>
                        <div style={{fontSize:12,fontFamily:'var(--font-mono)',color:'var(--text3)',marginBottom:8}}>Recommended Experts</div>
                        <div style={{display:'grid',gap:6}}>
                          {(incident.type==='ransomware' ? ['Forensics','Legal','SOC Analyst']
                            : incident.type==='phishing' ? ['Threat Intel','User Awareness','SOC Analyst']
                            : incident.type==='unauthorized_access' ? ['Identity','Audit','Forensics']
                            : incident.type==='ddos' ? ['Network Ops','Infra','SOC Analyst']
                            : incident.type==='data_exfiltration' ? ['Data Protection','Forensics','Legal']
                            : ['Threat Intelligence','Operations','Compliance']
                          ).map(rec => <div key={rec} style={{fontSize:13,color:'var(--text)'}}>• {rec}</div>)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {incident.is_major && showVideo && (
                <div style={{marginBottom:20, border:'1px solid var(--border)', borderRadius:8, overflow:'hidden'}}>
                  <iframe
                    src={incident.briefing?.room_url || `https://meet.jit.si/kalro-incident-${incident.id}`}
                    style={{width:'100%', height:'400px', border:'none'}}
                    allow="camera; microphone; fullscreen; display-capture"
                    title="KALRO Video Briefing"
                  ></iframe>
                </div>
              )}
              <div style={{marginBottom:16,fontSize:13,color:'var(--text2)'}}>Capture operational collaboration updates, linked incidents, and stakeholder watchers in one place.</div>
              {collabError && <div className="alert alert-error" style={{marginBottom:12}}>{collabError}</div>}
              {collabStatus && <div className="alert alert-info" style={{marginBottom:12}}>{collabStatus}</div>}
              <div style={{display:'grid',gridTemplateColumns:'1fr',gap:12}}>
                <div>
                  <label style={{fontSize:12,color:'var(--text3)',fontFamily:'var(--font-mono)',marginBottom:6,display:'block'}}>War Room Comment</label>
                  <textarea rows={4} value={newComment} onChange={e=>setNewComment(e.target.value)} style={{width:'100%',padding:12,borderRadius:8,border:'1px solid var(--border)',background:'var(--bg2)',color:'var(--text)'}} placeholder="Share updates, blockers, actions taken, or handover notes."></textarea>
                  <button className="btn btn-primary btn-sm" style={{marginTop:10}} onClick={submitComment}>Post update</button>
                  <div style={{marginTop:16}}>
                    <div style={{fontSize:12,fontFamily:'var(--font-mono)',color:'var(--text3)',marginBottom:8}}>Recent Comments</div>
                    {comments.length === 0 ? (
                      <div style={{fontSize:13,color:'var(--text2)'}}>No war room comments yet. Use the field above to keep the team in sync.</div>
                    ) : comments.slice(0,4).map(comment => (
                      <div key={comment.id} style={{marginBottom:12,padding:12,background:'var(--bg3)',borderRadius:10,border:'1px solid var(--border)'}}>
                        <div style={{display:'flex',justifyContent:'space-between',gap:8,marginBottom:6}}>
                          <span style={{fontWeight:600,color:'var(--text)'}}>{comment.user_name}</span>
                          <span style={{fontSize:11,color:'var(--text3)'}}>{fmtDateTime(comment.created_at)}</span>
                        </div>
                        <div style={{fontSize:13,color:'var(--text2)',whiteSpace:'pre-wrap'}}>{comment.message}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{marginTop:18,padding:14,background:'var(--bg3)',borderRadius:12,border:'1px solid var(--border)'}}>
                  <div style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap',marginBottom:12}}>
                    <div>
                      <div style={{fontSize:12,fontFamily:'var(--font-mono)',color:'var(--text3)',marginBottom:4}}>Briefing Decision Notes</div>
                      <div style={{fontSize:13,color:'var(--text2)'}}>Capture key decisions from the live briefing so they are separated from general comments.</div>
                    </div>
                    <button className="btn btn-sm btn-primary" disabled={decisionSaving} onClick={addBriefingDecision}>Save Decision</button>
                  </div>
                  <textarea rows={3} value={briefingDecision} onChange={e=>setBriefingDecision(e.target.value)} style={{width:'100%',padding:12,borderRadius:8,border:'1px solid var(--border)',background:'var(--bg2)',color:'var(--text)',marginBottom:12}} placeholder="What decision was made? Next action? Owner? Timeline?"></textarea>
                  {incident.briefing?.decisions?.length ? (
                    incident.briefing.decisions.slice(0,4).map(decision => (
                      <div key={decision.id} style={{marginBottom:12,padding:12,background:'white',borderRadius:10,border:'1px solid var(--border)'}}>
                        <div style={{display:'flex',justifyContent:'space-between',gap:8,marginBottom:6}}>
                          <span style={{fontWeight:600}}>{decision.user_name}</span>
                          <span style={{fontSize:11,color:'var(--text3)'}}>{fmtDateTime(decision.created_at)}</span>
                        </div>
                        <div style={{fontSize:13,color:'var(--text2)'}}>{decision.message}</div>
                      </div>
                    ))
                  ) : (
                    <div style={{fontSize:13,color:'var(--text2)'}}>No briefing decisions recorded yet.</div>
                  )}
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                  <div>
                    <label style={{fontSize:12,color:'var(--text3)',fontFamily:'var(--font-mono)',marginBottom:6,display:'block'}}>Link Incident</label>
                    <div style={{display:'flex',gap:8}}>
                      <input value={linkTarget} onChange={e=>setLinkTarget(e.target.value)} placeholder="Incident ID" style={{flex:1,padding:10,borderRadius:8,border:'1px solid var(--border)',background:'var(--bg2)',color:'var(--text)'}} />
                      <button className="btn btn-ghost btn-sm" onClick={addLink}>Link</button>
                    </div>
                  </div>
                  <div>
                    <label style={{fontSize:12,color:'var(--text3)',fontFamily:'var(--font-mono)',marginBottom:6,display:'block'}}>Add Watcher</label>
                    <div style={{display:'flex',gap:8}}>
                      <input value={watcherEmail} onChange={e=>setWatcherEmail(e.target.value)} placeholder="Email address" style={{flex:1,padding:10,borderRadius:8,border:'1px solid var(--border)',background:'var(--bg2)',color:'var(--text)'}} />
                      <button className="btn btn-ghost btn-sm" onClick={addWatcher}>Add</button>
                    </div>
                  </div>
                </div>
              </div>
              <div style={{marginTop:16}}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  <div style={{padding:12,background:'var(--bg3)',borderRadius:12,border:'1px solid var(--border)'}}>
                    <div style={{fontSize:12,fontFamily:'var(--font-mono)',color:'var(--text3)',marginBottom:8}}>Linked Incidents</div>
                    {linkedIncidents.length === 0 ? (
                      <div style={{fontSize:13,color:'var(--text2)'}}>No linked incidents yet.</div>
                    ) : linkedIncidents.map(link => (
                      <div key={link.id} style={{marginBottom:10,paddingBottom:10,borderBottom:'1px solid var(--border)'}}>
                        <div style={{fontWeight:600,color:'var(--text)'}}>{link.id}</div>
                        <div style={{fontSize:12,color:'var(--text3)'}}>{link.title || 'No title available'}</div>
                        <div style={{marginTop:6,fontSize:11,color:'var(--text3)'}}>Status: {link.status || 'unknown'} · Severity: {link.severity || 'unknown'}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{padding:12,background:'var(--bg3)',borderRadius:12,border:'1px solid var(--border)'}}>
                    <div style={{fontSize:12,fontFamily:'var(--font-mono)',color:'var(--text3)',marginBottom:8}}>Stakeholders Watching</div>
                    {watchers.length===0 ? (
                      <div style={{fontSize:13,color:'var(--text2)'}}>No watchers assigned.</div>
                    ) : watchers.map((watch, idx) => (
                      <div key={idx} style={{marginBottom:10,paddingBottom:10,borderBottom: idx < watchers.length-1 ? '1px solid var(--border)' : 'none'}}>
                        <div style={{fontWeight:600,color:'var(--text)'}}>{watch.user_name || watch.email || 'Watcher'}</div>
                        <div style={{fontSize:12,color:'var(--text3)'}}>{watch.role || 'stakeholder'} · {watch.email || watch.user_id}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{marginTop:16}}>
                <div style={{fontSize:12,fontFamily:'var(--font-mono)',color:'var(--text3)',marginBottom:8}}>Recent Activity</div>
                {activityLoading ? (
                  <div style={{fontSize:13,color:'var(--text2)'}}>Loading activity…</div>
                ) : activity.length===0 ? (
                  <div style={{fontSize:13,color:'var(--text2)'}}>No activity captured yet.</div>
                ) : activity.slice(0,5).map(item => (
                  <div key={item.id || item.created_at} style={{marginBottom:12,padding:10,background:'var(--bg2)',borderRadius:10}}>
                    <div style={{display:'flex',justifyContent:'space-between',gap:8,marginBottom:6}}>
                      <span style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>{item.user_name}</span>
                      <span style={{fontSize:11,color:'var(--text3)'}}>{fmtDateTime(item.created_at)}</span>
                    </div>
                    <div style={{fontSize:12,color:'var(--text2)'}}>{item.action.replace(/_/g,' ')}</div>
                    {item.metadata?.comment_id && <div style={{fontSize:11,color:'var(--text3)',marginTop:6}}>Comment added</div>}
                    {item.metadata?.linked_incident_id && <div style={{fontSize:11,color:'var(--text3)',marginTop:6}}>Linked incident {item.metadata.linked_incident_id}</div>}
                    {item.metadata?.watcher_id && <div style={{fontSize:11,color:'var(--text3)',marginTop:6}}>Watcher added ({item.metadata.watcher_id})</div>}
                  </div>
                ))}
              </div>
            </div>

              <div style={{marginTop:20}}>
                <SocioTechnicalTagger 
                  incidentId={id} 
                  initialData={incident.socio_technical} 
                  onSave={() => load()}
                />
              </div>

            {/* NEW: GAME THEORY ADVISOR */}
            {isAnalyst && incident.status !== 'closed' && (
              <div style={{marginTop:20}}>
                <GameTheoryAdvisor 
                  incidentId={id}
                  incidentSeverity={incident.severity}
                />
              </div>
            )}

            {/* NEW: DEFENSIVE ROUTINES */}
            {isAnalyst && incident.status !== 'closed' && (
              <div style={{marginTop:20}}>
                <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',padding:24}}>
                  <h3 style={{fontFamily:'var(--font-mono)',fontSize:16,marginBottom:16,color:'var(--text)'}}>
                    🎯 Defensive Routines
                  </h3>
                  <DefensiveRoutinesPanel 
                    incidentId={id}
                    onRoutineApplied={() => load()}
                  />
                </div>
              </div>
            )}
          </div>

          <div>
            {isAnalyst&&(
              <div className="card" style={{marginBottom:16}}>
                <div style={{fontSize:12,fontFamily:'var(--font-mono)',color:'var(--text3)',textTransform:'uppercase',letterSpacing:1,marginBottom:12}}>Update Status</div>
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  {STATUSES.map(s=>(
                    <button key={s} onClick={()=>updateStatus(s)} disabled={updating||incident.status===s}
                      className={'btn btn-sm '+(incident.status===s?'btn-primary':'btn-ghost')} style={{justifyContent:'flex-start'}}>
                      {incident.status===s&&<span style={{marginRight:6}}>▸</span>}{s.charAt(0).toUpperCase()+s.slice(1)}
                      {(s==='resolved'||s==='closed')&&incident.status!==s&&<span style={{marginLeft:'auto',fontSize:10,color:'var(--accent)',opacity:0.8}}>+ capture</span>}
                    </button>
                  ))}
                </div>
                <div style={{marginTop:12, padding:'10px 12px', background:'var(--bg3)', borderRadius:'var(--radius)', fontSize:12}}>
                  <div style={{fontWeight:600, marginBottom:4}}>Major Incident Toggle</div>
                  <div style={{color:'var(--text2)', marginBottom:8}}>Enable for high-impact incidents requiring video briefing and team mobilization.</div>
                  <button 
                    className={`btn btn-sm ${incident.is_major ? 'btn-primary' : 'btn-ghost'}`} 
                    onClick={async () => {
                      await api.put('/incidents/' + id, { is_major: !incident.is_major });
                      load();
                      loadActivity();
                    }}
                    disabled={updating}
                  >
                    {incident.is_major ? '★ Major Incident Active' : '☆ Mark as Major Incident'}
                  </button>
                </div>
                {isCloseable&&(
                  <div style={{marginTop:12,padding:'10px 12px',background:'var(--kalro-green-glow)',border:'1px solid rgba(46,125,50,0.3)',borderRadius:'var(--radius)',fontSize:12,color:'var(--kalro-green-light)'}}>
                    <div style={{fontWeight:600,marginBottom:4}}>◈ Capture knowledge</div>
                    <div style={{color:'var(--text2)',marginBottom:8}}>Document lessons learned to prevent recurrence.</div>
                    <button className="btn btn-primary btn-sm" style={{width:'100%',justifyContent:'center'}} onClick={()=>incident.operational_test_id?navigate('/operational-testing'):setShowCapture(true)}>{incident.operational_test_id?'Capture lesson in test':'Document lessons'}</button>
                  </div>
                )}
                <div style={{marginTop:12}}>
                  <button className="btn btn-ghost btn-sm" style={{width:'100%',justifyContent:'center'}} onClick={()=>navigate('/incidents/'+id+'/pir')}>
                    {isCloseable?'View / Create PIR':'Start PIR (post-incident review)'}
                  </button>
                </div>
              </div>
            )}

            {incident.status==='closed' && user?.role==='super_admin' && incident.applied_defensive_routines?.length > 0 && (
              <div className="card" style={{marginBottom:16}}>
                <div style={{fontSize:12,fontFamily:'var(--font-mono)',color:'var(--text3)',textTransform:'uppercase',letterSpacing:1,marginBottom:12}}>Routine Review</div>
                <div style={{fontSize:13,color:'var(--text2)',marginBottom:12}}>Super Admin review is required after incident closure to update payoff and institutional knowledge ratings.</div>
                {reviewError && <div className="alert alert-error" style={{marginBottom:12}}>{reviewError}</div>}
                {reviewSuccess && <div className="alert alert-success" style={{marginBottom:12}}>{reviewSuccess}</div>}
                {incident.applied_defensive_routines.map(routine => (
                  <div key={routine.knowledge_id} style={{padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:8}}>
                      <div>
                        <div style={{fontWeight:600,color:'var(--text)'}}>{routine.title}</div>
                        <div style={{fontSize:12,color:'var(--text3)'}}>Applied at {new Date(routine.applied_at).toLocaleString('en-KE')}</div>
                      </div>
                      <button className="btn btn-sm btn-ghost" onClick={()=>{ setSelectedReview(routine); setReviewScore(0.8); setReviewNotes(''); setReviewError(''); setReviewSuccess('') }}>
                        Rate this routine
                      </button>
                    </div>
                    {selectedReview?.knowledge_id === routine.knowledge_id && (
                      <div style={{padding:'12px',background:'var(--bg3)',borderRadius:8}}>
                        <div style={{marginBottom:10}}>
                          <label style={{fontSize:11,color:'var(--text3)',fontFamily:'var(--font-mono)',display:'block',marginBottom:4}}>Effectiveness rating</label>
                          <input type="range" min="0" max="1" step="0.05" value={reviewScore} onChange={e=>setReviewScore(Number(e.target.value))} style={{width:'100%'}} />
                          <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'var(--text3)',marginTop:4}}>
                            <span>Poor</span><span>Excellent</span>
                          </div>
                        </div>
                        <div className="form-group" style={{marginBottom:10}}>
                          <label style={{fontSize:11,color:'var(--text3)',fontFamily:'var(--font-mono)',display:'block',marginBottom:4}}>Comments (optional)</label>
                          <textarea rows={3} value={reviewNotes} onChange={e=>setReviewNotes(e.target.value)} style={{width:'100%',padding:'10px',borderRadius:8,border:'1px solid var(--border)',background:'var(--bg2)',color:'var(--text)'}} />
                        </div>
                        <button className="btn btn-primary btn-sm" disabled={reviewing} onClick={()=>submitRoutineReview(routine)} style={{width:'100%'}}>
                          {reviewing ? 'Saving...' : 'Save review'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="card">
              <div style={{fontSize:12,fontFamily:'var(--font-mono)',color:'var(--text3)',textTransform:'uppercase',letterSpacing:1,marginBottom:12}}>Details</div>
              {[{l:'Reported by',v:incident.reporter_name},{l:'Assigned to',v:incident.assignee_name},{l:'Logged',v:fmtDate(incident.created_at)},{l:'Updated',v:fmtDate(incident.updated_at)},{l:'SLA Deadline',v:incident.sla_deadline?new Date(incident.sla_deadline).toLocaleString('en-KE',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'—'},{l:'Incident ID',v:incident.id}].map(({l,v})=>(
                <div key={l} style={{marginBottom:12}}>
                  <div style={{fontSize:11,color:'var(--text3)',fontFamily:'var(--font-mono)',marginBottom:2}}>{l}</div>
                  <div style={{fontSize:14,color:'var(--text)'}}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {showCapture&&<CaptureModal incident={incident} onClose={()=>setShowCapture(false)} onSaved={handleCaptured}/>}
      {inviteModal&&(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setInviteModal(false)}>
          <div className="modal" style={{maxWidth:500}}>
            <div className="modal-header"><h2>Invite Team to War Room</h2><button className="modal-close" onClick={()=>setInviteModal(false)}>×</button></div>
            <div className="alert alert-info" style={{marginBottom:16}}>Select experts to invite to this incident's collaboration and video briefing.</div>
            <div style={{maxHeight:300, overflowY:'auto', marginBottom:16}}>
              {availableUsers.map(u => (
                <div key={u.id} style={{display:'flex', alignItems:'center', gap:8, padding:'8px 0', borderBottom:'1px solid var(--border)'}}>
                  <input
                    type="checkbox"
                    checked={selectedUsers.includes(u.id)}
                    onChange={e => {
                      if (e.target.checked) {
                        setSelectedUsers(prev => [...prev, u.id])
                      } else {
                        setSelectedUsers(prev => prev.filter(id => id !== u.id))
                      }
                    }}
                  />
                  <div>
                    <div style={{fontWeight:600}}>{u.name}</div>
                    <div style={{fontSize:12, color:'var(--text3)'}}>{u.email} • {u.role} • {u.station_id || 'Hub'}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={()=>setInviteModal(false)}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={inviting || selectedUsers.length === 0} onClick={inviteUsers}>
                {inviting ? 'Inviting...' : `Invite ${selectedUsers.length} User${selectedUsers.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
