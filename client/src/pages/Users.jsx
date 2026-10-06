import { useState, useEffect } from 'react'
import api from '../api/axios'
import { Loading, fmtDate } from '../components/Shared'
import { useAuth } from '../context/AuthContext'

const ROLES=['super_admin','analyst','viewer']

export default function Users() {
  const [users,setUsers]=useState([]), [loading,setLoading]=useState(true)
  const [stations,setStations]=useState([])
  const [showModal,setShowModal]=useState(false), [editUser,setEditUser]=useState(null)
  const [form,setForm]=useState({name:'',email:'',password:'',role:'analyst',department:'',station_id:''})
  const [submitting,setSubmitting]=useState(false), [error,setError]=useState(''), [success,setSuccess]=useState('')
  const { user:me }=useAuth()
  const load=()=>{ setLoading(true); api.get('/auth/users').then(r=>setUsers(r.data)).finally(()=>setLoading(false)) }
  useEffect(()=>{ load(); api.get('/stations').then(r=>setStations(r.data||[])).catch(()=>{}) },[])
  const openCreate=()=>{ setEditUser(null); setForm({name:'',email:'',password:'',role:'analyst',department:'',station_id:''}); setError(''); setShowModal(true) }
  const openEdit=(u)=>{ setEditUser(u); setForm({name:u.name,email:u.email,password:'',role:u.role,department:u.department||'',station_id:u.station_id||''}); setError(''); setShowModal(true) }
  const handleSubmit=async(e)=>{ e.preventDefault(); setSubmitting(true); setError('')
    try{ editUser?await api.put('/auth/users/'+editUser.id,{name:form.name,role:form.role,department:form.department,station_id:form.station_id}):await api.post('/auth/users',form); setSuccess(editUser?'Updated.':'Created.'); setShowModal(false); load(); setTimeout(()=>setSuccess(''),3000) }
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
                {u.station_id&&<span className="tag">{u.station_id}</span>}
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
              <div className="form-group"><label className="form-label">Station</label><select value={form.station_id} onChange={e=>setForm(f=>({...f,station_id:e.target.value}))}>
                <option value="">Select station</option>
                {stations.map(s=><option key={s.id||s.name} value={s.name}>{s.label||s.name}</option>)}
              </select></div>
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
