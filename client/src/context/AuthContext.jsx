import { createContext, useContext, useState } from 'react'
import api from '../api/axios'
const Ctx = createContext(null)
export const AuthProvider = ({ children }) => {
  const [user,setUser] = useState(()=>{ try{ return JSON.parse(localStorage.getItem('user')) }catch{ return null } })
  const login = async(email,password) => { const r=await api.post('/auth/login',{email,password}); localStorage.setItem('token',r.data.token); localStorage.setItem('user',JSON.stringify(r.data.user)); setUser(r.data.user); return r.data.user; }
  const logout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); setUser(null); }
  return <Ctx.Provider value={{ user, login, logout, isAdmin:user?.role==='super_admin', isAnalyst:user?.role==='analyst'||user?.role==='super_admin', station_id:user?.station_id }}>{children}</Ctx.Provider>
}
export const useAuth = () => useContext(Ctx)
