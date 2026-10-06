import { useState } from 'react'
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
