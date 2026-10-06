const fs = require('fs');
const path = require('path');
function write(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✓', filePath);
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────

write('client/src/pages/Login.jsx', `import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const [email,setEmail]=useState(''), [password,setPassword]=useState(''), [error,setError]=useState(''), [loading,setLoading]=useState(false)
  const { login }=useAuth(), navigate=useNavigate()
  const submit=async(e)=>{ e.preventDefault(); setError(''); setLoading(true); try{ await login(email,password); navigate('/') }catch(err){ setError(err.response?.data?.error||'Login failed') }finally{ setLoading(false) } }
  const fill=(e,em)=>{ e.preventDefault(); setEmail(em); setPassword('password') }

  return (
    <div style={{minHeight:'100vh',background:'var(--bg)',display:'flex',alignItems:'center',justifyContent:'center',padding:20,position:'relative',overflow:'hidden'}}>
      <div style={{position:'absolute',inset:0,opacity:0.035,backgroundImage:'linear-gradient(var(--border) 1px,transparent 1px),linear-gradient(90deg,var(--border) 1px,transparent 1px)',backgroundSize:'40px 40px'}}/>
      <div style={{position:'absolute',top:'15%',left:'50%',transform:'translateX(-50%)',width:600,height:400,background:'radial-gradient(ellipse,rgba(46,125,50,0.07) 0%,transparent 70%)',pointerEvents:'none'}}/>
      <div style={{width:'100%',maxWidth:440,position:'relative'}}>
        {/* KALRO brand header */}
        <div style={{textAlign:'center',marginBottom:32}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:10,marginBottom:10}}>
            <div style={{width:10,height:44,background:'var(--kalro-green)',borderRadius:3}}/>
            <div style={{width:10,height:44,background:'var(--kalro-red)',borderRadius:3}}/>
            <div style={{fontFamily:'var(--font-mono)',fontSize:32,fontWeight:700,color:'var(--kalro-green-light)',letterSpacing:5}}>KALRO</div>
          </div>
          <div style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--text3)',letterSpacing:2,textTransform:'uppercase'}}>Cybersecurity Incident Response Framework</div>
          <div style={{marginTop:12,height:1,background:'linear-gradient(90deg,transparent,var(--kalro-green),var(--kalro-red),transparent)',opacity:0.5}}/>
        </div>
        <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',padding:36}}>
          <h2 style={{fontFamily:'var(--font-mono)',fontSize:15,marginBottom:24,color:'var(--text)'}}>Sign in to continue</h2>
          {error && <div className="alert alert-error">{error}</div>}
          <form onSubmit={submit}>
            <div className="form-group"><label className="form-label">Email</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@kalro.org" required/></div>
            <div className="form-group"><label className="form-label">Password</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required/></div>
            <button type="submit" className="btn btn-primary" style={{width:'100%',justifyContent:'center',padding:'12px',marginTop:8}} disabled={loading}>{loading?'Signing in...':'Sign In'}</button>
          </form>
        </div>
        <div style={{marginTop:18,background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',padding:'16px 20px'}}>
          <div style={{fontSize:11,fontFamily:'var(--font-mono)',color:'var(--text3)',textTransform:'uppercase',letterSpacing:1,marginBottom:12}}>Demo Accounts (password: <code style={{color:'var(--text2)'}}>password</code>)</div>
          {[{label:'Super Admin',email:'alice@kalro.org',color:'var(--kalro-green-light)'},{label:'Analyst',email:'brian@kalro.org',color:'var(--accent)'},{label:'Viewer',email:'carol@kalro.org',color:'var(--yellow)'}].map(({label,email:em,color})=>(
            <button key={em} onClick={e=>fill(e,em)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',width:'100%',background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:6,padding:'8px 12px',marginBottom:6,cursor:'pointer',color:'var(--text2)',fontSize:13,transition:'border-color 0.15s'}}
              onMouseEnter={e=>e.currentTarget.style.borderColor=color} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
              <span style={{fontFamily:'var(--font-mono)',color,fontSize:12}}>{label}</span>
              <span style={{color:'var(--text3)',fontSize:12}}>{em}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
`);

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

write('client/src/pages/Dashboard.jsx', `import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { Badge, Loading, timeAgo, SlaIndicator } from '../components/Shared'
import { useAuth } from '../context/AuthContext'

const SEV = { critical:'var(--kalro-red-light)', high:'var(--orange)', medium:'var(--yellow)', low:'var(--green)' }

function CoverageBar({ rate }) {
  const color = rate>=80?'var(--kalro-green)':rate>=50?'var(--yellow)':'var(--kalro-red)'
  const label = rate>=80?'Good':rate>=50?'At risk':'Critical'
  return (
    <div style={{display:'flex',alignItems:'center',gap:10}}>
      <div style={{flex:1,height:8,background:'var(--bg4)',borderRadius:4,overflow:'hidden'}}>
        <div style={{width:rate+'%',height:'100%',background:color,borderRadius:4,transition:'width 0.6s ease'}}/>
      </div>
      <span style={{fontFamily:'var(--font-mono)',fontSize:13,color,minWidth:36}}>{rate}%</span>
      <span style={{fontSize:12,color,background:color+'22',padding:'2px 8px',borderRadius:4,border:'1px solid '+color+'44'}}>{label}</span>
    </div>
  )
}

function ConfPip({ score }) {
  const pct=Math.round(score*100), color=pct>=80?'var(--kalro-green)':pct>=50?'var(--yellow)':'var(--kalro-red-light)'
  return <div style={{display:'flex',alignItems:'center',gap:6}}>
    <div style={{width:60,height:4,background:'var(--bg4)',borderRadius:2}}><div style={{width:pct+'%',height:'100%',background:color,borderRadius:2}}/></div>
    <span style={{fontFamily:'var(--font-mono)',fontSize:11,color}}>{pct}%</span>
  </div>
}

export default function Dashboard() {
  const [data,setData]=useState(null), [loading,setLoading]=useState(true)
  const navigate=useNavigate(), { user }=useAuth()
  useEffect(()=>{ api.get('/reports/dashboard').then(r=>setData(r.data)).finally(()=>setLoading(false)) },[])
  if (loading) return <Loading/>
  const { summary,by_severity,by_status,coverage_rate,uncovered_gaps,weak_entries,
          escalated_incidents,major_incidents,sla_breached,recent_incidents,top_knowledge,metrics } = data

  const hov=(e)=>{ e.currentTarget.style.paddingLeft='6px' }
  const hout=(e)=>{ e.currentTarget.style.paddingLeft='0' }
  const row={ padding:'11px 0',borderBottom:'1px solid var(--border)',cursor:'pointer',transition:'padding 0.15s' }

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Welcome back, {user?.name} — {new Date().toLocaleDateString('en-KE',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</p>
      </div>
      <div className="page-body">

        {/* Major incident alert */}
        {major_incidents.length>0 && (
          <div className="alert-major" style={{borderRadius:'var(--radius)',padding:'14px 20px',marginBottom:20,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div>
              <div style={{fontFamily:'var(--font-mono)',fontWeight:700,fontSize:13,marginBottom:4}}>⚠ {major_incidents.length} MAJOR INCIDENT{major_incidents.length>1?'S':''} ACTIVE</div>
              <div style={{fontSize:13,color:'var(--text2)'}}>{major_incidents.map(i=>i.title).join(' · ')}</div>
            </div>
            <button className="btn btn-sm" style={{background:'var(--kalro-red)',color:'#fff',whiteSpace:'nowrap'}} onClick={()=>navigate('/incidents?is_major=true')}>View Major</button>
          </div>
        )}

        {/* SLA breach alert */}
        {sla_breached.length>0 && (
          <div className="alert alert-error" style={{marginBottom:20}}>
            ⏱ {sla_breached.length} incident{sla_breached.length>1?'s':''} have breached SLA deadlines — {sla_breached.map(i=>i.title).join(', ')}
          </div>
        )}

        {/* Stats */}
        <div className="stats-grid" style={{gridTemplateColumns:'repeat(auto-fit,minmax(155px,1fr))',marginBottom:20}}>
          <div className="stat-card green" onClick={()=>navigate('/incidents')} style={{cursor:'pointer'}}>
            <div className="stat-label">Total Incidents</div>
            <div className="stat-value">{summary.total_incidents}</div>
            <div className="stat-sub">{summary.open_incidents} active</div>
          </div>
          <div className="stat-card red" onClick={()=>navigate('/incidents?is_major=true')} style={{cursor:'pointer'}}>
            <div className="stat-label">Major Incidents</div>
            <div className="stat-value">{summary.major_incidents}</div>
            <div className="stat-sub">requiring MIT</div>
          </div>
          <div className="stat-card orange">
            <div className="stat-label">SLA Breached</div>
            <div className="stat-value">{sla_breached.length}</div>
            <div className="stat-sub">overdue incidents</div>
          </div>
          <div className="stat-card accent">
            <div className="stat-label">Knowledge</div>
            <div className="stat-value">{summary.active_knowledge}</div>
            <div className="stat-sub">active entries</div>
          </div>
          <div className="stat-card yellow">
            <div className="stat-label">PIR Completion</div>
            <div className="stat-value">{summary.pir_completion_rate}%</div>
            <div className="stat-sub">{summary.pir_count} reviews done</div>
          </div>
          <div className="stat-card green">
            <div className="stat-label">Avg Confidence</div>
            <div className="stat-value">{Math.round(summary.avg_confidence*100)}%</div>
            <div className="stat-sub">knowledge health</div>
          </div>
        </div>

        {/* Coverage bar */}
        <div className="card" style={{marginBottom:20,borderLeft:'3px solid '+(coverage_rate>=80?'var(--kalro-green)':coverage_rate>=50?'var(--yellow)':'var(--kalro-red)')}}>
          <div className="flex-between" style={{marginBottom:10}}>
            <div>
              <div style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--text3)',textTransform:'uppercase',letterSpacing:1,marginBottom:4}}>Knowledge Coverage Rate</div>
              <div style={{fontSize:13,color:'var(--text2)'}}>{data.gaps.filter(g=>g.covered).length} of {data.gaps.length} incident types have active knowledge</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={()=>navigate('/knowledge')}>Manage Knowledge</button>
          </div>
          <CoverageBar rate={coverage_rate}/>
        </div>

        {/* Row 2: gaps + weak + metrics */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,marginBottom:20}}>
          <div className="card">
            <div className="section-header">
              <h2>Knowledge Gaps</h2>
              <span style={{fontSize:12,color:'var(--kalro-red-light)',fontFamily:'var(--font-mono)'}}>{uncovered_gaps.length} uncovered</span>
            </div>
            {uncovered_gaps.length===0?<div style={{padding:'16px 0',textAlign:'center',color:'var(--green)',fontSize:13}}>✓ All types covered</div>:
              uncovered_gaps.map(g=>(
                <div key={g.type} onClick={()=>navigate('/knowledge')} style={row} onMouseEnter={hov} onMouseLeave={hout}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    <div>
                      <div style={{fontWeight:500,fontSize:14,color:'var(--text)',textTransform:'capitalize'}}>{g.type.replace(/_/g,' ')}</div>
                      <div style={{fontSize:12,color:'var(--text3)'}}>{g.incident_count} incident{g.incident_count!==1?'s':''}{g.latest_incident?' · last '+timeAgo(g.latest_incident):''}</div>
                    </div>
                    <span style={{background:'var(--kalro-critical-bg)',color:'var(--kalro-red-light)',fontSize:11,fontFamily:'var(--font-mono)',padding:'2px 8px',borderRadius:4}}>NO COVERAGE</span>
                  </div>
                </div>
              ))
            }
          </div>

          <div className="card">
            <div className="section-header">
              <h2>Needs Review</h2>
              <span style={{fontSize:12,color:'var(--yellow)',fontFamily:'var(--font-mono)'}}>{weak_entries.length} below 60%</span>
            </div>
            {weak_entries.length===0?<div style={{padding:'16px 0',textAlign:'center',color:'var(--green)',fontSize:13}}>✓ All entries healthy</div>:
              weak_entries.map(k=>(
                <div key={k.id} onClick={()=>navigate('/knowledge/'+k.id)} style={row} onMouseEnter={hov} onMouseLeave={hout}>
                  <div style={{fontWeight:500,fontSize:13,color:'var(--text)',marginBottom:6,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{k.title}</div>
                  <div style={{display:'flex',alignItems:'center',gap:10}}><ConfPip score={k.confidence_score}/><span style={{fontSize:11,color:'var(--text3)'}}>used {k.use_count}× · v{k.version}</span></div>
                </div>
              ))
            }
          </div>
        </div>

        {/* Row 3: escalated + SLA metrics */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,marginBottom:20}}>
          <div className="card">
            <div className="section-header">
              <h2>Escalated — No Knowledge</h2>
              <button className="btn btn-ghost btn-sm" onClick={()=>navigate('/incidents?status=escalated')}>View all</button>
            </div>
            {escalated_incidents.length===0?<div style={{padding:'16px 0',textAlign:'center',color:'var(--green)',fontSize:13}}>✓ No escalated incidents</div>:
              escalated_incidents.map(inc=>(
                <div key={inc.id} onClick={()=>navigate('/incidents/'+inc.id)} style={row} onMouseEnter={hov} onMouseLeave={hout}>
                  <div className="flex-between mb-3"><span style={{fontWeight:500,fontSize:14,color:'var(--text)'}}>{inc.title}</span><Badge value={inc.severity}/></div>
                  <div style={{display:'flex',alignItems:'center',gap:8,fontSize:12,color:'var(--text3)'}}><SlaIndicator inc={inc}/><span>·</span><span>{inc.reporter_name}</span></div>
                </div>
              ))
            }
          </div>

          <div className="card">
            <div className="section-header"><h2>SLA Performance</h2></div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:12,color:'var(--text3)',marginBottom:6,fontFamily:'var(--font-mono)'}}>SLA BREACH RATE (ACTIVE)</div>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <div style={{flex:1,height:8,background:'var(--bg4)',borderRadius:4}}><div style={{width:metrics.sla_breach_rate+'%',height:'100%',background:metrics.sla_breach_rate>30?'var(--kalro-red)':metrics.sla_breach_rate>10?'var(--yellow)':'var(--kalro-green)',borderRadius:4}}/></div>
                <span style={{fontFamily:'var(--font-mono)',fontSize:13,color:metrics.sla_breach_rate>30?'var(--kalro-red-light)':metrics.sla_breach_rate>10?'var(--yellow)':'var(--green)'}}>{metrics.sla_breach_rate}%</span>
              </div>
            </div>
            <div className="section-header" style={{marginTop:12}}><h2>Time to Resolve (Percentiles)</h2></div>
            {Object.entries(metrics.ttr_by_severity||{}).length===0?<div style={{fontSize:13,color:'var(--text3)'}}>No resolved incidents yet</div>:
              Object.entries(metrics.ttr_by_severity).map(([sev,d])=>(
                <div key={sev} style={{padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    <span style={{fontFamily:'var(--font-mono)',fontSize:11,textTransform:'uppercase',color:SEV[sev]||'var(--text3)',minWidth:64}}>{sev}</span>
                    <span style={{fontSize:12,color:'var(--text2)'}}>p50: {d.p50_min<60?d.p50_min+'m':Math.round(d.p50_min/60)+'h'}</span>
                    <span style={{fontSize:12,color:'var(--text3)'}}>p90: {d.p90_min<60?d.p90_min+'m':Math.round(d.p90_min/60)+'h'}</span>
                    <span style={{fontSize:11,color:'var(--text3)'}}>{d.count} closed</span>
                  </div>
                </div>
              ))
            }
          </div>
        </div>

        {/* Row 4: recent + top knowledge */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
          <div className="card">
            <div className="section-header"><h2>Recent Incidents</h2><button className="btn btn-ghost btn-sm" onClick={()=>navigate('/incidents')}>View all</button></div>
            {recent_incidents.map(inc=>(
              <div key={inc.id} onClick={()=>navigate('/incidents/'+inc.id)} style={row} onMouseEnter={hov} onMouseLeave={hout}>
                <div className="flex-between mb-3">
                  <span style={{fontWeight:500,fontSize:14,color:'var(--text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:200}}>
                    {inc.is_major && <span style={{color:'var(--kalro-red-light)',marginRight:4}}>★</span>}{inc.title}
                  </span>
                  <Badge value={inc.severity}/>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'var(--text3)'}}>
                  <Badge value={inc.status}/><span>·</span><SlaIndicator inc={inc}/><span>·</span><span>{timeAgo(inc.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="section-header"><h2>Top Knowledge</h2><button className="btn btn-ghost btn-sm" onClick={()=>navigate('/knowledge')}>View all</button></div>
            {top_knowledge.map(k=>(
              <div key={k.id} onClick={()=>navigate('/knowledge/'+k.id)} style={row} onMouseEnter={hov} onMouseLeave={hout}>
                <div style={{fontWeight:500,fontSize:14,color:'var(--text)',marginBottom:6,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{k.title}</div>
                <div style={{display:'flex',alignItems:'center',gap:10}}><ConfPip score={k.confidence_score}/><span style={{fontSize:11,color:'var(--text3)'}}>{k.contributor_name} · used {k.use_count}×</span></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
`);

// ─── INCIDENTS LIST ───────────────────────────────────────────────────────────

write('client/src/pages/Incidents.jsx', `import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api/axios'
import { Badge, Loading, EmptyState, timeAgo, SlaIndicator } from '../components/Shared'
import { useAuth } from '../context/AuthContext'

const TYPES=['phishing','ransomware','ddos','unauthorized_access','malware','data_exfiltration','other']
const SEVS=['critical','high','medium','low']

export default function Incidents() {
  const [incidents,setIncidents]=useState([]), [loading,setLoading]=useState(true)
  const [showModal,setShowModal]=useState(false)
  const [filters,setFilters]=useState({status:'',severity:'',type:'',is_major:''})
  const [form,setForm]=useState({title:'',type:'phishing',severity:'medium',description:'',entities:'',is_major:false})
  const [submitting,setSubmitting]=useState(false), [error,setError]=useState('')
  const navigate=useNavigate(), { isAnalyst }=useAuth()
  const [sp]=useSearchParams()

  useEffect(()=>{
    const init={status:sp.get('status')||'',severity:sp.get('severity')||'',type:'',is_major:sp.get('is_major')||''}
    setFilters(init)
  },[])

  const load=()=>{
    setLoading(true)
    const p=new URLSearchParams()
    if(filters.status) p.set('status',filters.status)
    if(filters.severity) p.set('severity',filters.severity)
    if(filters.type) p.set('type',filters.type)
    if(filters.is_major) p.set('is_major','true')
    api.get('/incidents?'+p).then(r=>setIncidents(r.data)).finally(()=>setLoading(false))
  }
  useEffect(()=>{ load() },[filters])

  const handleCreate=async(e)=>{
    e.preventDefault(); setSubmitting(true); setError('')
    try{
      const ips=form.entities.split(',').map(s=>s.trim()).filter(Boolean)
      await api.post('/incidents',{...form,entities:ips.length?{ips}:{},is_major:form.is_major})
      setShowModal(false); setForm({title:'',type:'phishing',severity:'medium',description:'',entities:'',is_major:false}); load()
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
        <div style={{display:'flex',gap:10,marginBottom:20,flexWrap:'wrap'}}>
          {[{key:'status',opts:['','open','investigating','escalated','resolved','closed'],label:'All Statuses'},
            {key:'severity',opts:['',...SEVS],label:'All Severities'},
            {key:'type',opts:['',...TYPES],label:'All Types'}].map(({key,opts,label})=>(
            <select key={key} value={filters[key]} onChange={e=>setFilters(f=>({...f,[key]:e.target.value}))} style={{width:'auto',minWidth:150}}><option value="">{label}</option>{opts.filter(Boolean).map(o=><option key={o} value={o}>{o.replace(/_/g,' ')}</option>)}</select>
          ))}
          <button className={filters.is_major?'btn btn-sm btn-primary':'btn btn-sm btn-ghost'} onClick={()=>setFilters(f=>({...f,is_major:f.is_major?'':'true'}))}>★ Major only</button>
          {Object.values(filters).some(Boolean)&&<button className="btn btn-ghost btn-sm" onClick={()=>setFilters({status:'',severity:'',type:'',is_major:''})}>Clear</button>}
        </div>

        {loading?<Loading/>:incidents.length===0?<EmptyState icon="⚡" title="No incidents found" sub="Try changing filters or log a new incident"/>:(
          <div className="card" style={{padding:0,overflow:'hidden'}}>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Title</th><th>Type</th><th>Severity</th><th>Status</th><th>SLA</th><th>Reported</th></tr></thead>
                <tbody>
                  {incidents.map(inc=>(
                    <tr key={inc.id} onClick={()=>navigate('/incidents/'+inc.id)}>
                      <td style={{maxWidth:260}}>
                        <div style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',display:'flex',alignItems:'center',gap:6}}>
                          {inc.is_major&&<span style={{color:'var(--kalro-red-light)',fontSize:12}}>★</span>}
                          <span style={{color:'var(--text)',fontWeight:500}}>{inc.title}</span>
                        </div>
                      </td>
                      <td><span className="tag">{inc.type?.replace(/_/g,' ')}</span></td>
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
              <div className="form-group"><label className="form-label">Affected IPs / Hosts</label><input value={form.entities} onChange={e=>setForm(f=>({...f,entities:e.target.value}))} placeholder="192.168.1.1, ws-admin-01"/></div>
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
`);

// ─── INCIDENT DETAIL ──────────────────────────────────────────────────────────

write('client/src/pages/IncidentDetail.jsx', `import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { Badge, Tags, ConfidenceBadge, Loading, fmtDate, SlaIndicator, KTypeBadge } from '../components/Shared'
import { useAuth } from '../context/AuthContext'

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
          <div className="form-group"><label className="form-label">Content *</label><textarea rows={8} value={form.content} onChange={e=>setForm(f=>({...f,content:e.target.value}))} placeholder={"What happened\\nSteps that worked\\nWhat to avoid\\nKALRO-specific context (systems, contacts, configs)"} required/></div>
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
  const navigate=useNavigate(), { isAnalyst }=useAuth()

  const load=()=>{ setLoading(true); api.get('/incidents/'+id).then(r=>setIncident(r.data)).finally(()=>setLoading(false)) }
  useEffect(()=>{ load() },[id])

  const updateStatus=async(status)=>{ setUpdating(true); await api.put('/incidents/'+id,{status}); if((status==='resolved'||status==='closed')&&isAnalyst) setShowCapture(true); load(); setUpdating(false) }
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
              <button className="btn btn-ghost btn-sm" onClick={()=>navigate('/search')}>Search KB</button>
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
                    <button className="btn btn-ghost btn-sm" onClick={()=>navigate('/search')}>Search KB</button>
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
                  {isAnalyst&&<button className="btn btn-ghost btn-sm" style={{marginTop:8}} onClick={async(e)=>{e.stopPropagation();await api.post('/knowledge/'+k.id+'/use');load()}}>✓ Mark as used</button>}
                </div>
              ))}
            </div>
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
                {isCloseable&&(
                  <div style={{marginTop:12,padding:'10px 12px',background:'var(--kalro-green-glow)',border:'1px solid rgba(46,125,50,0.3)',borderRadius:'var(--radius)',fontSize:12,color:'var(--kalro-green-light)'}}>
                    <div style={{fontWeight:600,marginBottom:4}}>◈ Capture knowledge</div>
                    <div style={{color:'var(--text2)',marginBottom:8}}>Document lessons learned to prevent recurrence.</div>
                    <button className="btn btn-primary btn-sm" style={{width:'100%',justifyContent:'center'}} onClick={()=>setShowCapture(true)}>Document lessons</button>
                  </div>
                )}
                <div style={{marginTop:12}}>
                  <button className="btn btn-ghost btn-sm" style={{width:'100%',justifyContent:'center'}} onClick={()=>navigate('/incidents/'+id+'/pir')}>
                    {isCloseable?'View / Create PIR':'Start PIR (post-incident review)'}
                  </button>
                </div>
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
    </div>
  )
}
`);

// ─── PIR DETAIL ───────────────────────────────────────────────────────────────

write('client/src/pages/PIRDetail.jsx', `import { useState, useEffect } from 'react'
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
              <textarea rows={10} value={form.timeline} onChange={e=>setForm(f=>({...f,timeline:e.target.value}))} placeholder={"09:15 — Incident first reported\\n09:45 — Initial triage completed\\n10:30 — Root cause identified\\n11:00 — Mitigation applied\\n14:00 — Incident closed"} style={{fontSize:13}}/>
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
`);

// ─── KNOWLEDGE, KNOWLEDGE DETAIL, SEARCH, REPORTS, USERS ─────────────────────
// (These are the same functional pages, updated with KALRO colors and knowledge_type support)

write('client/src/pages/Knowledge.jsx', `import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { Badge, ConfidenceBadge, Tags, Loading, EmptyState, KTypeBadge } from '../components/Shared'
import { useAuth } from '../context/AuthContext'

const K_TYPES=['lessons-learned','playbook','runbook','reference']

export default function Knowledge() {
  const [entries,setEntries]=useState([]), [loading,setLoading]=useState(true)
  const [showModal,setShowModal]=useState(false)
  const [form,setForm]=useState({title:'',content:'',tags:'',incident_id:'',knowledge_type:'lessons-learned'})
  const [incidents,setIncidents]=useState([]), [submitting,setSubmitting]=useState(false), [error,setError]=useState('')
  const [statusFilter,setStatusFilter]=useState(''), [typeFilter,setTypeFilter]=useState('')
  const navigate=useNavigate(), { isAnalyst }=useAuth()

  const load=()=>{
    setLoading(true)
    const p=new URLSearchParams()
    if(statusFilter) p.set('status',statusFilter)
    if(typeFilter) p.set('knowledge_type',typeFilter)
    api.get('/knowledge?'+p).then(r=>setEntries(r.data)).finally(()=>setLoading(false))
  }
  useEffect(()=>{ load() },[statusFilter,typeFilter])
  useEffect(()=>{ api.get('/incidents').then(r=>setIncidents(r.data)) },[])

  const handleCreate=async(e)=>{ e.preventDefault(); setSubmitting(true); setError('')
    try{ await api.post('/knowledge',{...form,tags:form.tags.split(',').map(t=>t.trim()).filter(Boolean)}); setShowModal(false); setForm({title:'',content:'',tags:'',incident_id:'',knowledge_type:'lessons-learned'}); load() }
    catch(err){ setError(err.response?.data?.error||'Failed') }finally{ setSubmitting(false) }
  }

  return (
    <div>
      <div className="page-header">
        <div className="flex-between" style={{paddingBottom:20}}>
          <div><h1>Knowledge Base</h1><p>Institutional knowledge — playbooks, runbooks, and lessons learned</p></div>
          {isAnalyst&&<button className="btn btn-primary" onClick={()=>setShowModal(true)}>+ Add Entry</button>}
        </div>
      </div>
      <div className="page-body">
        <div style={{display:'flex',gap:10,marginBottom:20,flexWrap:'wrap'}}>
          {['','active','superseded','retired'].map(s=>(
            <button key={s} className={'btn btn-sm '+(statusFilter===s?'btn-primary':'btn-ghost')} onClick={()=>setStatusFilter(s)}>{s||'All'}</button>
          ))}
          <div style={{width:1,background:'var(--border)',margin:'0 4px'}}/>
          {K_TYPES.map(t=>(
            <button key={t} className={'btn btn-sm '+(typeFilter===t?'btn-primary':'btn-ghost')} onClick={()=>setTypeFilter(typeFilter===t?'':t)}>{t}</button>
          ))}
        </div>
        {loading?<Loading/>:entries.length===0?<EmptyState icon="◈" title="No knowledge entries" sub="Capture institutional knowledge from resolved incidents."/>:(
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            {entries.map(k=>(
              <div key={k.id} className="card" style={{cursor:'pointer',transition:'border-color 0.15s'}} onClick={()=>navigate('/knowledge/'+k.id)}
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
`);

write('client/src/pages/KnowledgeDetail.jsx', `import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { Badge, Tags, ConfidenceBadge, Loading, fmtDate, KTypeBadge } from '../components/Shared'
import { useAuth } from '../context/AuthContext'

export default function KnowledgeDetail() {
  const { id }=useParams(), navigate=useNavigate(), { isAnalyst }=useAuth()
  const [entry,setEntry]=useState(null), [loading,setLoading]=useState(true)
  const [note,setNote]=useState(''), [annotating,setAnnotating]=useState(false)
  const [showVersionModal,setShowVersionModal]=useState(false)
  const [vForm,setVForm]=useState({title:'',content:'',tags:''})

  const load=()=>{ setLoading(true); api.get('/knowledge/'+id).then(r=>setEntry(r.data)).finally(()=>setLoading(false)) }
  useEffect(()=>{ load() },[id])

  const handleUse=async()=>{ await api.post('/knowledge/'+id+'/use'); load() }
  const handleAnnotate=async(e)=>{ e.preventDefault(); setAnnotating(true); await api.post('/knowledge/'+id+'/annotate',{note}); setNote(''); load(); setAnnotating(false) }
  const handleRetire=async()=>{ if(!confirm('Retire this entry?')) return; await api.put('/knowledge/'+id,{status:'retired'}); load() }
  const handleNewVersion=async(e)=>{ e.preventDefault(); const tags=vForm.tags.split(',').map(t=>t.trim()).filter(Boolean); const r=await api.put('/knowledge/'+id,{new_version:true,title:vForm.title||entry.title,content:vForm.content||entry.content,tags:tags.length?tags:entry.tags}); setShowVersionModal(false); navigate('/knowledge/'+r.data.id) }

  if(loading) return <Loading/>
  if(!entry) return <div className="page-body"><div className="alert alert-error">Entry not found</div></div>

  return (
    <div>
      <div className="page-header">
        <div style={{paddingBottom:20}}>
          <div style={{fontSize:12,color:'var(--text3)',fontFamily:'var(--font-mono)',marginBottom:8}}><span style={{cursor:'pointer',color:'var(--accent)'}} onClick={()=>navigate('/knowledge')}>Knowledge</span> / {entry.id}</div>
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
              <button className="btn btn-ghost btn-sm" onClick={handleUse}>Mark Used</button>
              {isAnalyst&&entry.status==='active'&&<>
                <button className="btn btn-ghost btn-sm" onClick={()=>{setVForm({title:entry.title,content:entry.content,tags:entry.tags.join(', ')});setShowVersionModal(true)}}>New Version</button>
                <button className="btn btn-danger btn-sm" onClick={handleRetire}>Retire</button>
              </>}
            </div>
          </div>
        </div>
      </div>
      <div className="page-body">
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
`);

write('client/src/pages/Search.jsx', `import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { Badge, Tags, ConfidenceBadge, KTypeBadge } from '../components/Shared'

export default function Search() {
  const [query,setQuery]=useState(''), [results,setResults]=useState(null), [loading,setLoading]=useState(false), [type,setType]=useState('all')
  const navigate=useNavigate()
  const doSearch=async(e)=>{ e?.preventDefault(); if(!query.trim()||query.length<2) return; setLoading(true); try{ const r=await api.get('/search?q='+encodeURIComponent(query)+'&type='+type); setResults(r.data) }catch{} finally{ setLoading(false) } }
  return (
    <div>
      <div className="page-header"><h1>Search</h1><p>Search across incidents and institutional knowledge base</p></div>
      <div className="page-body">
        <div style={{marginBottom:24}}>
          <div style={{display:'flex',gap:10,marginBottom:10}}>
            <div style={{flex:1,position:'relative'}}>
              <span style={{position:'absolute',left:14,top:'50%',transform:'translateY(-50%)',color:'var(--text3)',fontFamily:'var(--font-mono)'}}>◎</span>
              <input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doSearch()} placeholder="Search incidents, knowledge entries, tags..." style={{paddingLeft:40,fontSize:16}}/>
            </div>
            <button className="btn btn-primary" onClick={doSearch} disabled={loading} style={{minWidth:100,justifyContent:'center'}}>{loading?'...':'Search'}</button>
          </div>
          <div style={{display:'flex',gap:8}}>
            {['all','knowledge','incident'].map(t=><button key={t} className={'btn btn-sm '+(type===t?'btn-primary':'btn-ghost')} onClick={()=>setType(t)}>{t.charAt(0).toUpperCase()+t.slice(1)}</button>)}
          </div>
        </div>
        {results===null&&!loading&&<div style={{textAlign:'center',padding:'60px 20px',color:'var(--text3)'}}>
          <div style={{fontSize:48,marginBottom:16,opacity:0.25}}>◎</div>
          <div style={{fontFamily:'var(--font-mono)',fontSize:14,marginBottom:8}}>Search the knowledge base</div>
          <div style={{fontSize:13}}>Try: "phishing", "ransomware", "DDoS", "credentials", "PowerShell"</div>
        </div>}
        {results?.total===0&&<div style={{textAlign:'center',padding:'60px 20px'}}>
          <div style={{fontFamily:'var(--font-mono)',fontSize:14,color:'var(--text2)',marginBottom:8}}>No results for "{results.query}"</div>
          <div style={{fontSize:13,color:'var(--text3)'}}>Consider capturing knowledge from a related resolved incident.</div>
        </div>}
        {results?.total>0&&<>
          <div style={{fontSize:12,fontFamily:'var(--font-mono)',color:'var(--text3)',marginBottom:16}}>{results.total} result{results.total!==1?'s':''} for "<span style={{color:'var(--kalro-green-light)'}}>{results.query}</span>"</div>
          {results.results.map(r=>(
            <div key={r.id} className="search-result" onClick={()=>navigate(r.result_type==='knowledge'?'/knowledge/'+r.id:'/incidents/'+r.id)}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                <div>
                  <div className="result-type">{r.result_type==='knowledge'?'◈ Knowledge Entry':'⚡ Incident'}</div>
                  <h3>{r.is_major&&<span style={{color:'var(--kalro-red-light)',marginRight:4}}>★</span>}{r.title}</h3>
                </div>
                <div style={{textAlign:'right',minWidth:120}}>
                  {r.result_type==='knowledge'?<><KTypeBadge type={r.knowledge_type}/><ConfidenceBadge score={r.relevance_score}/></>:<Badge value={r.severity}/>}
                </div>
              </div>
              <p>{r.result_type==='knowledge'?r.content:r.description}</p>
              {r.tags?.length>0&&<div style={{marginTop:8}}><Tags tags={r.tags}/></div>}
              {r.result_type==='knowledge'&&<div style={{marginTop:8,fontSize:12,color:'var(--text3)'}}>by {r.contributor_name} · used {r.use_count}×</div>}
            </div>
          ))}
        </>}
      </div>
    </div>
  )
}
`);

write('client/src/pages/Reports.jsx', `import { useState, useEffect } from 'react'
import api from '../api/axios'
import { Loading, fmtDate } from '../components/Shared'

export default function Reports() {
  const [summary,setSummary]=useState(null), [logs,setLogs]=useState([]), [loading,setLoading]=useState(true), [tab,setTab]=useState('overview')
  useEffect(()=>{ Promise.all([api.get('/reports/summary'),api.get('/reports/audit')]).then(([s,l])=>{ setSummary(s.data); setLogs(l.data) }).finally(()=>setLoading(false)) },[])
  if(loading) return <Loading/>
  const ACT={ LOGIN:'var(--kalro-green-light)', CREATE_INCIDENT:'var(--orange)', CREATE_KNOWLEDGE:'var(--kalro-green)', UPDATE_INCIDENT:'var(--yellow)', ANNOTATE_KNOWLEDGE:'var(--purple)', SEARCH:'var(--text3)', CREATE_USER:'var(--kalro-green-light)', DELETE_USER:'var(--kalro-red-light)', VERSION_KNOWLEDGE:'var(--accent)', USE_KNOWLEDGE:'var(--kalro-green)', CREATE_PIR:'var(--accent)', UPDATE_PIR:'var(--yellow)' }
  return (
    <div>
      <div className="page-header"><h1>Reports & Audit</h1><p>System analytics and full audit trail — admin only</p></div>
      <div className="page-body">
        <div className="tabs">
          <button className={'tab-btn '+(tab==='overview'?'active':'')} onClick={()=>setTab('overview')}>Overview</button>
          <button className={'tab-btn '+(tab==='audit'?'active':'')} onClick={()=>setTab('audit')}>Audit Log ({logs.length})</button>
        </div>
        {tab==='overview'&&summary&&(
          <div className="stats-grid">
            {[{l:'Total Incidents',v:summary.total_incidents,c:'green'},{l:'Open / Active',v:summary.open_incidents,c:'red'},{l:'Resolved',v:summary.resolved_incidents,c:'green'},{l:'Knowledge Entries',v:summary.total_knowledge,c:'accent'},{l:'Active Entries',v:summary.active_knowledge,c:'green'},{l:'Avg Confidence',v:Math.round(summary.avg_confidence*100)+'%',c:'yellow'},{l:'Total Users',v:summary.total_users,c:'green'},{l:'Audit Events',v:summary.total_audit_events,c:'accent'}].map(({l,v,c})=>(
              <div key={l} className={'stat-card '+c}><div className="stat-label">{l}</div><div className="stat-value">{v}</div></div>
            ))}
          </div>
        )}
        {tab==='audit'&&(
          <div className="card" style={{padding:0,overflow:'hidden'}}>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Action</th><th>User</th><th>Role</th><th>Target</th><th>Details</th><th>Time</th></tr></thead>
                <tbody>
                  {logs.map(l=>(
                    <tr key={l.id} style={{cursor:'default'}}>
                      <td><span style={{fontFamily:'var(--font-mono)',fontSize:12,color:ACT[l.action]||'var(--text3)'}}>{l.action}</span></td>
                      <td style={{color:'var(--text)'}}>{l.user_name}</td>
                      <td><span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--text3)'}}>{l.user_role}</span></td>
                      <td><span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--text3)'}}>{l.target_type||'—'}{l.target_id?' / '+l.target_id:''}</span></td>
                      <td style={{fontSize:12,color:'var(--text3)'}}>{l.metadata&&Object.entries(l.metadata).map(([k,v])=>k+': '+v).join(', ')}</td>
                      <td style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--text3)',whiteSpace:'nowrap'}}>{fmtDate(l.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
`);

write('client/src/pages/Users.jsx', `import { useState, useEffect } from 'react'
import api from '../api/axios'
import { Loading, fmtDate } from '../components/Shared'
import { useAuth } from '../context/AuthContext'

const ROLES=['super_admin','analyst','viewer']

export default function Users() {
  const [users,setUsers]=useState([]), [loading,setLoading]=useState(true)
  const [showModal,setShowModal]=useState(false), [editUser,setEditUser]=useState(null)
  const [form,setForm]=useState({name:'',email:'',password:'',role:'analyst',department:''})
  const [submitting,setSubmitting]=useState(false), [error,setError]=useState(''), [success,setSuccess]=useState('')
  const { user:me }=useAuth()
  const load=()=>{ setLoading(true); api.get('/auth/users').then(r=>setUsers(r.data)).finally(()=>setLoading(false)) }
  useEffect(()=>{ load() },[])
  const openCreate=()=>{ setEditUser(null); setForm({name:'',email:'',password:'',role:'analyst',department:''}); setError(''); setShowModal(true) }
  const openEdit=(u)=>{ setEditUser(u); setForm({name:u.name,email:u.email,password:'',role:u.role,department:u.department||''}); setError(''); setShowModal(true) }
  const handleSubmit=async(e)=>{ e.preventDefault(); setSubmitting(true); setError('')
    try{ editUser?await api.put('/auth/users/'+editUser.id,{name:form.name,role:form.role,department:form.department}):await api.post('/auth/users',form); setSuccess(editUser?'Updated.':'Created.'); setShowModal(false); load(); setTimeout(()=>setSuccess(''),3000) }
    catch(err){ setError(err.response?.data?.error||'Failed') }finally{ setSubmitting(false) }
  }
  const handleDelete=async(u)=>{ if(u.id===me.id) return alert('Cannot delete own account.'); if(!confirm('Delete '+u.name+'?')) return; await api.delete('/auth/users/'+u.id); load() }
  const RC={ super_admin:'var(--kalro-green-light)', analyst:'var(--accent)', viewer:'var(--yellow)' }
  const RBG={ super_admin:'var(--kalro-green-glow)', analyst:'var(--accent-glow)', viewer:'rgba(255,193,7,0.08)' }
  if(loading) return <Loading/>
  return (
    <div>
      <div className="page-header">
        <div className="flex-between" style={{paddingBottom:20}}>
          <div><h1>User Management</h1><p>Manage accounts, roles, and access — admin only</p></div>
          <button className="btn btn-primary" onClick={openCreate}>+ Add User</button>
        </div>
      </div>
      <div className="page-body">
        {success&&<div className="alert alert-success">{success}</div>}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:14}}>
          {users.map(u=>(
            <div key={u.id} className="card" style={{position:'relative',overflow:'hidden'}}>
              <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:RC[u.role]}}/>
              <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:14}}>
                <div style={{width:42,height:42,borderRadius:'50%',background:RBG[u.role],border:'1px solid '+RC[u.role]+'50',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--font-mono)',fontSize:16,fontWeight:700,color:RC[u.role]}}>{u.name.charAt(0)}</div>
                <div>
                  <div style={{fontWeight:600,fontSize:15,color:'var(--text)',display:'flex',alignItems:'center',gap:6}}>
                    {u.name}{u.id===me.id&&<span style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--kalro-green-light)',background:'var(--kalro-green-glow)',padding:'1px 6px',borderRadius:3}}>YOU</span>}
                  </div>
                  <div style={{fontSize:12,color:'var(--text3)'}}>{u.email}</div>
                </div>
              </div>
              <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}>
                <span style={{fontFamily:'var(--font-mono)',fontSize:11,color:RC[u.role],background:RBG[u.role],padding:'3px 10px',borderRadius:999,border:'1px solid '+RC[u.role]+'30'}}>{u.role.replace('_',' ')}</span>
                {u.department&&<span className="tag">{u.department}</span>}
              </div>
              <div style={{fontSize:12,color:'var(--text3)',fontFamily:'var(--font-mono)',marginBottom:14}}>Joined {fmtDate(u.created_at)}</div>
              <div style={{display:'flex',gap:8}}>
                <button className="btn btn-ghost btn-sm" style={{flex:1,justifyContent:'center'}} onClick={()=>openEdit(u)}>Edit</button>
                <button className="btn btn-danger btn-sm" style={{flex:1,justifyContent:'center',opacity:u.id===me.id?0.4:1}} onClick={()=>handleDelete(u)} disabled={u.id===me.id}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>
      {showModal&&<div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowModal(false)}>
        <div className="modal">
          <div className="modal-header"><h2>{editUser?'Edit User':'Add New User'}</h2><button className="modal-close" onClick={()=>setShowModal(false)}>×</button></div>
          {error&&<div className="alert alert-error">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-group"><label className="form-label">Full Name *</label><input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} required/></div>
            {!editUser&&<div className="form-group"><label className="form-label">Email *</label><input type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} required/></div>}
            {!editUser&&<div className="form-group"><label className="form-label">Password *</label><input type="password" value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} minLength={6} required/></div>}
            <div className="form-row">
              <div className="form-group"><label className="form-label">Role *</label><select value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))}>{ROLES.map(r=><option key={r} value={r}>{r.replace('_',' ')}</option>)}</select></div>
              <div className="form-group"><label className="form-label">Department</label><input value={form.department} onChange={e=>setForm(f=>({...f,department:e.target.value}))} placeholder="e.g. ICT"/></div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={()=>setShowModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting?'Saving...':editUser?'Update':'Create User'}</button>
            </div>
          </form>
        </div>
      </div>}
    </div>
  )
}
`);

console.log('\n✅  Part 3 done — all pages written.');
console.log('\n📋  NEXT STEPS:');
console.log('   cd server && npm install');
console.log('   cd ../client && npm install');
console.log('   Terminal 1: cd server && npm run dev');
console.log('   Terminal 2: cd client && npm run dev');
console.log('   Open: http://localhost:5173');
console.log('   Login: alice@kalro.org / password');
