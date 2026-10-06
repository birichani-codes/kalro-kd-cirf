import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api/axios'
import { Badge, Loading, EmptyState, timeAgo, SlaIndicator } from '../components/Shared'
import { useAuth } from '../context/AuthContext'

const TYPES=['phishing','ransomware','ddos','unauthorized_access','malware','data_exfiltration','other']
const SEVS=['critical','high','medium','low']
const FALLBACK_STATIONS=['Headquarters','Muguga','Kiboko','Mtwapa','Kabati']

export default function Incidents() {
  const [incidents,setIncidents]=useState([]), [loading,setLoading]=useState(true)
  const [showModal,setShowModal]=useState(false)
  const [filters,setFilters]=useState({status:'',severity:'',type:'',is_major:''})
  const [form,setForm]=useState({title:'',type:'phishing',severity:'medium',description:'',entities:'',affected_user:'',source_ip:'',email_sender:'',email_subject:'',suspicious_url:'',detection_source:'Identity / sign-in monitoring',impacted_service:'Email and identity services',is_major:false,station_id:'',operational_test_id:''})
  const [activeTests,setActiveTests]=useState([])
  const [stations,setStations]=useState(FALLBACK_STATIONS.map(name=>({name,label:`KALRO ${name}`})))
  const [directoryUsers,setDirectoryUsers]=useState([])
  const [submitting,setSubmitting]=useState(false), [error,setError]=useState('')
  const [streamStatus, setStreamStatus] = useState('connecting')
  const navigate=useNavigate(), { isAnalyst, user }=useAuth()
  const [sp]=useSearchParams()

  // Real-time incident streaming via EventSource
  useEffect(() => {
    let eventSource = null;
    
    const startStream = () => {
      try {
        const token = localStorage.getItem('token');
        const streamUrl = token ? `/api/incidents/stream?token=${encodeURIComponent(token)}` : '/api/incidents/stream';
        eventSource = new EventSource(streamUrl);

        eventSource.addEventListener('message', (e) => {
          try {
            const msg = JSON.parse(e.data);
            if (msg.type === 'initial') {
              // Load initial incidents
              setIncidents(msg.data);
              setStreamStatus('connected');
              setLoading(false);
            } else if (msg.type === 'new_incidents') {
              // Add new incidents to the top
              setIncidents(prev => [...msg.data, ...prev]);
            }
          } catch (err) {
            console.error('Failed to parse SSE message:', err);
          }
        });

        eventSource.addEventListener('error', (e) => {
          console.error('EventSource error:', e);
          setStreamStatus('disconnected');
          eventSource?.close();
          // Reconnect after 3 seconds
          setTimeout(startStream, 3000);
        });

      } catch (err) {
        console.error('Failed to start event stream:', err);
        setStreamStatus('error');
        // Fallback to polling
        setTimeout(startStream, 5000);
      }
    };

    startStream();
    return () => eventSource?.close();
  }, []);

  useEffect(()=>{ if(isAnalyst) api.get('/operational-tests').then(r=>setActiveTests(r.data.filter(t=>t.status==='active'))).catch(()=>{}) },[isAnalyst])
  useEffect(()=>{
    api.get('/stations').then(r=>setStations(r.data||[])).catch(()=>{})
    if(isAnalyst) api.get('/auth/users').then(r=>setDirectoryUsers(r.data||[])).catch(()=>{})
  },[isAnalyst])
  useEffect(()=>{ if(!form.station_id){ const preferred=user?.station_id||stations[0]?.name||''; if(preferred) setForm(f=>({...f,station_id:preferred})) } },[stations,user])

  // Guided operational-test workflow: Inject Incident opens this form already linked
  // to the active tabletop session, then returns to Operational Testing after save.
  useEffect(()=>{
    const testId=sp.get('operational_test_id')
    if(sp.get('create')!=='1'||!testId||!isAnalyst) return
    api.get('/operational-tests/'+testId).then(r=>{
      const t=r.data, d=t.scenario_definition?.incident_defaults||{}
      setForm(f=>({
        ...f, title:d.title||t.scenario_name||f.title, type:d.type||t.scenario_definition?.incident_type||f.type,
        severity:d.severity||t.scenario_definition?.default_severity||f.severity, description:d.description||t.scenario_definition?.description||f.description,
        affected_user:d.affected_user||t.scenario_definition?.affected_user?.email||'', source_ip:d.source_ip||t.alert_context?.source_ip||'',
        email_sender:d.email_sender||t.scenario_definition?.phishing_email?.from_address||'', email_subject:d.email_subject||t.scenario_definition?.phishing_email?.subject||'',
        suspicious_url:d.suspicious_url||t.scenario_definition?.phishing_email?.suspicious_url||'', station_id:t.station_id||f.station_id, operational_test_id:testId
      }))
      setShowModal(true)
    }).catch(()=>{ setForm(f=>({...f,operational_test_id:testId})); setShowModal(true) })
  },[isAnalyst])

  useEffect(()=>{
    const init={status:sp.get('status')||'',severity:sp.get('severity')||'',type:'',is_major:sp.get('is_major')||'',station_id:sp.get('station_id')||''}
    setFilters(init)
  },[])

  // Filter incidents client-side
  const filteredIncidents = incidents.filter(i => {
    if(filters.status && i.status !== filters.status) return false
    if(filters.severity && i.severity !== filters.severity) return false
    if(filters.type && i.type !== filters.type) return false
    if(filters.station_id && i.station_id !== filters.station_id) return false
    if(filters.is_major && !i.is_major) return false
    return true
  })

  const handleCreate=async(e)=>{
    e.preventDefault(); setSubmitting(true); setError('')
    try{
      const ips=form.entities.split(',').map(s=>s.trim()).filter(Boolean)
      const entities={...(ips.length?{ips}:{}),...(form.affected_user?{affected_user:form.affected_user}:{}),...(form.source_ip?{source_ip:form.source_ip}:{}),...(form.email_sender?{email_sender:form.email_sender}:{}),...(form.email_subject?{email_subject:form.email_subject}:{}),...(form.suspicious_url?{suspicious_url:form.suspicious_url}:{})}
      const r=await api.post('/incidents',{...form,entities,is_major:form.is_major,station_id:form.station_id})
      setShowModal(false); setForm({title:'',type:'phishing',severity:'medium',description:'',entities:'',affected_user:'',source_ip:'',email_sender:'',email_subject:'',suspicious_url:'',detection_source:'Identity / sign-in monitoring',impacted_service:'Email and identity services',is_major:false,station_id:user?.station_id||stations[0]?.name||'',operational_test_id:''})
      const returnTo=sp.get('return_to')
      if(returnTo) navigate(returnTo)
      else if(r.data?.id) navigate('/incidents/'+r.data.id)
    }catch(err){ setError(err.response?.data?.error||'Failed') }finally{ setSubmitting(false) }
  }

  return (
    <div>
      <div className="page-header">
        <div className="flex-between" style={{paddingBottom:20}}>
          <div><h1>Incidents</h1><p>Track, investigate, and resolve security incidents</p></div>
          {isAnalyst && <button className="btn btn-primary" onClick={()=>setShowModal(true)}>+ Log Incident</button>}
        </div>
      </div>
      <div className="page-body">
        <div style={{display:'flex',gap:10,marginBottom:20,flexWrap:'wrap',alignItems:'center'}}>
          <div style={{fontSize:12,color:'var(--text3)',fontFamily:'var(--font-mono)'}}>
            Stream: <span style={{color:streamStatus==='connected'?'var(--kalro-green)':streamStatus==='connecting'?'var(--yellow)':'var(--kalro-red)'}}>{streamStatus}</span>
          </div>
          {[{key:'status',opts:['','open','investigating','escalated','resolved','closed'],label:'All Statuses'},
            {key:'severity',opts:['',...SEVS],label:'All Severities'},
            {key:'type',opts:['',...TYPES],label:'All Types'}].map(({key,opts,label})=>(
            <select key={key} value={filters[key]} onChange={e=>setFilters(f=>({...f,[key]:e.target.value}))} style={{width:'auto',minWidth:150}}><option value="">{label}</option>{opts.filter(Boolean).map(o=><option key={o} value={o}>{o.replace(/_/g,' ')}</option>)}</select>
          ))}
          <select value={filters.station_id || ''} onChange={e=>setFilters(f=>({...f,station_id:e.target.value}))} style={{width:'auto',minWidth:150}}>
            <option value="">All Stations</option>
            {stations.map(s=><option key={s.id||s.name} value={s.name}>{s.label||s.name}</option>)}
          </select>
          <button className={filters.is_major?'btn btn-sm btn-primary':'btn btn-sm btn-ghost'} onClick={()=>setFilters(f=>({...f,is_major:f.is_major?'':'true'}))}>★ Major only</button>
          {Object.values(filters).some(Boolean)&&<button className="btn btn-ghost btn-sm" onClick={()=>setFilters({status:'',severity:'',type:'',is_major:''})}>Clear</button>}
        </div>

        {loading?<Loading/>:filteredIncidents.length===0?<EmptyState icon="⚡" title="No incidents found" sub="Try changing filters or log a new incident"/>:(
          <div className="card" style={{padding:0,overflow:'hidden'}}>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Title</th><th>Type</th><th>Site</th><th>Severity</th><th>Status</th><th>SLA</th><th>Reported</th></tr></thead>
                <tbody>
                  {filteredIncidents.map(inc=>(
                    <tr key={inc.id} onClick={()=>navigate('/incidents/'+inc.id)}>
                      <td style={{maxWidth:260}}>
                        <div style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',display:'flex',alignItems:'center',gap:6}}>
                          {inc.is_major&&<span style={{color:'var(--kalro-red-light)',fontSize:12}}>★</span>}
                          <span style={{color:'var(--text)',fontWeight:500}}>{inc.title}</span>
                        </div>
                      </td>
                      <td><span className="tag">{inc.type?.replace(/_/g,' ')}</span></td>
                      <td style={{fontSize:12,color:'var(--text3)',fontFamily:'var(--font-mono)'}}>{inc.site||inc.station_id||'Headquarters'}</td>
                      <td><Badge value={inc.severity}/></td>
                      <td><Badge value={inc.status}/></td>
                      <td><SlaIndicator inc={inc}/></td>
                      <td style={{color:'var(--text3)',fontFamily:'var(--font-mono)',fontSize:12}}>{timeAgo(inc.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showModal&&(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowModal(false)}>
          <div className="modal">
            <div className="modal-header"><h2>Log New Incident</h2><button className="modal-close" onClick={()=>setShowModal(false)}>×</button></div>
            {error&&<div className="alert alert-error">{error}</div>}
            <form onSubmit={handleCreate}>
              <div className="form-group"><label className="form-label">Title *</label><input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="Brief incident description" required/></div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Type *</label><select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>{TYPES.map(t=><option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}</select></div>
                <div className="form-group"><label className="form-label">Severity *</label><select value={form.severity} onChange={e=>setForm(f=>({...f,severity:e.target.value}))}>{SEVS.map(s=><option key={s} value={s}>{s}</option>)}</select></div>
              </div>
              <div className="form-group"><label className="form-label">Description</label><textarea rows={4} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="What happened..."/></div>
              {(form.type==='phishing'||form.operational_test_id)&&<div style={{padding:'12px 14px',border:'1px solid var(--border)',borderRadius:8,background:'var(--bg3)',marginBottom:14}}>
                <div style={{fontWeight:600,fontSize:13,marginBottom:10}}>Account / email evidence</div>
                <div className="form-row"><div className="form-group"><label className="form-label">Affected KALRO account</label><select value={form.affected_user} onChange={e=>{const account=directoryUsers.find(u=>u.email===e.target.value);setForm(f=>({...f,affected_user:e.target.value,station_id:account?.station_id||f.station_id}))}}><option value="">Select account</option>{directoryUsers.filter(u=>!form.station_id||!u.station_id||u.station_id===form.station_id).map(u=><option key={u.id} value={u.email}>{u.name} — {u.email}{u.station_id?` (${u.station_id})`:''}</option>)}</select></div><div className="form-group"><label className="form-label">Suspicious source IP</label><input value={form.source_ip} onChange={e=>setForm(f=>({...f,source_ip:e.target.value}))} placeholder="203.0.113.24"/></div></div>
                <div className="form-row"><div className="form-group"><label className="form-label">Email sender</label><input value={form.email_sender} onChange={e=>setForm(f=>({...f,email_sender:e.target.value}))}/></div><div className="form-group"><label className="form-label">Email subject</label><input value={form.email_subject} onChange={e=>setForm(f=>({...f,email_subject:e.target.value}))}/></div></div>
                <div className="form-group"><label className="form-label">Suspicious URL</label><input value={form.suspicious_url} onChange={e=>setForm(f=>({...f,suspicious_url:e.target.value}))}/></div><div className="form-row"><div className="form-group"><label className="form-label">Detection source</label><select value={form.detection_source} onChange={e=>setForm(f=>({...f,detection_source:e.target.value}))}><option>Identity / sign-in monitoring</option><option>Email security gateway</option><option>User report</option><option>SIEM correlation</option><option>Endpoint security</option><option>Network monitoring</option></select></div><div className="form-group"><label className="form-label">Impacted service</label><select value={form.impacted_service} onChange={e=>setForm(f=>({...f,impacted_service:e.target.value}))}><option>Email and identity services</option><option>Endpoint workstation</option><option>Research systems</option><option>Shared files / collaboration</option><option>Network services</option><option>Other</option></select></div></div>
              </div>}
              <div className="form-group"><label className="form-label">Affected IPs / Hosts</label><input value={form.entities} onChange={e=>setForm(f=>({...f,entities:e.target.value}))} placeholder="192.168.1.1, ws-admin-01"/></div>
              <div className="form-group"><label className="form-label">Station / site *</label><select required value={form.station_id} onChange={e=>setForm(f=>({...f,station_id:e.target.value,affected_user:''}))}><option value="">Select station</option>{stations.map(s=><option key={s.id||s.name} value={s.name}>{s.label||s.name}</option>)}</select></div>
              <div className="form-group"><label className="form-label">Operational Test (optional)</label><select value={form.operational_test_id} onChange={e=>setForm(f=>({...f,operational_test_id:e.target.value}))}><option value="">Normal incident</option>{activeTests.map(t=><option key={t.id} value={t.id}>{t.scenario_name} — {t.participant_label}</option>)}</select></div>
              <div className="form-group">
                <label style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer'}}>
                  <input type="checkbox" checked={form.is_major} onChange={e=>setForm(f=>({...f,is_major:e.target.checked}))} style={{width:'auto'}}/>
                  <span className="form-label" style={{margin:0}}>Mark as Major Incident (requires MIT involvement)</span>
                </label>
              </div>
              {form.is_major&&<div className="alert alert-warning" style={{marginBottom:0}}>Major incidents alert all analysts and require senior leadership involvement per KALRO IRP.</div>}
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={()=>setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting?'Logging...':'Log Incident'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
