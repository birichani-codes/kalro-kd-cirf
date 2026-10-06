import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
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
import DefensiveRoutines from './pages/DefensiveRoutines'
import GameTheoryConfig from './pages/GameTheoryConfig'
import SDEGovernance from './pages/SDEGovernance'
import SyncDashboard from './pages/SyncDashboard'
import StationManagement from './pages/StationManagement'
import Notifications from './pages/Notifications'
import OperationalTesting from './pages/OperationalTesting'

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
            <Route path="defensive-routines" element={<DefensiveRoutines/>}/>
            <Route path="search" element={<Search/>}/>
            <Route path="reports" element={<Guard adminOnly><Reports/></Guard>}/>
            <Route path="users" element={<Guard adminOnly><Users/></Guard>}/>
            <Route path="notifications" element={<Notifications/>}/>
            <Route path="operational-testing" element={<OperationalTesting/>}/>
            <Route path="config/game-theory" element={<Guard adminOnly><GameTheoryConfig/></Guard>}/>
            <Route path="config/sde-governance" element={<Guard adminOnly><SDEGovernance/></Guard>}/>
            <Route path="sync-dashboard" element={<Guard adminOnly><SyncDashboard/></Guard>}/>
            <Route path="station-management" element={<Guard adminOnly><StationManagement/></Guard>}/>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
