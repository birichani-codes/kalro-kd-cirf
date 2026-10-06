import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api/axios'
import { Badge, Tags, ConfidenceBadge, Loading, fmtDate, KTypeBadge } from '../components/Shared'
import { useAuth } from '../context/AuthContext'

export default function KnowledgeDetail() {
  const { id }=useParams(), navigate=useNavigate(), [sp]=useSearchParams(), { isAnalyst, isAdmin }=useAuth()
  const operationalTestId=sp.get('operational_test_id')||''
  const incidentId=sp.get('incident_id')||''
  const returnTo=sp.get('return_to')||''
  const guided=Boolean(operationalTestId)
  const [entry,setEntry]=useState(null), [loading,setLoading]=useState(true)
  const [note,setNote]=useState(''), [annotating,setAnnotating]=useState(false)
  const [showVersionModal,setShowVersionModal]=useState(false)
  const [vForm,setVForm]=useState({title:'',content:'',tags:''})

  const load=()=>{ setLoading(true); api.get('/knowledge/'+id).then(r=>setEntry(r.data)).finally(()=>setLoading(false)) }
  useEffect(()=>{ load() },[id])

  const handleUse=async()=>{ await api.post('/knowledge/'+id+'/use'); load() }
  const selectForOperationalTest=async()=>{
    await api.post(`/operational-tests/${operationalTestId}/knowledge/select`,{knowledge_id:id})
    navigate(`/knowledge?operational_test_id=${encodeURIComponent(operationalTestId)}&incident_id=${encodeURIComponent(incidentId)}&return_to=${encodeURIComponent(returnTo||`/operational-testing?test=${operationalTestId}`)}`)
  }
  const handleAnnotate=async(e)=>{ e.preventDefault(); setAnnotating(true); await api.post('/knowledge/'+id+'/annotate',{note}); setNote(''); load(); setAnnotating(false) }
  const handleRetire=async()=>{ if(!confirm('Retire this entry?')) return; await api.put('/knowledge/'+id,{status:'retired'}); load() }
  const handlePublish=async()=>{ if(!confirm('Publish this validated draft as active institutional knowledge?')) return; await api.put('/knowledge/'+id,{status:'active'}); load() }
  const handleNewVersion=async(e)=>{ e.preventDefault(); const tags=vForm.tags.split(',').map(t=>t.trim()).filter(Boolean); const r=await api.put('/knowledge/'+id,{new_version:true,title:vForm.title||entry.title,content:vForm.content||entry.content,tags:tags.length?tags:entry.tags}); setShowVersionModal(false); navigate('/knowledge/'+r.data.id) }

  if(loading) return <Loading/>
  if(!entry) return <div className="page-body"><div className="alert alert-error">Entry not found</div></div>

  return (
    <div>
      <div className="page-header">
        <div style={{paddingBottom:20}}>
          <div style={{fontSize:12,color:'var(--text3)',fontFamily:'var(--font-mono)',marginBottom:8}}><span style={{cursor:'pointer',color:'var(--accent)'}} onClick={()=>navigate(guided?`/knowledge?operational_test_id=${encodeURIComponent(operationalTestId)}&incident_id=${encodeURIComponent(incidentId)}&return_to=${encodeURIComponent(returnTo||`/operational-testing?test=${operationalTestId}`)}`:'/knowledge')}>Knowledge</span> / {entry.id}</div>
          <div className="flex-between">
            <div>
              <h1 style={{marginBottom:8}}>{entry.title}</h1>
              <div className="flex gap-2" style={{flexWrap:'wrap',alignItems:'center'}}>
                <KTypeBadge type={entry.knowledge_type}/><Badge value={entry.status}/>
                <span style={{fontFamily:'var(--font-mono)',fontSize:12,color:'var(--text3)'}}>v{entry.version}</span>
                <Tags tags={entry.tags}/>
              </div>
            </div>
            <div className="flex gap-2">
              {guided&&entry.status==='active'&&<button className="btn btn-primary btn-sm" onClick={selectForOperationalTest}>Add to response set</button>}{guided&&entry.status!=='active'&&<span className="tag">Not validated for operational use</span>}{isAdmin&&entry.status==='draft'&&<button className="btn btn-primary btn-sm" onClick={handlePublish}>Publish knowledge</button>}
              {!guided&&<button className="btn btn-ghost btn-sm" onClick={handleUse}>Mark Used</button>}
              {isAnalyst&&entry.status==='active'&&<>
                <button className="btn btn-ghost btn-sm" onClick={()=>{setVForm({title:entry.title,content:entry.content,tags:entry.tags.join(', ')});setShowVersionModal(true)}}>New Version</button>
                <button className="btn btn-danger btn-sm" onClick={handleRetire}>Retire</button>
              </>}
            </div>
          </div>
        </div>
      </div>
      <div className="page-body">
        {guided&&<div className="alert alert-info" style={{marginBottom:14}}>Review this entry. If it is relevant, add it to the response set. You can then continue selecting related knowledge before returning to the operational test.</div>}
        <div style={{display:'grid',gridTemplateColumns:'1fr 280px',gap:20}}>
          <div>
            <div className="card" style={{marginBottom:16}}>
              <div style={{display:'flex',alignItems:'center',gap:24}}>
                <div style={{flex:1}}><div style={{fontSize:11,fontFamily:'var(--font-mono)',color:'var(--text3)',marginBottom:6,textTransform:'uppercase',letterSpacing:1}}>Confidence</div><ConfidenceBadge score={entry.confidence_score}/></div>
                <div style={{textAlign:'center'}}><div style={{fontSize:11,fontFamily:'var(--font-mono)',color:'var(--text3)',marginBottom:4}}>Used</div><div style={{fontSize:24,fontFamily:'var(--font-mono)',fontWeight:700,color:'var(--kalro-green-light)'}}>{entry.use_count}</div></div>
                <div style={{textAlign:'center'}}><div style={{fontSize:11,fontFamily:'var(--font-mono)',color:'var(--text3)',marginBottom:4}}>Last Used</div><div style={{fontSize:13,color:'var(--text2)'}}>{fmtDate(entry.last_used_at)}</div></div>
              </div>
            </div>
            <div className="card" style={{marginBottom:16}}><div className="section-header"><h2>Content</h2></div><div className="knowledge-content">{entry.content}</div></div>
            <div className="card">
              <div className="section-header"><h2>Annotations ({entry.annotations?.length||0})</h2></div>
              {entry.annotations?.length===0&&<p style={{color:'var(--text3)',fontSize:13,marginBottom:16}}>No annotations yet.</p>}
              {entry.annotations?.map(a=>(
                <div key={a.id} className="annotation">
                  <div className="annotation-meta">{a.user_name} · {fmtDate(a.created_at)}</div>
                  <p>{a.note}</p>
                </div>
              ))}
              {isAnalyst&&<form onSubmit={handleAnnotate} style={{marginTop:16}}>
                <textarea rows={3} value={note} onChange={e=>setNote(e.target.value)} placeholder="Add context, corrections, or lessons from using this entry..." style={{marginBottom:8}}/>
                <button type="submit" className="btn btn-ghost btn-sm" disabled={!note.trim()||annotating}>{annotating?'Adding...':'+ Add Annotation'}</button>
              </form>}
            </div>
          </div>
          <div>
            <div className="card" style={{marginBottom:16}}>
              <div style={{fontSize:12,fontFamily:'var(--font-mono)',color:'var(--text3)',textTransform:'uppercase',letterSpacing:1,marginBottom:12}}>Details</div>
              {[{l:'Contributor',v:entry.contributor_name},{l:'Type',v:entry.knowledge_type},{l:'Version',v:'v'+entry.version},{l:'Status',v:entry.status},{l:'Created',v:fmtDate(entry.created_at)},{l:'Linked Incident',v:entry.incident_id||'—'}].map(({l,v})=>(
                <div key={l} style={{marginBottom:12}}><div style={{fontSize:11,color:'var(--text3)',fontFamily:'var(--font-mono)',marginBottom:2}}>{l}</div><div style={{fontSize:14,color:'var(--text)'}}>{v}</div></div>
              ))}
            </div>
            {entry.version_history?.length>1&&<div className="card">
              <div style={{fontSize:12,fontFamily:'var(--font-mono)',color:'var(--text3)',textTransform:'uppercase',letterSpacing:1,marginBottom:12}}>Version History</div>
              {entry.version_history.map(v=>(
                <div key={v.id} onClick={()=>navigate('/knowledge/'+v.id)} style={{padding:'8px 0',borderBottom:'1px solid var(--border)',cursor:'pointer',opacity:v.id===entry.id?1:0.6}}>
                  <div style={{fontSize:13,color:v.id===entry.id?'var(--kalro-green-light)':'var(--text)'}}>v{v.version} {v.id===entry.id&&'(current)'}</div>
                  <div style={{fontSize:11,color:'var(--text3)',fontFamily:'var(--font-mono)'}}>{fmtDate(v.created_at)}</div>
                  <Badge value={v.status}/>
                </div>
              ))}
            </div>}
          </div>
        </div>
      </div>
      {showVersionModal&&<div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowVersionModal(false)}>
        <div className="modal" style={{maxWidth:640}}>
          <div className="modal-header"><h2>Create New Version</h2><button className="modal-close" onClick={()=>setShowVersionModal(false)}>×</button></div>
          <div className="alert alert-info">Creates v{entry.version+1} and marks the current as superseded.</div>
          <form onSubmit={handleNewVersion}>
            <div className="form-group"><label className="form-label">Title</label><input value={vForm.title} onChange={e=>setVForm(f=>({...f,title:e.target.value}))}/></div>
            <div className="form-group"><label className="form-label">Content</label><textarea rows={8} value={vForm.content} onChange={e=>setVForm(f=>({...f,content:e.target.value}))}/></div>
            <div className="form-group"><label className="form-label">Tags</label><input value={vForm.tags} onChange={e=>setVForm(f=>({...f,tags:e.target.value}))}/></div>
            <div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={()=>setShowVersionModal(false)}>Cancel</button><button type="submit" className="btn btn-primary">Create v{entry.version+1}</button></div>
          </form>
        </div>
      </div>}
    </div>
  )
}
