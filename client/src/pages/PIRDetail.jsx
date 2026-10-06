import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { Loading, fmtDate, fmtDateTime } from '../components/Shared'
import { useAuth } from '../context/AuthContext'

export default function PIRDetail() {
  const { id }=useParams(), navigate=useNavigate(), { isAnalyst }=useAuth()
  const [pir,setPIR]=useState(null), [incident,setIncident]=useState(null), [loading,setLoading]=useState(true)
  const [form,setForm]=useState({ timeline:'', root_cause:'', five_whys:['','','','',''], what_worked:'', what_failed:'', action_items:[], participants:'' })
  const [saving,setSaving]=useState(false), [error,setError]=useState(''), [success,setSuccess]=useState('')

  useEffect(()=>{
    Promise.all([api.get('/incidents/'+id), api.get('/pir').catch(()=>({data:[]}))]).then(([incR,pirR])=>{
      setIncident(incR.data)
      const existing=pirR.data.find(p=>p.incident_id===id)
      if(existing){ setPIR(existing); setForm({ timeline:existing.timeline, root_cause:existing.root_cause, five_whys:existing.five_whys.length===5?existing.five_whys:['','','','',''], what_worked:existing.what_worked, what_failed:existing.what_failed, action_items:existing.action_items, participants:existing.participants.join(', ') }) }
    }).finally(()=>setLoading(false))
  },[id])

  const handleSave=async(e)=>{
    e.preventDefault(); setSaving(true); setError(''); setSuccess('')
    try{
      const payload={ incident_id:id, timeline:form.timeline, root_cause:form.root_cause, five_whys:form.five_whys.filter(w=>w.trim()), what_worked:form.what_worked, what_failed:form.what_failed, action_items:form.action_items, participants:form.participants.split(',').map(p=>p.trim()).filter(Boolean) }
      if(pir) await api.put('/pir/'+pir.id,payload); else await api.post('/pir',payload)
      setSuccess('PIR saved successfully.'); setTimeout(()=>setSuccess(''),3000)
    }catch(err){ setError(err.response?.data?.error||'Failed to save') }finally{ setSaving(false) }
  }

  const addAction=()=>setForm(f=>({...f,action_items:[...f.action_items,{id:'ai'+Date.now(),action:'',owner:'',due:'',done:false}]}))
  const updateAction=(idx,field,val)=>setForm(f=>({...f,action_items:f.action_items.map((a,i)=>i===idx?{...a,[field]:val}:a)}))

  if(loading) return <Loading/>

  return (
    <div>
      <div className="page-header">
        <div style={{paddingBottom:20}}>
          <div style={{fontSize:12,color:'var(--text3)',fontFamily:'var(--font-mono)',marginBottom:8}}>
            <span style={{cursor:'pointer',color:'var(--accent)'}} onClick={()=>navigate('/incidents')}>Incidents</span>{' / '}
            <span style={{cursor:'pointer',color:'var(--accent)'}} onClick={()=>navigate('/incidents/'+id)}>{incident?.title||id}</span>{' / '}PIR
          </div>
          <h1>Post-Incident Review</h1>
          <p>Blameless review — focus on system improvement, not blame</p>
        </div>
      </div>
      <div className="page-body">
        <div className="alert alert-info" style={{marginBottom:20}}>
          Per KALRO IRP: PIRs should be completed within 24–48 hours of incident resolution. Use the Five Whys technique to trace root causes. All action items must be specific, actionable, and have a named owner.
        </div>
        {error&&<div className="alert alert-error">{error}</div>}
        {success&&<div className="alert alert-success">✓ {success}</div>}

        <form onSubmit={handleSave}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,marginBottom:20}}>
            <div className="card">
              <div className="section-header"><h2>Incident Timeline</h2></div>
              <textarea rows={10} value={form.timeline} onChange={e=>setForm(f=>({...f,timeline:e.target.value}))} placeholder={"09:15 — Incident first reported\n09:45 — Initial triage completed\n10:30 — Root cause identified\n11:00 — Mitigation applied\n14:00 — Incident closed"} style={{fontSize:13}}/>
            </div>
            <div className="card">
              <div className="section-header"><h2>Root Cause Summary *</h2></div>
              <textarea rows={5} value={form.root_cause} onChange={e=>setForm(f=>({...f,root_cause:e.target.value}))} placeholder="Summarize the fundamental root cause of this incident..." required/>
              <div style={{marginTop:16}}>
                <div style={{fontSize:12,fontFamily:'var(--font-mono)',color:'var(--text3)',textTransform:'uppercase',letterSpacing:1,marginBottom:10}}>Five Whys Analysis</div>
                {form.five_whys.map((why,i)=>(
                  <div key={i} style={{marginBottom:10}}>
                    <div style={{fontSize:11,color:'var(--kalro-green-light)',fontFamily:'var(--font-mono)',marginBottom:4}}>Why {i+1}?</div>
                    <input value={why} onChange={e=>setForm(f=>({...f,five_whys:f.five_whys.map((w,j)=>j===i?e.target.value:w)}))} placeholder={"Because..."}/>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,marginBottom:20}}>
            <div className="card">
              <div className="section-header"><h2>What Worked Well</h2></div>
              <textarea rows={6} value={form.what_worked} onChange={e=>setForm(f=>({...f,what_worked:e.target.value}))} placeholder="What detection, response, or communication worked well?"/>
            </div>
            <div className="card">
              <div className="section-header"><h2>What Failed / Could Improve</h2></div>
              <textarea rows={6} value={form.what_failed} onChange={e=>setForm(f=>({...f,what_failed:e.target.value}))} placeholder="What detection gaps, process failures, or delays occurred?"/>
            </div>
          </div>

          <div className="card" style={{marginBottom:20}}>
            <div className="section-header">
              <h2>Action Items</h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={addAction}>+ Add Action</button>
            </div>
            {form.action_items.length===0&&<div style={{color:'var(--text3)',fontSize:13,padding:'8px 0'}}>No action items yet. Add at least one to prevent recurrence.</div>}
            {form.action_items.map((a,i)=>(
              <div key={a.id} className={a.done?'action-item done':'action-item'}>
                <input type="checkbox" checked={a.done} onChange={e=>updateAction(i,'done',e.target.checked)} style={{width:'auto',marginTop:4,accentColor:'var(--kalro-green)'}}/>
                <div style={{flex:1}}>
                  <input value={a.action} onChange={e=>updateAction(i,'action',e.target.value)} placeholder="Action: start with a verb, e.g. Enable DMARC enforcement on kalro.org" className="action-text"/>
                  <div style={{display:'flex',gap:8,marginTop:6}}>
                    <input value={a.owner} onChange={e=>updateAction(i,'owner',e.target.value)} placeholder="Owner" style={{flex:1,fontSize:12,padding:'4px 8px'}}/>
                    <input type="date" value={a.due} onChange={e=>updateAction(i,'due',e.target.value)} style={{flex:1,fontSize:12,padding:'4px 8px'}}/>
                  </div>
                </div>
                <button type="button" onClick={()=>setForm(f=>({...f,action_items:f.action_items.filter((_,j)=>j!==i)}))} style={{background:'none',color:'var(--text3)',fontSize:18,padding:'0 6px'}}>×</button>
              </div>
            ))}
          </div>

          <div className="card" style={{marginBottom:20}}>
            <div className="section-header"><h2>Participants</h2></div>
            <input value={form.participants} onChange={e=>setForm(f=>({...f,participants:e.target.value}))} placeholder="Names or email addresses of PIR attendees, comma-separated"/>
          </div>

          <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
            <button type="button" className="btn btn-ghost" onClick={()=>navigate('/incidents/'+id)}>Back to Incident</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving?'Saving...':pir?'Update PIR':'Create PIR'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
