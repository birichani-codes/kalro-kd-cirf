import { useState, useEffect } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

export default function StationManagement() {
  const { isAdmin } = useAuth();
  const [stations, setStations] = useState([]);
  const [stationHealth, setStationHealth] = useState([]);
  const [globalRoutines, setGlobalRoutines] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [majorIncidents, setMajorIncidents] = useState([]);
  const [networkMetrics, setNetworkMetrics] = useState(null);
  const [knowledgeAlerts, setKnowledgeAlerts] = useState([]);
  const [routineEffectiveness, setRoutineEffectiveness] = useState([]);
  const [crossSiteIncidents, setCrossSiteIncidents] = useState([]);
  const [responseAnalytics, setResponseAnalytics] = useState(null);
  const [socioTechnicalRisk, setSocioTechnicalRisk] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [tab, setTab] = useState('overview'); // 'overview', 'station-health', 'global-routines', 'pending-approvals', 'knowledge-alerts', 'resilience', 'cross-site', 'response-analytics', 'socio-technical'

  const TAB_ITEMS = [
    { id: 'overview', label: 'Network Overview' },
    { id: 'station-health', label: 'Station Health' },
    { id: 'global-routines', label: 'Global Routines' },
    { id: 'pending-approvals', label: 'Pending Approvals' },
    { id: 'knowledge-alerts', label: 'Knowledge Alerts' },
    { id: 'resilience', label: 'Resilience Metrics' },
    { id: 'routine-effectiveness', label: 'Routine Effectiveness' },
    { id: 'cross-site', label: 'Cross-Site Incidents' },
    { id: 'response-analytics', label: 'Response Analytics' },
    { id: 'socio-technical', label: 'STS Risk' }
  ];

  const loadData = async () => {
    setLoading(true);
    setFetchError('');
    const requests = [
      api.get('/sync/stations'),
      api.get('/sync/station-health'),
      api.get('/sync/global-routines'),
      api.get('/sync/pending-approvals'),
      api.get('/sync/network-resilience'),
      api.get('/sync/knowledge-alerts'),
      api.get('/sync/routine-effectiveness'),
      api.get('/sync/cross-site-incidents'),
      api.get('/sync/response-analytics'),
      api.get('/sync/socio-technical-risk')
    ];

    const results = await Promise.allSettled(requests);
    try {
      if (results[0].status === 'fulfilled') setStations(results[0].value.data);
      if (results[1].status === 'fulfilled') setStationHealth(results[1].value.data);
      if (results[2].status === 'fulfilled') setGlobalRoutines(results[2].value.data);
      if (results[3].status === 'fulfilled') setPendingApprovals(results[3].value.data);
      if (results[4].status === 'fulfilled') setNetworkMetrics(results[4].value.data);
      if (results[5].status === 'fulfilled') setKnowledgeAlerts(results[5].value.data);
      if (results[6].status === 'fulfilled') setRoutineEffectiveness(results[6].value.data);
      if (results[7].status === 'fulfilled') setCrossSiteIncidents(results[7].value.data);
      if (results[8].status === 'fulfilled') setResponseAnalytics(results[8].value.data);
      if (results[9].status === 'fulfilled') setSocioTechnicalRisk(results[9].value.data);

      const miRes = await api.get('/incidents?is_major=true');
      setMajorIncidents(miRes.data.filter(i => ['open','investigating','escalated'].includes(i.status)));
    } catch (err) {
      console.error('Load failed:', err);
      setFetchError('Some dashboard data could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    loadData();
  }, [isAdmin]);

  const handleApprove = async (knowledgeId) => {
    try {
      await api.post(`/sync/approve/${knowledgeId}`);
      loadData(); // Refresh data
    } catch (err) {
      console.error('Approval failed:', err);
      alert('Failed to approve routine');
    }
  };

  const handleReject = async (knowledgeId) => {
    const reason = prompt('Reason for rejection (optional):');
    try {
      await api.post(`/sync/reject/${knowledgeId}`, { reason });
      loadData(); // Refresh data
    } catch (err) {
      console.error('Rejection failed:', err);
      alert('Failed to reject routine');
    }
  };

  if (!isAdmin) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text3)' }}>
        <p>Super Admin access required for Station Management</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>
      <h1>🏛️ Hub Sync Management</h1>
      <p style={{ color: 'var(--text3)', marginBottom: '20px' }}>
        Network-wide governance and strategic oversight for the KALRO hub-and-spoke system
      </p>

      {/* Network Awareness Banner */}
      {majorIncidents.length > 0 && (
        <div
          style={{
            backgroundColor: 'var(--kalro-red-light)',
            border: '2px solid var(--kalro-red)',
            borderRadius: '8px',
            padding: '15px',
            marginBottom: '20px',
            color: 'var(--kalro-red)'
          }}
        >
          <h3 style={{ margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '10px', color: '#ffffff' }}>
            🚨 Network Awareness: Active Major Incidents
          </h3>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px' }}>
            {majorIncidents.slice(0, 5).map(incident => (
             <div
                key={incident.id}
                style={{
                  backgroundColor: '#0f172a',
                  padding: '10px',
                  borderRadius: '6px',
                  border: '1px solid var(--kalro-red)',
                  minWidth: '200px',
                  color: '#ffffff'
                }}
              >
                <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '5px' }}>
                  {incident.title}
                </div>

                <div style={{ fontSize: '12px', color: 'var(--text3)' }}>
                  📍 {incident.station_id || 'Headquarters'} • {incident.severity} • {incident.status}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '5px' }}>
                  {new Date(incident.created_at).toLocaleString()}
                </div>
              </div>
            ))}
            {majorIncidents.length > 5 && (
              <div style={{ padding: '10px', alignSelf: 'center', color: 'var(--text3)' }}>
                +{majorIncidents.length - 5} more...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '20px', borderBottom: '2px solid var(--border)' }}>
        {TAB_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            style={{
              padding: '10px 18px',
              backgroundColor: tab === item.id ? 'var(--kalro-green)' : 'var(--surface)',
              color: tab === item.id ? 'white' : 'var(--text)',
              border: 'none',
              borderRadius: '4px 4px 0 0',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            {item.id === 'pending-approvals' ? `⏳ ${item.label} (${pendingApprovals.length})` : item.label}
          </button>
        ))}
      </div>
      {fetchError && (
        <div style={{ marginBottom: '20px', color: 'var(--kalro-red)', fontWeight: 'bold' }}>
          {fetchError}
        </div>
      )}

      {loading ? (
        <p>Loading station data...</p>
      ) : (
        <>
          {tab === 'overview' && (
            <div>
              <h2>Hub-Spoke Network</h2>
              <div
                style={{
                  padding: '20px',
                  backgroundColor: 'var(--bg3)',
                  borderRadius: '8px',
                  marginBottom: '30px',
                  border: '1px solid var(--border)'
                }}
              >
                <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                  <div
                    style={{
                      display: 'flex',
                      width: '80px',
                      height: '80px',
                      backgroundColor: 'var(--kalro-red)',
                      color: 'white',
                      borderRadius: '50%',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '32px',
                      fontWeight: 'bold',
                      marginBottom: '10px'
                    }}
                  >
                    🏢
                  </div>
                  <p style={{ fontSize: '18px', fontWeight: 'bold', margin: '10px 0' }}>KALRO Headquarters (HUB)</p>
                  <p style={{ color: 'var(--text3)', fontSize: '14px' }}>Central policy management, approvals, consolidated reporting</p>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '20px',
                    marginTop: '30px'
                  }}
                >
                  {stations.map(station => (
                    <div
                      key={station.name}
                      style={{
                        padding: '15px',
                        backgroundColor: 'var(--bg2)',
                        border: '2px solid var(--kalro-green)',
                        borderRadius: '6px',
                        textAlign: 'center'
                      }}
                    >
                      <p style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--kalro-green)', margin: '0 0 10px 0' }}>
                        🔗 SPOKE: {station.name}
                      </p>
                      <div style={{ fontSize: '12px', color: 'var(--text3)', margin: '5px 0' }}>
                        <p>📋 Incidents: {station.total_incidents}</p>
                        <p>👥 Users: {station.users}</p>
                        <p>📚 Local Routines: {station.local_routines}</p>
                      </div>
                      <p style={{ fontSize: '10px', color: 'var(--text3)', margin: '10px 0 0 0' }}>
                        Last sync: {new Date(station.synced_at).toLocaleTimeString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Station Statistics */}
              <h2>Network Statistics</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginBottom: '30px' }}>
                {[
                  { label: 'Total Stations', value: stations.length, color: 'var(--kalro-green)' },
                  {
                    label: 'Total Incidents',
                    value: stations.reduce((sum, s) => sum + s.total_incidents, 0),
                    color: 'var(--kalro-red)'
                  },
                  {
                    label: 'Total Users',
                    value: stations.reduce((sum, s) => sum + s.users, 0),
                    color: 'var(--kalro-green-light)'
                  },
                  {
                    label: 'Local Routines',
                    value: stations.reduce((sum, s) => sum + s.local_routines, 0),
                    color: 'var(--kalro-red-light)'
                  }
                ].map((stat, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '20px',
                      backgroundColor: stat.color,
                      color: 'white',
                      borderRadius: '6px',
                      textAlign: 'center'
                    }}
                  >
                    <p style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 5px 0' }}>{stat.value}</p>
                    <p style={{ fontSize: '12px', margin: 0 }}>{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'global-routines' && (
            <div>
              <h2>Globally Approved Defensive Routines</h2>
              <p style={{ color: 'var(--text3)', marginBottom: '20px' }}>
                These routines are approved and available to all stations across the network
              </p>
              {globalRoutines.length === 0 ? (
                <p style={{ color: 'var(--text3)' }}>No global routines approved yet</p>
              ) : (
                <div style={{ display: 'grid', gap: '15px' }}>
                  {globalRoutines.map(routine => (
                    <div
                      key={routine.id}
                      style={{
                        padding: '15px',
                        border: '1px solid var(--kalro-green)',
                        borderRadius: '6px',
                        backgroundColor: 'var(--kalro-green-pale)',
                        borderLeft: '4px solid var(--kalro-green)'
                      }}
                    >
                      <h4 style={{ margin: '0 0 10px 0' }}>{routine.title}</h4>
                      <p style={{ margin: '5px 0', fontSize: '14px', color: 'var(--text3)' }}>
                        <strong>Source:</strong> {routine.station_id || 'Hub'}
                      </p>
                      <p style={{ margin: '5px 0', fontSize: '14px', color: 'var(--text3)' }}>
                        <strong>Approved:</strong> {new Date(routine.approved_at).toLocaleDateString()}
                      </p>
                      <p style={{ margin: '5px 0', fontSize: '14px', lineHeight: '1.5' }}>
                        {routine.content.substring(0, 200)}...
                      </p>
                      {routine.tags && routine.tags.length > 0 && (
                        <div style={{ marginTop: '10px' }}>
                          {routine.tags.map((tag, i) => (
                            <span
                              key={i}
                              style={{
                                display: 'inline-block',
                                padding: '4px 8px',
                                backgroundColor: 'var(--kalro-green)',
                                color: 'white',
                                borderRadius: '3px',
                                fontSize: '12px',
                                marginRight: '5px',
                                marginBottom: '5px'
                              }}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'pending-approvals' && (
            <div>
              <h2>Pending Global Routine Approvals</h2>
              <p style={{ color: 'var(--text3)', marginBottom: '20px' }}>
                Review and approve defensive routines submitted by local stations for global adoption.
              </p>
              {pendingApprovals.length === 0 ? (
                <p style={{ color: 'var(--text3)' }}>No pending approvals.</p>
              ) : (
                <div style={{ display: 'grid', gap: '15px' }}>
                  {pendingApprovals.map(approval => (
                    <div
                      key={approval.id}
                      style={{
                        padding: '15px',
                        border: '1px solid var(--kalro-red)',
                        borderRadius: '6px',
                        backgroundColor: 'var(--kalro-red-pale)',
                        borderLeft: '4px solid var(--kalro-red)'
                      }}
                    >
                      <h4 style={{ margin: '0 0 10px 0' }}>{approval.title}</h4>
                      <p style={{ margin: '5px 0', fontSize: '14px', color: 'var(--text3)' }}>
                        <strong>Station:</strong> {approval.station_id}
                      </p>
                      <p style={{ margin: '5px 0', fontSize: '14px', color: 'var(--text3)' }}>
                        <strong>Submitted:</strong> {approval.pushed_at ? new Date(approval.pushed_at).toLocaleDateString() : 'Unknown'}
                      </p>
                      <p style={{ margin: '5px 0', fontSize: '14px', lineHeight: '1.5' }}>
                        {approval.content_preview}
                      </p>
                      {approval.tags && approval.tags.length > 0 && (
                        <div style={{ marginTop: '10px' }}>
                          {approval.tags.map((tag, i) => (
                            <span
                              key={i}
                              style={{
                                display: 'inline-block',
                                padding: '4px 8px',
                                backgroundColor: 'var(--kalro-red)',
                                color: 'white',
                                borderRadius: '3px',
                                fontSize: '12px',
                                marginRight: '5px',
                                marginBottom: '5px'
                              }}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <div style={{ marginTop: '15px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <button
                          onClick={() => handleApprove(approval.id)}
                          style={{
                            padding: '8px 16px',
                            backgroundColor: 'var(--kalro-green)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                        >
                          ✅ Approve
                        </button>
                        <button
                          onClick={() => handleReject(approval.id)}
                          style={{
                            padding: '8px 16px',
                            backgroundColor: 'var(--kalro-red)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                        >
                          ❌ Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'knowledge-alerts' && (
            <div>
              <h2>Knowledge Pulse Alerts</h2>
              <p style={{ color: 'var(--text3)', marginBottom: '20px' }}>
                Alerts for cross-site knowledge patterns and correlated incidents.
              </p>
              {knowledgeAlerts.length === 0 ? (
                <p style={{ color: 'var(--text3)' }}>No alerts detected.</p>
              ) : (
                <div style={{ display: 'grid', gap: '15px' }}>
                  {knowledgeAlerts.map(alert => (
                    <div
                      key={alert.id}
                      style={{
                        padding: '15px',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        backgroundColor: 'var(--bg2)'
                      }}
                    >
                      <h4 style={{ margin: '0 0 10px 0' }}>{alert.title}</h4>
                      <div style={{ display: 'grid', gap: '8px' }}>
                        <p style={{ margin: 0, color: 'var(--text3)' }}>
                          <strong>Source Station:</strong> {alert.source_station || 'Unknown'}
                        </p>
                        <p style={{ margin: 0, color: 'var(--text3)' }}>
                          <strong>Incident Count:</strong> {alert.incident_count}
                        </p>
                        <p style={{ margin: 0, color: 'var(--text3)' }}>
                          <strong>Stations:</strong> {alert.stations_with_similar_incidents.join(', ')}
                        </p>
                        <p style={{ margin: 0, color: 'var(--text3)' }}>
                          <strong>Confidence:</strong> {Math.round((alert.confidence_score || 0) * 100)}%
                        </p>
                      </div>
                      {alert.tags && alert.tags.length > 0 && (
                        <div style={{ marginTop: '12px' }}>
                          {alert.tags.map((tag, i) => (
                            <span
                              key={i}
                              style={{
                                display: 'inline-block',
                                padding: '4px 8px',
                                backgroundColor: 'var(--kalro-green)',
                                color: 'white',
                                borderRadius: '3px',
                                fontSize: '12px',
                                marginRight: '5px',
                                marginBottom: '5px'
                              }}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'resilience' && (
            <div>
              <h2>Network Resilience Metrics</h2>
              <p style={{ color: 'var(--text3)', marginBottom: '20px' }}>
                Resilience scores and health indicators across the incident response network.
              </p>
              {!networkMetrics ? (
                <p style={{ color: 'var(--text3)' }}>Resilience metrics unavailable.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '15px', marginBottom: '25px' }}>
                  {[
                    { label: 'Resolution Rate', value: `${networkMetrics.resolution_rate}%`, color: 'var(--kalro-green)' },
                    { label: 'SLA Compliance', value: `${networkMetrics.sla_compliance}%`, color: 'var(--kalro-green-light)' },
                    { label: 'Major Incident Resolution', value: `${networkMetrics.major_incident_resolution_rate}%`, color: 'var(--kalro-red)' },
                    { label: 'Routine Effectiveness', value: `${networkMetrics.routine_effectiveness_score}`, color: 'var(--kalro-blue)' },
                    { label: 'Network Health Score', value: `${networkMetrics.network_health_score}`, color: 'var(--kalro-green)' }
                  ].map((stat, i) => (
                    <div key={i} style={{ padding: '18px', borderRadius: '8px', backgroundColor: stat.color, color: 'white' }}>
                      <p style={{ margin: 0, fontSize: '22px', fontWeight: 'bold' }}>{stat.value}</p>
                      <p style={{ margin: '8px 0 0 0', fontSize: '13px' }}>{stat.label}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'routine-effectiveness' && (
            <div>
              <h2>Routine Effectiveness</h2>
              <p style={{ color: 'var(--text3)', marginBottom: '20px' }}>
                Evaluate global routine performance and adoption trends.
              </p>
              {routineEffectiveness.length === 0 ? (
                <p style={{ color: 'var(--text3)' }}>No effectiveness data available.</p>
              ) : (
                <div style={{ display: 'grid', gap: '15px' }}>
                  {routineEffectiveness.map(routine => (
                    <div
                      key={routine.id}
                      style={{
                        padding: '16px',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        backgroundColor: 'var(--bg2)'
                      }}
                    >
                      <h4 style={{ margin: '0 0 8px 0' }}>{routine.title}</h4>
                      <p style={{ margin: '0 0 10px 0', color: 'var(--text3)' }}>
                        <strong>Source:</strong> {routine.station_source || 'Hub'}
                      </p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                        <div style={{ padding: '10px', backgroundColor: 'white', borderRadius: '6px' }}>
                          <p style={{ margin: 0, fontWeight: 'bold' }}>{routine.applications_count}</p>
                          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text3)' }}>Applications</p>
                        </div>
                        <div style={{ padding: '10px', backgroundColor: 'white', borderRadius: '6px' }}>
                          <p style={{ margin: 0, fontWeight: 'bold' }}>{Math.round((routine.success_rate || 0) * 100)}%</p>
                          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text3)' }}>Success Rate</p>
                        </div>
                        <div style={{ padding: '10px', backgroundColor: 'white', borderRadius: '6px' }}>
                          <p style={{ margin: 0, fontWeight: 'bold' }}>{routine.payoff_rating}</p>
                          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text3)' }}>Payoff Rating</p>
                        </div>
                        <div style={{ padding: '10px', backgroundColor: 'white', borderRadius: '6px' }}>
                          <p style={{ margin: 0, fontWeight: 'bold' }}>{routine.last_applied ? new Date(routine.last_applied).toLocaleDateString() : 'N/A'}</p>
                          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text3)' }}>Last Applied</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'cross-site' && (
            <div>
              <h2>Cross-Site Incident Correlation</h2>
              <p style={{ color: 'var(--text3)', marginBottom: '20px' }}>
                Track related incident patterns across stations.
              </p>
              {crossSiteIncidents.length === 0 ? (
                <p style={{ color: 'var(--text3)' }}>No cross-site incident groups identified.</p>
              ) : (
                <div style={{ display: 'grid', gap: '15px' }}>
                  {crossSiteIncidents.map(group => (
                    <div
                      key={group.incident_type}
                      style={{ padding: '16px', borderRadius: '8px', backgroundColor: 'var(--bg2)', border: '1px solid var(--border)' }}
                    >
                      <h4 style={{ margin: '0 0 10px 0' }}>{group.incident_type}</h4>
                      <p style={{ margin: '0 0 10px 0', color: 'var(--text3)' }}>
                        {group.total_count} incidents across {group.stations_affected.length} stations • {group.pattern}
                      </p>
                      <div style={{ display: 'grid', gap: '10px' }}>
                        {group.incidents.map(incident => (
                          <div key={incident.id} style={{ padding: '10px', borderRadius: '6px', backgroundColor: 'white', border: '1px solid var(--border)' }}>
                            <p style={{ margin: '0 0 4px 0', fontWeight: 'bold' }}>{incident.title}</p>
                            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text3)' }}>
                              {incident.station_id || 'Unknown'} • {incident.status} • {incident.severity}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'response-analytics' && (
            <div>
              <h2>Response Analytics</h2>
              <p style={{ color: 'var(--text3)', marginBottom: '20px' }}>
                Review SLA compliance and resolution timing across stations and incident types.
              </p>
              {!responseAnalytics ? (
                <p style={{ color: 'var(--text3)' }}>Response analytics unavailable.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '25px' }}>
                  <div>
                    <h3 style={{ marginBottom: '12px' }}>By Station</h3>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border)' }}>
                            <th style={{ padding: '10px' }}>Station</th>
                            <th style={{ padding: '10px' }}>Total</th>
                            <th style={{ padding: '10px' }}>SLA %</th>
                            <th style={{ padding: '10px' }}>Avg Resolution (hrs)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {responseAnalytics.by_station.map(item => (
                            <tr key={item.key} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '10px' }}>{item.key}</td>
                              <td style={{ padding: '10px' }}>{item.total_incidents}</td>
                              <td style={{ padding: '10px' }}>{item.sla_compliance_percent}%</td>
                              <td style={{ padding: '10px' }}>{item.avg_resolution_hours}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div>
                    <h3 style={{ marginBottom: '12px' }}>By Incident Type</h3>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border)' }}>
                            <th style={{ padding: '10px' }}>Incident Type</th>
                            <th style={{ padding: '10px' }}>Total</th>
                            <th style={{ padding: '10px' }}>SLA %</th>
                            <th style={{ padding: '10px' }}>Avg Resolution (hrs)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {responseAnalytics.by_incident_type.map(item => (
                            <tr key={item.key} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '10px' }}>{item.key}</td>
                              <td style={{ padding: '10px' }}>{item.total_incidents}</td>
                              <td style={{ padding: '10px' }}>{item.sla_compliance_percent}%</td>
                              <td style={{ padding: '10px' }}>{item.avg_resolution_hours}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'socio-technical' && (
            <div>
              <h2>Socio-Technical Risk</h2>
              <p style={{ color: 'var(--text3)', marginBottom: '20px' }}>
                View training readiness, policy compliance, and hybrid risk across stations.
              </p>
              {socioTechnicalRisk.length === 0 ? (
                <p style={{ color: 'var(--text3)' }}>No socio-technical risk information available.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border)' }}>
                        <th style={{ padding: '10px' }}>Station</th>
                        <th style={{ padding: '10px' }}>Tech Incidents</th>
                        <th style={{ padding: '10px' }}>Social Incidents</th>
                        <th style={{ padding: '10px' }}>Hybrid Incidents</th>
                        <th style={{ padding: '10px' }}>Training</th>
                        <th style={{ padding: '10px' }}>Compliance</th>
                        <th style={{ padding: '10px' }}>Infrastructure</th>
                        <th style={{ padding: '10px' }}>Risk Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {socioTechnicalRisk.map(row => (
                        <tr key={row.station_id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px' }}>{row.station_id}</td>
                          <td style={{ padding: '10px' }}>{row.technical_incidents}</td>
                          <td style={{ padding: '10px' }}>{row.social_incidents}</td>
                          <td style={{ padding: '10px' }}>{row.hybrid_incidents}</td>
                          <td style={{ padding: '10px' }}>{Math.round((row.training_readiness || 0) * 100)}%</td>
                          <td style={{ padding: '10px' }}>{Math.round((row.policy_compliance || 0) * 100)}%</td>
                          <td style={{ padding: '10px' }}>{Math.round((row.infrastructure_maturity || 0) * 100)}%</td>
                          <td style={{ padding: '10px' }}>{Math.round((row.sts_risk_score || 0) * 100)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
