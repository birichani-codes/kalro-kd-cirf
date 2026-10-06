const fs = require('fs');
const path = require('path');
function write(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✓', filePath);
}

// ─── CLIENT CONFIG ────────────────────────────────────────────────────────────

write('client/package.json', JSON.stringify({
  name:"kalro-ikf-client",version:"1.0.0",type:"module",
  scripts:{dev:"vite",build:"vite build",preview:"vite preview"},
  dependencies:{react:"^18.2.0","react-dom":"^18.2.0","react-router-dom":"^6.22.0",axios:"^1.6.7"},
  devDependencies:{"@vitejs/plugin-react":"^4.2.1",vite:"^5.1.0"}
},null,2));

write('client/vite.config.js', `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins:[react()],
  server:{ port:5173, proxy:{ '/api':{ target:'http://localhost:3000', changeOrigin:true } } }
})
`);

write('client/index.html', `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>KALRO — Cybersecurity Incident Response</title>
    <link rel="preconnect" href="https://fonts.googleapis.com"/>
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
    <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap" rel="stylesheet"/>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`);

// ─── CLIENT SRC CORE ──────────────────────────────────────────────────────────

write('client/src/main.jsx', `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>)
`);

write('client/src/api/axios.js', `import axios from 'axios'
const api = axios.create({ baseURL:'/api' })
api.interceptors.request.use(cfg => { const t=localStorage.getItem('token'); if(t) cfg.headers.Authorization='Bearer '+t; return cfg; })
api.interceptors.response.use(res=>res, err=>{ if(err.response?.status===401){ localStorage.removeItem('token'); localStorage.removeItem('user'); window.location.href='/login'; } return Promise.reject(err); })
export default api
`);

write('client/src/context/AuthContext.jsx', `import { createContext, useContext, useState } from 'react'
import api from '../api/axios'
const Ctx = createContext(null)
export const AuthProvider = ({ children }) => {
  const [user,setUser] = useState(()=>{ try{ return JSON.parse(localStorage.getItem('user')) }catch{ return null } })
  const login = async(email,password) => { const r=await api.post('/auth/login',{email,password}); localStorage.setItem('token',r.data.token); localStorage.setItem('user',JSON.stringify(r.data.user)); setUser(r.data.user); return r.data.user; }
  const logout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); setUser(null); }
  return <Ctx.Provider value={{ user, login, logout, isAdmin:user?.role==='super_admin', isAnalyst:user?.role==='analyst'||user?.role==='super_admin' }}>{children}</Ctx.Provider>
}
export const useAuth = () => useContext(Ctx)
`);

write('client/src/App.jsx', `import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Incidents from './pages/Incidents'
import IncidentDetail from './pages/IncidentDetail'
import Knowledge from './pages/Knowledge'
import KnowledgeDetail from './pages/KnowledgeDetail'
import Search from './pages/Search'
import Reports from './pages/Reports'
import Users from './pages/Users'
import PIRDetail from './pages/PIRDetail'

const Guard = ({ children, adminOnly=false }) => {
  const { user, isAdmin } = useAuth()
  if (!user) return <Navigate to="/login" replace/>
  if (adminOnly && !isAdmin) return <Navigate to="/" replace/>
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login/>}/>
          <Route path="/" element={<Guard><Layout/></Guard>}>
            <Route index element={<Dashboard/>}/>
            <Route path="incidents" element={<Incidents/>}/>
            <Route path="incidents/:id" element={<IncidentDetail/>}/>
            <Route path="incidents/:id/pir" element={<PIRDetail/>}/>
            <Route path="knowledge" element={<Knowledge/>}/>
            <Route path="knowledge/:id" element={<KnowledgeDetail/>}/>
            <Route path="search" element={<Search/>}/>
            <Route path="reports" element={<Guard adminOnly><Reports/></Guard>}/>
            <Route path="users" element={<Guard adminOnly><Users/></Guard>}/>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
`);

// ─── KALRO-BRANDED CSS ────────────────────────────────────────────────────────
// KALRO brand: Green #2E7D32, Red #C62828, dark bg with green/red accents

