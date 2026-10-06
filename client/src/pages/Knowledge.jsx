import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api/axios'
import { Badge, ConfidenceBadge, Tags, Loading, EmptyState, KTypeBadge } from '../components/Shared'
import { useAuth } from '../context/AuthContext'

const K_TYPES=['lessons-learned','playbook','runbook','reference']

export default function Knowledge() {
  const [entries,setEntries]=useState([]), [loading,setLoading]=useState(true)
  const [showModal,setShowModal]=useState(false)
  const [form,setForm]=useState({title:'',content:'',tags:'',incident_id:'',knowledge_type:'lessons-learned'})
  const [incidents,setIncidents]=useState([]), [submitting,setSubmitting]=useState(false), [error,setError]=useState('')
  const [statusFilter,setStatusFilter]=useState(''), [typeFilter,setTypeFilter]=useState(''), [query,setQuery]=useState(''), [selecting,setSelecting]=useState(''), [selectedIds,setSelectedIds]=useState([])
  const navigate=useNavigate(), [sp]=useSearchParams(), { isAnalyst }=useAuth()
  const operationalTestId=sp.get('operational_test_id')||''
  const incidentId=sp.get('incident_id')||''
  const returnTo=sp.get('return_to')||''
  const guided=Boolean(operationalTestId)

  const load=()=>{
    setLoading(true)
    const p=new URLSearchParams()
    if(statusFilter) p.set('status',statusFilter)
    if(typeFilter) p.set('knowledge_type',typeFilter)
    api.get('/knowledge?'+p).then(r=>setEntries(r.data)).finally(()=>setLoading(false))
  }
  useEffect(()=>{ load() },[statusFilter,typeFilter])
  useEffect(()=>{ api.get('/incidents').then(r=>setIncidents(r.data)) },[])
  useEffect(()=>{ if(sp.get('q')) setQuery(sp.get('q')) },[])
  useEffect(()=>{ if(guided) api.get(`/operational-tests/${operationalTestId}`).then(r=>setSelectedIds(r.data.selected_knowledge_ids||[])).catch(()=>{}) },[operationalTestId])

  const filteredEntries=(()=>{
    if(!query.trim()) return entries
    const tokens=query.toLowerCase().split(/[^a-z0-9@.-]+/).filter(t=>t.length>2)
    return entries.map(k=>{const hay=[k.id,k.title,k.content,...(k.tags||[])].join(' ').toLowerCase();return {k,score:tokens.reduce((n,t)=>n+(hay.includes(t)?1:0),0)}}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||b.k.confidence_score-a.k.confidence_score).map(x=>x.k)
  })()

  const selectRelevant=async(entry)=>{
    if(!operationalTestId) return navigate('/knowledge/'+entry.id)
    setSelecting(entry.id); setError('')
    try{
      const r=await api.post(`/operational-tests/${operationalTestId}/knowledge/select`,{knowledge_id:entry.id})
      setSelectedIds(r.data.selected_knowledge_ids||[...new Set([...selectedIds,entry.id])])
    }catch(err){setError(err.response?.data?.error||'Failed to add knowledge')}finally{setSelecting('')}
  }
  const removeSelected=async(id)=>{
    setSelecting(id); setError('')
    try{const r=await api.post(`/operational-tests/${operationalTestId}/knowledge/remove`,{knowledge_id:id});setSelectedIds(r.data.selected_knowledge_ids||[])}
    catch(err){setError(err.response?.data?.error||'Failed to remove knowledge')}finally{setSelecting('')}
  }
  const returnToTest=()=>navigate(returnTo||`/operational-testing?test=${encodeURIComponent(operationalTestId)}`)
  const noSuitableKnowledge=async()=>{
    if(!operationalTestId) return
    setSelecting('none'); setError('')
    try{ await api.post(`/operational-tests/${operationalTestId}/knowledge/not-found`,{notes:`Search: ${query}`}); returnToTest() }
    catch(err){setError(err.response?.data?.error||'Failed to record search result')}finally{setSelecting('')}
  }

  const handleCreate=async(e)=>{ e.preventDefault(); setSubmitting(true); setError('')
    try{ await api.post('/knowledge',{...form,tags:form.tags.split(',').map(t=>t.trim()).filter(Boolean)}); setShowModal(false); setForm({title:'',content:'',tags:'',incident_id:'',knowledge_type:'lessons-learned'}); load() }
    catch(err){ setError(err.response?.data?.error||'Failed') }finally{ setSubmitting(false) }
  }

  return (
    <div>
      <div className="page-header">
        <div className="flex-between" style={{paddingBottom:20}}>
          <div><h1>Knowledge Base</h1><p>{guided?'Find the most relevant institutional response for the active incident':'Institutional knowledge — playbooks, runbooks, and lessons learned'}</p></div>
          {isAnalyst&&<button className="btn btn-primary" onClick={()=>setShowModal(true)}>+ Add Entry</button>}
        </div>
      </div>
      <div className="page-body">
        {error&&<div className="alert alert-error" style={{marginBottom:12}}>{error}</div>}
        {guided&&<div className="card" style={{marginBottom:16,borderLeft:'3px solid var(--accent)'}}>
          <div className="flex-between" style={{gap:12,alignItems:'flex-start',flexWrap:'wrap'}}><div><div style={{fontWeight:700}}>Build the incident knowledge set</div><div style={{fontSize:12,color:'var(--text3)',marginTop:4}}>Incident {incidentId||'linked'} · Test {operationalTestId}. Add every relevant entry you need. You can review several items before returning to confirm the final set.</div></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button className="btn btn-ghost btn-sm" onClick={noSuitableKnowledge} disabled={selecting==='none'||selectedIds.length>0}>{selecting==='none'?'Recording...':'No suitable knowledge found'}</button><button className="btn btn-primary btn-sm" onClick={returnToTest} disabled={!selectedIds.length}>Review selected knowledge ({selectedIds.length})</button></div></div>
          {selectedIds.length>0&&<div style={{display:'flex',gap:7,flexWrap:'wrap',marginTop:12}}>{selectedIds.map(id=><span key={id} className="tag" style={{display:'inline-flex',gap:6,alignItems:'center'}}>{id}<button type="button" onClick={()=>removeSelected(id)} disabled={selecting===id} style={{background:'transparent',color:'inherit',fontWeight:700}}>×</button></span>)}</div>}
        </div>}
        <div className="form-group" style={{marginBottom:14}}><label className="form-label">Search knowledge</label><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="phishing credential compromise, mailbox, suspicious login..."/></div>
        <div style={{display:'flex',gap:10,marginBottom:20,flexWrap:'wrap'}}>
          {['','draft','active','superseded','retired'].map(s=>(
            <button key={s} className={'btn btn-sm '+(statusFilter===s?'btn-primary':'btn-ghost')} onClick={()=>setStatusFilter(s)}>{s||'All'}</button>
          ))}
          <div style={{width:1,background:'var(--border)',margin:'0 4px'}}/>
          {K_TYPES.map(t=>(
            <button key={t} className={'btn btn-sm '+(typeFilter===t?'btn-primary':'btn-ghost')} onClick={()=>setTypeFilter(typeFilter===t?'':t)}>{t}</button>
          ))}
        </div>
        {loading?<Loading/>:filteredEntries.length===0?<EmptyState icon="◈" title="No knowledge entries" sub="Capture institutional knowledge from resolved incidents."/>:(
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            {filteredEntries.map(k=>(
              <div key={k.id} className="card" style={{transition:'border-color 0.15s'}}
                onMouseEnter={e=>e.currentTarget.style.borderColor='var(--kalro-green)'} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
                <div className="flex-between mb-3">
                  <div style={{flex:1,paddingRight:12}}>
                    <h3 style={{fontWeight:600,fontSize:15,color:'var(--text)',marginBottom:4}}>{k.title}</h3>
                    <div style={{fontSize:12,color:'var(--text3)'}}>by {k.contributor_name} · v{k.version} · used {k.use_count}×</div>
                  </div>
                  <div style={{display:'flex',gap:6,alignItems:'center'}}><KTypeBadge type={k.knowledge_type}/><Badge value={k.status}/></div>
                </div>
                <div style={{marginBottom:10}}><ConfidenceBadge score={k.confidence_score}/></div>
                <Tags tags={k.tags}/>
                <p style={{fontSize:13,color:'var(--text3)',marginTop:8,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}}>{k.content}</p>
                <div className="flex-between" style={{marginTop:12,gap:8,flexWrap:'wrap'}}><span className="tag" style={{fontFamily:'var(--font-mono)'}}>Knowledge ID: {k.id}</span><div style={{display:'flex',gap:8}}><button className="btn btn-ghost btn-sm" onClick={()=>navigate(`/knowledge/${k.id}${guided?`?operational_test_id=${encodeURIComponent(operationalTestId)}&incident_id=${encodeURIComponent(incidentId)}&return_to=${encodeURIComponent(returnTo||`/operational-testing?test=${operationalTestId}`)}`:''}`)}>Review</button>{guided&&(k.status!=='active'?<span className="tag">Draft / not validated</span>:selectedIds.includes(k.id)?<button className="btn btn-ghost btn-sm" disabled={selecting===k.id} onClick={()=>removeSelected(k.id)}>Added ✓</button>:<button className="btn btn-primary btn-sm" disabled={Boolean(selecting)} onClick={()=>selectRelevant(k)}>{selecting===k.id?'Adding...':'Add to response set'}</button>)}</div></div>
              </div>
            ))}
          </div>
        )}
      </div>
      {showModal&&(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowModal(false)}>
          <div className="modal" style={{maxWidth:640}}>
            <div className="modal-header"><h2>Add Knowledge Entry</h2><button className="modal-close" onClick={()=>setShowModal(false)}>×</button></div>
            {error&&<div className="alert alert-error">{error}</div>}
            <form onSubmit={handleCreate}>
              <div className="form-group"><label className="form-label">Title *</label><input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="e.g. Ransomware Containment Playbook" required/></div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Knowledge Type</label>
                  <select value={form.knowledge_type} onChange={e=>setForm(f=>({...f,knowledge_type:e.target.value}))}>
                    <option value="lessons-learned">Lessons Learned</option>
                    <option value="playbook">Playbook</option>
                    <option value="runbook">Runbook</option>
                    <option value="reference">Reference</option>
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Link to Incident</label>
                  <select value={form.incident_id} onChange={e=>setForm(f=>({...f,incident_id:e.target.value}))}>
                    <option value="">— None —</option>{incidents.map(i=><option key={i.id} value={i.id}>{i.title}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group"><label className="form-label">Content *</label><textarea rows={8} value={form.content} onChange={e=>setForm(f=>({...f,content:e.target.value}))} placeholder="Document steps, lessons learned, mitigation techniques..." required/></div>
              <div className="form-group"><label className="form-label">Tags (comma-separated)</label><input value={form.tags} onChange={e=>setForm(f=>({...f,tags:e.target.value}))} placeholder="phishing, email, credentials"/></div>
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={()=>setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting?'Saving...':'Save Entry'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
