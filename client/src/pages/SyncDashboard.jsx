import { useState, useEffect } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

const STATIONS = ['Muguga', 'Kiboko', 'Mtwapa', 'Kabati'];

export default function SyncDashboard() {
  const { isAdmin } = useAuth();
  const [stations, setStations] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedStation, setSelectedStation] = useState(null);
  const [stationStatus, setStationStatus] = useState(null);

  useEffect(() => {
    if (!isAdmin) return;
    loadStations();
    loadPending();
  }, [isAdmin]);

  const loadStations = async () => {
    try {
      const res = await api.get('/sync/stations');
      setStations(res.data);
    } catch (err) {
      console.error('Failed to load stations:', err);
    }
  };

  const loadPending = async () => {
    try {
      const res = await api.get('/sync/pending-approvals');
      setPending(res.data);
      setLoading(false);
    } catch (err) {
      console.error('Failed to load pending:', err);
      setLoading(false);
    }
  };

  const handleApprove = async (knowledgeId) => {
    try {
      await api.post(`/sync/approve/${knowledgeId}`);
      await loadPending();
      setStations(s => s.map(st => ({ ...st, synced_at: new Date().toISOString() })));
    } catch (err) {
      console.error('Approve failed:', err);
    }
  };

  const handleReject = async (knowledgeId) => {
    const reason = prompt('Rejection reason:');
    if (!reason) return;
    try {
      await api.post(`/sync/reject/${knowledgeId}`, { reason });
      await loadPending();
    } catch (err) {
      console.error('Reject failed:', err);
    }
  };

  const handleViewStationStatus = async (stationId) => {
    try {
      const res = await api.get(`/sync/status/${stationId}`);
      setSelectedStation(stationId);
      setStationStatus(res.data);
    } catch (err) {
      console.error('Status fetch failed:', err);
    }
  };

  if (!isAdmin) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text3)' }}>
        <p>Super Admin access required for Hub Sync Dashboard</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>
      <h1>🌐 Hub Sync Management Dashboard</h1>
      <p style={{ color: 'var(--text3)', marginBottom: '20px' }}>
        Manage station synchronization, approve global routines, and monitor hub-spoke health
      </p>

      {/* Stations Overview */}
      <div style={{ marginBottom: '40px' }}>
        <h2>📍 Stations Overview</h2>
        {loading ? (
          <p>Loading...</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--surface)', borderBottom: '2px solid var(--border)' }}>
                <th style={{ padding: '10px', textAlign: 'left' }}>Station</th>
                <th style={{ padding: '10px', textAlign: 'center' }}>Incidents</th>
                <th style={{ padding: '10px', textAlign: 'center' }}>Users</th>
                <th style={{ padding: '10px', textAlign: 'center' }}>Local Routines</th>
                <th style={{ padding: '10px', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {stations.map(station => (
                <tr key={station.name} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px', fontWeight: 'bold' }}>{station.name}</td>
                  <td style={{ padding: '10px', textAlign: 'center' }}>
                    {station.total_incidents} <span style={{ color: 'var(--kalro-red)', fontSize: '12px' }}>({station.open_incidents} open)</span>
                  </td>
                  <td style={{ padding: '10px', textAlign: 'center' }}>{station.users}</td>
                  <td style={{ padding: '10px', textAlign: 'center' }}>{station.local_routines}</td>
                  <td style={{ padding: '10px', textAlign: 'center' }}>
                    <button
                      onClick={() => handleViewStationStatus(station.name)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: 'var(--kalro-green)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      View Status
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Station Detailed Status */}
      {stationStatus && (
        <div
          style={{
            padding: '15px',
            backgroundColor: '#0f172a',
            borderLeft: '4px solid var(--kalro-green)',
            marginBottom: '20px',
            borderRadius: '4px',
            color: '#ffffff'
          }}

        >
          <h3>{selectedStation} - Detailed Status</h3>
          <p><strong>Total Incidents:</strong> {stationStatus.total_incidents}</p>
          <p><strong>Open Incidents:</strong> {stationStatus.open_incidents}</p>
          <p><strong>Users Assigned:</strong> {stationStatus.total_users}</p>
          <p><strong>Local Routines:</strong> {stationStatus.local_routines}</p>
          <p><strong>Global Routines Available:</strong> {stationStatus.global_routines_available}</p>
          <p><strong>Pending Approvals:</strong> {stationStatus.pending_approvals}</p>
          <p><strong>Station Health:</strong> <span style={{ color: stationStatus.health === 'active' ? 'var(--kalro-green)' : 'var(--text3)' }}>{stationStatus.health.toUpperCase()}</span></p>
          <p style={{ fontSize: '12px', color: 'var(--text3)' }}>Last sync: {new Date(stationStatus.last_sync).toLocaleString()}</p>
        </div>
      )}

      {/* Pending Global Routine Approvals */}
      <div>
        <h2>✅ Pending Global Routine Approvals ({pending.length})</h2>
        {pending.length === 0 ? (
          <p style={{ color: 'var(--text3)' }}>No pending approvals</p>
        ) : (
          <div style={{ display: 'grid', gap: '15px' }}>
            {pending.map(item => (
              <div
                key={item.id}
                style={{
                  padding: '15px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  backgroundColor: 'var(--kalro-red-pale)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <div style={{ flex: 1 }}>
                    <h4 style={{ margin: '0 0 10px 0' }}>{item.title}</h4>
                    <p style={{ margin: '5px 0', fontSize: '14px', color: 'var(--text3)' }}>
                      <strong>From Station:</strong> {item.station_id}
                    </p>
                    <p style={{ margin: '5px 0', fontSize: '14px', color: 'var(--text3)' }}>
                      <strong>Contributor:</strong> {item.contributor}
                    </p>
                    <p style={{ margin: '5px 0', fontSize: '14px', color: 'var(--text3)' }}>
                      {item.content_preview}
                    </p>
                    <div style={{ marginTop: '10px' }}>
                      {item.tags && item.tags.map((tag, i) => (
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
                    <p style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '10px' }}>
                      Pushed: {new Date(item.pushed_at).toLocaleString()}
                    </p>
                  </div>
                  <div style={{ marginLeft: '20px', display: 'flex', gap: '10px', flexDirection: 'column' }}>
                    <button
                      onClick={() => handleApprove(item.id)}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: 'var(--kalro-green)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                      }}
                    >
                      ✓ Approve
                    </button>
                    <button
                      onClick={() => handleReject(item.id)}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: 'var(--kalro-red)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                      }}
                    >
                      ✕ Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