write('client/src/index.css', `:root {
  /* KALRO Brand Colors */
  --kalro-green:       #2E7D32;
  --kalro-green-light: #43A047;
  --kalro-green-pale:  #E8F5E9;
  --kalro-green-glow:  rgba(46,125,50,0.18);
  --kalro-red:         #C62828;
  --kalro-red-light:   #E53935;
  --kalro-red-pale:    #FFEBEE;
  --kalro-red-glow:    rgba(198,40,40,0.15);

  /* Dark theme background system */
  --bg:       #0a0e0a;
  --bg2:      #0d1410;
  --bg3:      #131c14;
  --bg4:      #1a2a1b;
  --border:   #1e3320;
  --border2:  #2d4d30;

  /* Text */
  --text:  #e8f0e9;
  --text2: #8fad92;
  --text3: #567059;

  /* Accent = KALRO green */
  --accent:      #4CAF50;
  --accent2:     #388E3C;
  --accent-glow: rgba(76,175,80,0.15);

  /* Semantic colors */
  --green:      #4CAF50;
  --green-bg:   rgba(76,175,80,0.12);
  --yellow:     #FFC107;
  --yellow-bg:  rgba(255,193,7,0.12);
  --red:        #EF5350;
  --red-bg:     rgba(239,83,80,0.12);
  --orange:     #FF7043;
  --orange-bg:  rgba(255,112,67,0.12);
  --purple:     #AB47BC;
  --purple-bg:  rgba(171,71,188,0.12);

  /* KALRO red for critical/major */
  --kalro-critical:     #C62828;
  --kalro-critical-bg:  rgba(198,40,40,0.12);

  --font-mono: 'Space Mono', monospace;
  --font-body: 'DM Sans', sans-serif;
  --radius:    8px;
  --radius-lg: 12px;
  --shadow:    0 4px 24px rgba(0,0,0,0.5);
}

*{ box-sizing:border-box; margin:0; padding:0; }
body{ background:var(--bg); color:var(--text); font-family:var(--font-body); font-size:15px; line-height:1.6; min-height:100vh; }
a{ color:var(--accent); text-decoration:none; }
a:hover{ text-decoration:underline; }
button{ font-family:var(--font-body); cursor:pointer; border:none; outline:none; transition:all 0.15s ease; }
input,textarea,select{ font-family:var(--font-body); background:var(--bg3); border:1px solid var(--border); color:var(--text); border-radius:var(--radius); padding:10px 14px; font-size:14px; width:100%; outline:none; transition:border-color 0.15s; }
input:focus,textarea:focus,select:focus{ border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-glow); }
::-webkit-scrollbar{ width:5px; height:5px; }
::-webkit-scrollbar-track{ background:var(--bg2); }
::-webkit-scrollbar-thumb{ background:var(--border2); border-radius:3px; }

/* Layout */
.app-layout{ display:flex; min-height:100vh; }
.sidebar{ width:250px; min-height:100vh; background:var(--bg2); border-right:1px solid var(--border); display:flex; flex-direction:column; position:fixed; top:0; left:0; bottom:0; z-index:100; }
.main-content{ margin-left:250px; flex:1; min-height:100vh; }
.page-header{ padding:28px 32px 0; border-bottom:1px solid var(--border); }
.page-header h1{ font-family:var(--font-mono); font-size:20px; font-weight:700; color:var(--text); letter-spacing:-0.5px; }
.page-header p{ color:var(--text2); font-size:14px; margin-top:4px; padding-bottom:20px; }
.page-body{ padding:28px 32px; }

/* Cards */
.card{ background:var(--bg2); border:1px solid var(--border); border-radius:var(--radius-lg); padding:20px; }
.card:hover{ border-color:var(--border2); }

/* Buttons */
.btn{ display:inline-flex; align-items:center; gap:8px; padding:9px 18px; border-radius:var(--radius); font-size:14px; font-weight:500; transition:all 0.15s; }
.btn-primary{ background:var(--kalro-green); color:#fff; font-weight:600; }
.btn-primary:hover{ background:var(--kalro-green-light); box-shadow:0 0 16px var(--kalro-green-glow); }
.btn-danger{ background:var(--kalro-red-pale); color:var(--kalro-red); border:1px solid rgba(198,40,40,0.3); }
.btn-danger:hover{ background:rgba(198,40,40,0.2); }
.btn-ghost{ background:transparent; color:var(--text2); border:1px solid var(--border); }
.btn-ghost:hover{ background:var(--bg3); color:var(--text); border-color:var(--border2); }
.btn-sm{ padding:6px 12px; font-size:13px; }
.btn-warning{ background:rgba(255,193,7,0.12); color:var(--yellow); border:1px solid rgba(255,193,7,0.3); }

/* Badges */
.badge{ display:inline-flex; align-items:center; padding:3px 10px; border-radius:999px; font-size:12px; font-weight:500; font-family:var(--font-mono); }
.badge-critical,.badge-major{ background:var(--kalro-critical-bg); color:var(--kalro-red-light); border:1px solid rgba(198,40,40,0.25); }
.badge-high{ background:var(--orange-bg); color:var(--orange); }
.badge-medium{ background:var(--yellow-bg); color:var(--yellow); }
.badge-low{ background:var(--green-bg); color:var(--green); }
.badge-open{ background:rgba(66,165,245,0.12); color:#42A5F5; }
.badge-investigating{ background:var(--yellow-bg); color:var(--yellow); }
.badge-escalated{ background:var(--kalro-critical-bg); color:var(--kalro-red-light); }
.badge-resolved{ background:var(--green-bg); color:var(--green); }
.badge-closed{ background:var(--bg4); color:var(--text3); }
.badge-active{ background:var(--green-bg); color:var(--green); }
.badge-superseded{ background:var(--yellow-bg); color:var(--yellow); }
.badge-retired{ background:var(--bg4); color:var(--text3); }
.badge-playbook{ background:rgba(76,175,80,0.12); color:#66BB6A; }
.badge-runbook{ background:rgba(66,165,245,0.12); color:#42A5F5; }
.badge-reference{ background:var(--purple-bg); color:var(--purple); }
.badge-lessons-learned{ background:var(--yellow-bg); color:var(--yellow); }

/* Stats */
.stats-grid{ display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:16px; margin-bottom:24px; }
.stat-card{ background:var(--bg2); border:1px solid var(--border); border-radius:var(--radius-lg); padding:20px; position:relative; overflow:hidden; }
.stat-card::before{ content:''; position:absolute; top:0; left:0; right:0; height:3px; }
.stat-card.green::before{ background:var(--kalro-green); }
.stat-card.red::before{ background:var(--kalro-red); }
.stat-card.yellow::before{ background:var(--yellow); }
.stat-card.accent::before{ background:var(--accent); }
.stat-card.purple::before{ background:var(--purple); }
.stat-card.orange::before{ background:var(--orange); }
.stat-label{ font-size:11px; font-family:var(--font-mono); color:var(--text3); text-transform:uppercase; letter-spacing:1px; margin-bottom:8px; }
.stat-value{ font-size:32px; font-family:var(--font-mono); font-weight:700; color:var(--text); line-height:1; }
.stat-sub{ font-size:12px; color:var(--text3); margin-top:6px; }

/* Table */
.table-wrap{ overflow-x:auto; }
table{ width:100%; border-collapse:collapse; font-size:14px; }
thead th{ text-align:left; padding:10px 14px; font-size:11px; font-family:var(--font-mono); color:var(--text3); text-transform:uppercase; letter-spacing:1px; border-bottom:1px solid var(--border); }
tbody tr{ border-bottom:1px solid var(--border); transition:background 0.1s; cursor:pointer; }
tbody tr:hover{ background:var(--bg3); }
tbody td{ padding:12px 14px; color:var(--text2); }
tbody td:first-child{ color:var(--text); }

/* Forms */
.form-group{ margin-bottom:18px; }
.form-label{ display:block; font-size:13px; font-weight:500; color:var(--text2); margin-bottom:6px; font-family:var(--font-mono); }
.form-row{ display:grid; grid-template-columns:1fr 1fr; gap:16px; }

/* Modal */
.modal-overlay{ position:fixed; inset:0; background:rgba(0,0,0,0.75); display:flex; align-items:center; justify-content:center; z-index:1000; backdrop-filter:blur(4px); }
.modal{ background:var(--bg2); border:1px solid var(--border2); border-radius:var(--radius-lg); padding:28px; width:100%; max-width:560px; max-height:90vh; overflow-y:auto; box-shadow:var(--shadow); }
.modal-header{ display:flex; align-items:center; justify-content:space-between; margin-bottom:24px; }
.modal-header h2{ font-family:var(--font-mono); font-size:16px; font-weight:700; }
.modal-close{ background:none; color:var(--text3); font-size:22px; line-height:1; padding:4px 8px; }
.modal-close:hover{ color:var(--text); }
.modal-actions{ display:flex; gap:10px; justify-content:flex-end; margin-top:24px; }

/* Confidence */
.confidence-bar{ display:flex; align-items:center; gap:8px; }
.confidence-bar-track{ flex:1; height:4px; background:var(--bg4); border-radius:2px; overflow:hidden; }
.confidence-bar-fill{ height:100%; border-radius:2px; transition:width 0.3s ease; }

/* Tags */
.tag{ display:inline-block; padding:2px 8px; background:var(--bg4); border:1px solid var(--border); border-radius:4px; font-size:11px; font-family:var(--font-mono); color:var(--text3); margin:2px; }

/* Alerts */
.alert{ padding:12px 16px; border-radius:var(--radius); font-size:14px; margin-bottom:16px; border-left:3px solid; }
.alert-error{ background:var(--kalro-critical-bg); color:var(--kalro-red-light); border-color:var(--kalro-red); }
.alert-success{ background:var(--green-bg); color:var(--green); border-color:var(--green); }
.alert-info{ background:var(--accent-glow); color:var(--accent); border-color:var(--accent); }
.alert-warning{ background:var(--yellow-bg); color:var(--yellow); border-color:var(--yellow); }
.alert-major{ background:var(--kalro-critical-bg); color:var(--kalro-red-light); border-color:var(--kalro-red); border-left-width:4px; }

/* SLA indicators */
.sla-ok{ color:var(--green); font-family:var(--font-mono); font-size:12px; }
.sla-warn{ color:var(--yellow); font-family:var(--font-mono); font-size:12px; }
.sla-breach{ color:var(--kalro-red-light); font-family:var(--font-mono); font-size:12px; font-weight:700; }

/* Misc */
.loading{ display:flex; align-items:center; justify-content:center; padding:60px; color:var(--text3); font-family:var(--font-mono); font-size:13px; gap:10px; }
.spinner{ width:18px; height:18px; border:2px solid var(--border2); border-top-color:var(--accent); border-radius:50%; animation:spin 0.7s linear infinite; }
@keyframes spin{ to{ transform:rotate(360deg); } }
.tabs{ display:flex; border-bottom:1px solid var(--border); margin-bottom:24px; }
.tab-btn{ padding:10px 20px; background:none; color:var(--text3); font-size:14px; font-weight:500; border-bottom:2px solid transparent; margin-bottom:-1px; border-radius:0; }
.tab-btn:hover{ color:var(--text2); }
.tab-btn.active{ color:var(--accent); border-bottom-color:var(--accent); }
.section-header{ display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; }
.section-header h2{ font-family:var(--font-mono); font-size:13px; font-weight:700; color:var(--text2); text-transform:uppercase; letter-spacing:1px; }
.annotation{ background:var(--bg3); border:1px solid var(--border); border-left:3px solid var(--kalro-green); border-radius:var(--radius); padding:12px 14px; margin-bottom:10px; }
.annotation .annotation-meta{ font-size:12px; color:var(--text3); font-family:var(--font-mono); margin-bottom:6px; }
.annotation p{ font-size:14px; color:var(--text2); }
.knowledge-content{ background:var(--bg3); border:1px solid var(--border); border-radius:var(--radius); padding:20px; white-space:pre-wrap; font-size:14px; line-height:1.8; color:var(--text2); }
.search-result{ background:var(--bg2); border:1px solid var(--border); border-radius:var(--radius-lg); padding:18px 20px; margin-bottom:12px; transition:border-color 0.15s,transform 0.15s; cursor:pointer; }
.search-result:hover{ border-color:var(--accent); transform:translateX(2px); }
.search-result .result-type{ font-size:11px; font-family:var(--font-mono); color:var(--text3); text-transform:uppercase; letter-spacing:1px; margin-bottom:6px; }
.search-result h3{ font-size:15px; font-weight:600; color:var(--text); margin-bottom:6px; }
.search-result p{ font-size:13px; color:var(--text3); display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.divider{ border:none; border-top:1px solid var(--border); margin:20px 0; }
.flex-between{ display:flex; align-items:center; justify-content:space-between; }
.flex{ display:flex; } .flex-center{ display:flex; align-items:center; }
.gap-2{ gap:8px; } .gap-3{ gap:12px; }
.mb-3{ margin-bottom:12px; } .mb-4{ margin-bottom:16px; }
.text-mono{ font-family:var(--font-mono); } .text-muted{ color:var(--text3); }
.empty-state{ text-align:center; padding:60px 20px; color:var(--text3); }
.empty-state .empty-icon{ font-size:40px; margin-bottom:12px; opacity:0.4; }
.empty-state h3{ font-family:var(--font-mono); font-size:15px; color:var(--text2); margin-bottom:8px; }

/* PIR specific */
.pir-step{ background:var(--bg3); border:1px solid var(--border); border-radius:var(--radius); padding:16px; margin-bottom:12px; }
.pir-step-num{ font-family:var(--font-mono); font-size:11px; color:var(--kalro-green); text-transform:uppercase; letter-spacing:1px; margin-bottom:6px; }
.pir-step p{ font-size:14px; color:var(--text2); line-height:1.7; }
.action-item{ display:flex; align-items:flex-start; gap:10px; padding:10px 0; border-bottom:1px solid var(--border); }
.action-item.done .action-text{ text-decoration:line-through; color:var(--text3); }
`);

