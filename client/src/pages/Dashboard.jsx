import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { Badge, Loading, timeAgo, SlaIndicator } from '../components/Shared'
import EMIILiveFeed from '../components/EMIILiveFeed'
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

function formatMinutes(value) {
  if (value === null || value === undefined) return 'N/A';
  return value < 60 ? `${value} mins` : `${Math.round(value)} mins`;
}

function threatColor(score) {
  if (score >= 7) return 'var(--kalro-red-light)';
  if (score >= 4) return 'var(--yellow)';
  return 'var(--kalro-green)';
}

export default function Dashboard() {
  const [data,setData]=useState(null), [loading,setLoading]=useState(true), [resilience,setResilience]=useState(null), [pulseAlerts,setPulseAlerts]=useState([])
  const navigate=useNavigate(), { user }=useAuth()
  useEffect(()=>{ 
    api.get('/reports/dashboard').then(r=>setData(r.data)).finally(()=>setLoading(false));
    api.get('/incidents/dashboard/resilience-metrics').then(r=>setResilience(r.data)).catch(()=>{});
    api.get('/alerts/knowledge-pulse').then(r=>setPulseAlerts(r.data)).catch(()=>{});
  },[])
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

        {/* EMII Live Feed */}
        <EMIILiveFeed/>

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

        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:14,marginBottom:20}}>
          <div className="stat-card accent" style={{padding:'22px 18px',minHeight:140}}>
            <div className="stat-label">Avg Time to Detection (MTTD)</div>
            <div className="stat-value" style={{fontSize:34}}>{metrics.avg_time_to_detect_min ? formatMinutes(metrics.avg_time_to_detect_min) : 'Data unavailable'}</div>
            <div className="stat-sub">Target baseline: <strong>&lt; 15 mins</strong></div>
          </div>
          <div className="stat-card yellow" style={{padding:'22px 18px',minHeight:140}}>
            <div className="stat-label">Avg Time to Resolution (MTTR)</div>
            <div className="stat-value" style={{fontSize:34}}>{formatMinutes(metrics.avg_time_to_resolve_min)}</div>
            <div className="stat-sub">Target baseline: <strong>&lt; 45 mins</strong></div>
          </div>
        </div>

        <div className="card" style={{marginBottom:20,borderLeft:'3px solid var(--kalro-purple)'}}>
          <div className="section-header"><h2>Knowledge-to-Response Correlation</h2></div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12}}>
            <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:10,padding:16}}>
              <div style={{fontSize:11,color:'var(--text3)',textTransform:'uppercase',letterSpacing:1}}>MTTR (Playbook Guided)</div>
              <div style={{fontSize:28,fontWeight:700,margin:'10px 0'}}>{metrics.avg_mttr_playbook_min ? formatMinutes(metrics.avg_mttr_playbook_min) : 'N/A'}</div>
              <div style={{fontSize:12,color:'var(--text3)'}}>Guided by knowledge artifacts</div>
            </div>
            <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:10,padding:16}}>
              <div style={{fontSize:11,color:'var(--text3)',textTransform:'uppercase',letterSpacing:1}}>MTTR (Manual Triage)</div>
              <div style={{fontSize:28,fontWeight:700,margin:'10px 0'}}>{metrics.avg_mttr_manual_min ? formatMinutes(metrics.avg_mttr_manual_min) : 'N/A'}</div>
              <div style={{fontSize:12,color:'var(--text3)'}}>Unguided response path</div>
            </div>
            <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:10,padding:16}}>
              <div style={{fontSize:11,color:'var(--text3)',textTransform:'uppercase',letterSpacing:1}}>Systemic Efficiency Gain</div>
              <div style={{fontSize:28,fontWeight:700,margin:'10px 0',color:'var(--kalro-green)'}}>{metrics.resolution_speed_gain ? `+${metrics.resolution_speed_gain}%` : '—'}</div>
              <div style={{fontSize:12,color:'var(--text3)'}}>Compared guided vs manual resolution</div>
            </div>
          </div>
          <div style={{marginTop:16,display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div style={{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:10,padding:14}}>
              <div style={{fontSize:11,color:'var(--text3)',marginBottom:6}}>Knowledge Reuse Rate</div>
              <div style={{fontSize:28,fontWeight:700,color:'var(--accent)'}}>{resilience?.knowledge_utilization_rate || 'N/A'}</div>
              <div style={{fontSize:12,color:'var(--text3)'}}>Resolved incidents using institutional memory</div>
            </div>
          </div>
        </div>

        <div className="card" style={{marginBottom:20,borderLeft:'3px solid var(--kalro-red)'}}>
          <div className="section-header"><h2>Governance & Risk Metrics</h2></div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12}}>
            <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:10,padding:16}}>
              <div style={{fontSize:11,color:'var(--text3)',textTransform:'uppercase',letterSpacing:1}}>SLA Boundary Status</div>
              <div style={{fontSize:28,fontWeight:700}}>{metrics.sla_nearing_count}</div>
              <div style={{fontSize:12,color:'var(--text3)'}}>Incidents within 6 hours of SLA breach</div>
            </div>
            <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:10,padding:16}}>
              <div style={{fontSize:11,color:'var(--text3)',textTransform:'uppercase',letterSpacing:1}}>Calculated Threat Score</div>
              <div style={{fontSize:28,fontWeight:700,color:threatColor(metrics.active_threat_index)}}>{metrics.active_threat_index?.toFixed(1) || '0.0'} / 10</div>
              <div style={{fontSize:12,color:'var(--text3)'}}>Live active incident risk index</div>
            </div>
            <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:10,padding:16}}>
              <div style={{fontSize:11,color:'var(--text3)',textTransform:'uppercase',letterSpacing:1}}>Institutional Memory Growth</div>
              <div style={{fontSize:28,fontWeight:700,color:'var(--kalro-green)'}}>+{metrics.knowledge_growth_velocity}</div>
              <div style={{fontSize:12,color:'var(--text3)'}}>New playbooks in last 30 days</div>
            </div>
          </div>
        </div>

        <div className="card" style={{marginBottom:20,borderLeft:'3px solid var(--blue)',background:'#0f172a',padding:16,borderRadius:12}}>
          <div className="section-header"><h2 style={{color:'#ffffff',marginTop:0}}>Framework & Strategy</h2></div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12}}>
            <div style={{padding:14,background:'#1e293b',border:'1px solid var(--border)',borderRadius:12}}>
              <div style={{fontSize:11,color:'#94a3b8',fontFamily:'var(--font-mono)',textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>CSF Maturity</div>
              <div style={{fontSize:24,fontWeight:700,color:'var(--blue)',marginBottom:6}}>{summary.csf_maturity_score?.score ?? '—'}</div>
              <div style={{fontSize:12,color:'#cbd5e1'}}>{summary.csf_maturity_score?.label ?? 'Evaluating'}</div>
            </div>
            <div style={{padding:14,background:'#1e293b',border:'1px solid var(--border)',borderRadius:12}}>
              <div style={{fontSize:11,color:'#94a3b8',fontFamily:'var(--font-mono)',textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>Protect (PR.AC) Compliance</div>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
                <div style={{flex:1,height:8,background:'#334155',borderRadius:4,overflow:'hidden'}}><div style={{width:(summary.pr_ac_compliance||0)+'%',height:'100%',background:'var(--blue)',borderRadius:4}}/></div>
                <span style={{fontFamily:'var(--font-mono)',fontSize:12,color:'#ffffff'}}>{summary.pr_ac_compliance||0}%</span>
              </div>
              <div style={{fontSize:12,color:'#94a3b8'}}>Coverage for critical access/control incidents</div>
            </div>
            <div style={{padding:14,background:'#1e293b',border:'1px solid var(--border)',borderRadius:12}}>
              <div style={{fontSize:11,color:'#94a3b8',fontFamily:'var(--font-mono)',textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>Recommended Action</div>
              <div style={{fontSize:18,fontWeight:700,color:'var(--kalro-red)'}}>{summary.recommended_countermeasure || 'Review'}</div>
              <div style={{fontSize:12,color:'#cbd5e1',marginTop:8}}>{summary.recommended_reasoning || 'No strategy available'}</div>
            </div>
            <div style={{padding:14,background:'#1e293b',border:'1px solid var(--border)',borderRadius:12}}>
              <div style={{fontSize:11,color:'#94a3b8',fontFamily:'var(--font-mono)',textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>Threat Intent</div>
              <div style={{fontSize:14,color:'#ffffff'}}>{summary.attacker_prediction || 'Unable to infer attacker intent.'}</div>
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:10,marginTop:16}}>
            {Object.entries(data.csf_function_counts || {}).map(([key,value]) => (
              <div key={key} style={{background:'#1e293b',border:'1px solid var(--border)',borderRadius:10,padding:12,textAlign:'center'}}>
                <div style={{fontSize:12,fontFamily:'var(--font-mono)',color:'#94a3b8',marginBottom:4}}>{key}</div>
                <div style={{fontSize:20,fontWeight:700,color:'#ffffff'}}>{value}</div>
                <div style={{fontSize:11,color:'#94a3b8'}}>{key === 'PR' ? 'Protect' : key === 'DE' ? 'Detect' : key === 'RS' ? 'Respond' : key === 'ID' ? 'Identify' : 'Recover'}</div>
              </div>
            ))}
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

        {/* NEW: RESILIENCE METRICS SECTION */}
        {resilience && (
          <div className="card" style={{marginBottom:20,background:'linear-gradient(135deg, var(--bg2) 0%, var(--bg3) 100%)',borderLeft:'3px solid var(--kalro-green)'}}>
            <div style={{marginBottom:16}}>
              <div style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--text3)',textTransform:'uppercase',letterSpacing:1,marginBottom:4}}>🛡️ Organizational Resilience Score</div>
              <div style={{fontSize:32,fontWeight:700,color:'var(--kalro-green)',fontFamily:'var(--font-mono)',marginBottom:8}}>
                {resilience.resilience_score.toFixed(1)}
              </div>
              <div style={{fontSize:13,color:'var(--text2)',lineHeight:1.6}}>
                Based on SLA compliance, knowledge utilization, socio-technical complexity, and defensive routine effectiveness
              </div>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))',gap:12}}>
              <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:8,padding:12}}>
                <div style={{fontSize:10,color:'var(--text3)',fontFamily:'var(--font-mono)',marginBottom:4}}>SLA Compliance</div>
                <div style={{fontSize:18,fontWeight:700,color:resilience.sla_breach_rate<10?'var(--kalro-green)':'var(--yellow)',fontFamily:'var(--font-mono)'}}>
                  {resilience.sla_breach_rate}
                </div>
                <div style={{fontSize:11,color:'var(--text3)',marginTop:4}}>Breach rate</div>
              </div>

              <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:8,padding:12}}>
                <div style={{fontSize:10,color:'var(--text3)',fontFamily:'var(--font-mono)',marginBottom:4}}>Knowledge Utilization Rate</div>
                <div style={{fontSize:18,fontWeight:700,color:'var(--accent)',fontFamily:'var(--font-mono)'}}>
                  {resilience.knowledge_utilization_rate || resilience.knowledge_utilization}
                </div>
                <div style={{fontSize:11,color:'var(--text3)',marginTop:4}}>Resolved with institutional memory</div>
              </div>

              <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:8,padding:12}}>
                <div style={{fontSize:10,color:'var(--text3)',fontFamily:'var(--font-mono)',marginBottom:4}}>Mean Time to Wisdom</div>
                <div style={{fontSize:18,fontWeight:700,color:'var(--kalro-green)',fontFamily:'var(--font-mono)'}}>
                  {resilience.mean_time_to_wisdom}
                </div>
                <div style={{fontSize:11,color:'var(--text3)',marginTop:4}}>Tacit-to-explicit conversion</div>
              </div>

              <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:8,padding:12}}>
                <div style={{fontSize:10,color:'var(--text3)',fontFamily:'var(--font-mono)',marginBottom:4}}>Routine Success Rate</div>
                <div style={{fontSize:18,fontWeight:700,color:'var(--kalro-green)',fontFamily:'var(--font-mono)'}}>
                  {resilience.routine_success_rate}
                </div>
                <div style={{fontSize:11,color:'var(--text3)',marginTop:4}}>Defensive routines</div>
              </div>

              <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:8,padding:12}}>
                <div style={{fontSize:10,color:'var(--text3)',fontFamily:'var(--font-mono)',marginBottom:4}}>Socio-Technical Balance</div>
                <div style={{fontSize:18,fontWeight:700,color:'var(--text)',fontFamily:'var(--font-mono)'}}>
                  {resilience.socio_technical_balance_score ?? 50}
                </div>
                <div style={{fontSize:11,color:'var(--text3)',marginTop:4}}>Human vs. Technical risk</div>
              </div>
            </div>

            <div style={{marginTop:16,padding:14,background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:10}}>
              <div style={{fontSize:11,color:'var(--text3)',fontFamily:'var(--font-mono)',marginBottom:8}}>Socio-Technical Heatmap</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                <div style={{padding:12,background:'var(--bg3)',borderRadius:8}}>
                  <div style={{fontSize:11,color:'var(--text3)',marginBottom:6}}>Technical</div>
                  <div style={{fontSize:20,fontWeight:700,color:'var(--blue)'}}>{resilience.socio_technical_balance?.technical ?? '50'}%</div>
                </div>
                <div style={{padding:12,background:'var(--bg3)',borderRadius:8}}>
                  <div style={{fontSize:11,color:'var(--text3)',marginBottom:6}}>Social</div>
                  <div style={{fontSize:20,fontWeight:700,color:'var(--kalro-red)'}}>{resilience.socio_technical_balance?.social ?? '50'}%</div>
                </div>
              </div>
            </div>

            <div style={{marginTop:12,paddingTop:12,borderTop:'1px solid var(--border)'}}>
              <button className="btn btn-ghost btn-sm" onClick={()=>navigate('/defensive-routines')} style={{marginRight:8}}>
                📚 View Routines
              </button>
              {user?.role==='super_admin' && (
                <button className="btn btn-ghost btn-sm" onClick={()=>navigate('/config/game-theory')}>
                  ⚖️ Game Theory Config
                </button>
              )}
            </div>
          </div>
        )}

        {pulseAlerts.length > 0 && (
          <div className="card" style={{marginBottom:20,borderLeft:'3px solid var(--kalro-red)'}}>
            <div className="section-header"><h2>Knowledge Pulse</h2></div>
            {pulseAlerts.slice(0, 3).map(alert => (
              <div key={alert.id} style={{padding:'12px 0',borderBottom:'1px solid var(--border)'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
                  <div>
                    <div style={{fontWeight:600,color:'var(--text)'}}>{alert.title}</div>
                    <div style={{fontSize:12,color:'var(--text3)'}}>{alert.summary}</div>
                  </div>
                  <span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--kalro-red)',background:'var(--kalro-red-glow)',padding:'4px 8px',borderRadius:4}}>{alert.source_site}</span>
                </div>
              </div>
            ))}
            {pulseAlerts.length > 3 && (
              <div style={{padding:'10px 0',fontSize:12,color:'var(--text3)'}}>+{pulseAlerts.length - 3} more knowledge pulses available</div>
            )}
          </div>
        )}

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
