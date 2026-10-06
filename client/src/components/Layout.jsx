import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import NotificationCenter from './NotificationCenter'

const NAV = [
  { to:'/',          label:'Dashboard',     icon:'⬡', exact:true },
  { to:'/incidents', label:'Incidents',      icon:'⚡' },
  { to:'/knowledge', label:'Knowledge Base', icon:'◈' },
  { to:'/defensive-routines', label:'Defensive Routines', icon:'🎯' },
  { to:'/search',    label:'Search',         icon:'◎' },
  { to:'/notifications', label:'Notifications', icon:'🔔' },
  { to:'/operational-testing', label:'Operational Testing', icon:'⏱' },
]
const ADMIN_NAV = [
  { to:'/reports', label:'Reports', icon:'▤' },
  { to:'/users',   label:'Users',   icon:'◉' },
  { to:'/config/game-theory', label:'Game Theory Config', icon:'⚖️' },
  { to:'/config/sde-governance', label:'SDE Governance', icon:'🧠' },
  { to:'/sync-dashboard', label:'Hub Sync', icon:'🌐' },
  { to:'/station-management', label:'Station Management', icon:'🏛️' },
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
              {user?.station_id && <div style={{fontSize:11,fontFamily:'var(--font-mono)',color:'var(--kalro-green-light)',marginTop:2}}>📍 {user?.station_id}</div>}
            </div>
          </div>
          <button onClick={()=>{logout();navigate('/login');}} className="btn btn-ghost btn-sm" style={{width:'100%',justifyContent:'center'}}>Sign out</button>
        </div>
      </aside>
      <main className="main-content" style={{display:'flex',flexDirection:'column'}}>
        <div style={{padding:'12px 20px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'flex-end',alignItems:'center',gap:15,backgroundColor:'var(--surface)'}}>
          <NotificationCenter/>
        </div>
        <div style={{flex:1,overflowY:'auto'}}><Outlet/></div>
      </main>
    </div>
  )
}