// ─── SHARED COMPONENTS ────────────────────────────────────────────────────────

write('client/src/components/Shared.jsx', `export const Badge = ({ value, type }) => {
  const cls = 'badge badge-'+(type||(value?.toLowerCase().replace(/\\s+/g,'-')||''))
  return <span className={cls}>{value}</span>
}

export const KTypeBadge = ({ type }) => {
  const labels = { playbook:'Playbook', runbook:'Runbook', reference:'Reference', 'lessons-learned':'Lessons Learned' }
  return <span className={'badge badge-'+type}>{labels[type]||type}</span>
}

export const ConfidenceBadge = ({ score }) => {
  const pct = Math.round((score||0)*100)
  const color = pct>=80?'var(--green)':pct>=50?'var(--yellow)':'var(--kalro-red-light)'
  return (
    <div className="confidence-bar">
      <div className="confidence-bar-track">
        <div className="confidence-bar-fill" style={{width:pct+'%',background:color}}/>
      </div>
      <span style={{fontFamily:'var(--font-mono)',fontSize:11,color,minWidth:30}}>{pct}%</span>
    </div>
  )
}

export const SlaIndicator = ({ inc }) => {
  if (!inc.sla_deadline) return null
  const mins = inc.sla_minutes_remaining
  if (inc.sla_breached) return <span className="sla-breach">⚠ SLA BREACHED</span>
  if (mins < 60) return <span className="sla-warn">⏱ {mins}m left</span>
  if (mins < 240) return <span className="sla-warn">⏱ {Math.round(mins/60)}h left</span>
  return <span className="sla-ok">⏱ {Math.round(mins/60)}h left</span>
}

export const Tags = ({ tags=[] }) => (
  <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
    {tags.map(t=><span key={t} className="tag">{t}</span>)}
  </div>
)

export const Loading = () => (
  <div className="loading"><div className="spinner"/><span>Loading...</span></div>
)

export const EmptyState = ({ icon='◈', title, sub }) => (
  <div className="empty-state">
    <div className="empty-icon">{icon}</div>
    <h3>{title}</h3>
    {sub && <p style={{fontSize:14}}>{sub}</p>}
  </div>
)

export const timeAgo = (d) => {
  if (!d) return '—'
  const diff=Date.now()-new Date(d), m=Math.floor(diff/60000)
  if (m<60) return m+'m ago'
  const h=Math.floor(m/60); if (h<24) return h+'h ago'
  const days=Math.floor(h/24); if (days<30) return days+'d ago'
  return new Date(d).toLocaleDateString()
}

export const fmtDate = (d) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-KE',{day:'numeric',month:'short',year:'numeric'})
}

export const fmtDateTime = (d) => {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-KE',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})
}
`);

// ─── LAYOUT ───────────────────────────────────────────────────────────────────

write('client/src/components/Layout.jsx', `import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const NAV = [
  { to:'/',          label:'Dashboard',     icon:'⬡', exact:true },
  { to:'/incidents', label:'Incidents',      icon:'⚡' },
  { to:'/knowledge', label:'Knowledge Base', icon:'◈' },
  { to:'/search',    label:'Search',         icon:'◎' },
]
const ADMIN_NAV = [
  { to:'/reports', label:'Reports', icon:'▤' },
  { to:'/users',   label:'Users',   icon:'◉' },
]

export default function Layout() {
  const { user, logout, isAdmin } = useAuth()
  const navigate = useNavigate()
  const roleColor = { super_admin:'var(--kalro-green-light)', analyst:'var(--accent)', viewer:'var(--yellow)' }
  const navStyle = (active) => ({
    display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:6,
    fontWeight:500, fontSize:14, marginBottom:2, textDecoration:'none',
    color: active?'var(--kalro-green-light)':'var(--text2)',
    background: active?'var(--kalro-green-glow)':'transparent',
    borderLeft: active?'2px solid var(--kalro-green-light)':'2px solid transparent',
    transition:'all 0.15s'
  })

  return (
    <div className="app-layout">
      <aside className="sidebar">
        {/* Logo */}
        <div style={{padding:'22px 20px 18px',borderBottom:'1px solid var(--border)'}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
            {/* KALRO green + red color blocks mimicking brand */}
            <div style={{display:'flex',gap:2}}>
              <div style={{width:8,height:28,background:'var(--kalro-green)',borderRadius:2}}/>
              <div style={{width:8,height:28,background:'var(--kalro-red)',borderRadius:2}}/>
            </div>
            <div>
              <div style={{fontFamily:'var(--font-mono)',fontSize:14,fontWeight:700,color:'var(--kalro-green-light)',letterSpacing:2}}>KALRO</div>
              <div style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--text3)',letterSpacing:1}}>IK Framework v2.0</div>
            </div>
          </div>
          <div style={{height:1,background:'linear-gradient(90deg,var(--kalro-green) 0%,var(--kalro-red) 50%,transparent 100%)',opacity:0.4,marginTop:8}}/>
        </div>
        {/* Nav */}
        <nav style={{padding:'14px 12px',flex:1}}>
          <div style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--text3)',textTransform:'uppercase',letterSpacing:1.5,padding:'0 8px',marginBottom:8}}>Navigation</div>
          {NAV.map(({to,label,icon,exact})=>(
            <NavLink key={to} to={to} end={exact} style={({isActive})=>navStyle(isActive)}>
              <span style={{fontFamily:'var(--font-mono)',fontSize:15,lineHeight:1}}>{icon}</span>{label}
            </NavLink>
          ))}
          {isAdmin && <>
            <div style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--text3)',textTransform:'uppercase',letterSpacing:1.5,padding:'12px 8px 8px',marginTop:8,borderTop:'1px solid var(--border)'}}>Admin</div>
            {ADMIN_NAV.map(({to,label,icon})=>(
              <NavLink key={to} to={to} style={({isActive})=>navStyle(isActive)}>
                <span style={{fontFamily:'var(--font-mono)',fontSize:15,lineHeight:1}}>{icon}</span>{label}
              </NavLink>
            ))}
          </>}
        </nav>
        {/* User */}
        <div style={{padding:'14px',borderTop:'1px solid var(--border)'}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
            <div style={{width:34,height:34,borderRadius:'50%',background:'var(--kalro-green-glow)',border:'1px solid var(--kalro-green)',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--font-mono)',fontSize:13,color:'var(--kalro-green-light)',fontWeight:700}}>
              {user?.name?.charAt(0)}
            </div>
            <div style={{flex:1,overflow:'hidden'}}>
              <div style={{fontSize:13,fontWeight:600,color:'var(--text)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{user?.name}</div>
              <div style={{fontSize:11,fontFamily:'var(--font-mono)',color:roleColor[user?.role]||'var(--text3)'}}>{user?.role?.replace('_',' ')}</div>
            </div>
          </div>
          <button onClick={()=>{logout();navigate('/login');}} className="btn btn-ghost btn-sm" style={{width:'100%',justifyContent:'center'}}>Sign out</button>
        </div>
      </aside>
      <main className="main-content"><Outlet/></main>
    </div>
  )
}
`);

console.log('\n✅  Part 2 done — client config, KALRO CSS, Layout, Shared written.');
