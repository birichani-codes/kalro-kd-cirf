import { useState, useEffect } from 'react'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'

export default function NotificationsPage() {
  const { isAdmin } = useAuth()
  const [notifs, setNotifs] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // all, unread, critical
  const [searchText, setSearchText] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [notifRes, summaryRes] = await Promise.all([
        api.get('/notifications'),
        api.get('/notifications/summary')
      ])
      setNotifs(notifRes.data)
      setSummary(summaryRes.data)
      setLoading(false)
    } catch (err) {
      console.error('Failed to load notifications:', err)
      setLoading(false)
    }
  }

  const handleMarkAsRead = async (notifId) => {
    try {
      await api.put(`/notifications/${notifId}/read`)
      setNotifs(n => n.map(x => x.id === notifId ? { ...x, read: true } : x))
      setSummary(s => ({ ...s, unread: Math.max(0, s.unread - 1) }))
    } catch (err) {
      console.error('Failed to mark as read:', err)
    }
  }

  const handleMarkAllAsRead = async () => {
    try {
      await api.put('/notifications/read-all')
      setNotifs(n => n.map(x => ({ ...x, read: true })))
      setSummary(s => ({ ...s, unread: 0 }))
    } catch (err) {
      console.error('Failed to mark all as read:', err)
    }
  }

  const handleDelete = async (notifId) => {
    try {
      await api.delete(`/notifications/${notifId}`)
      const wasUnread = notifs.find(n => n.id === notifId)?.read === false
      setNotifs(n => n.filter(x => x.id !== notifId))
      if (wasUnread) {
        setSummary(s => ({ ...s, unread: Math.max(0, s.unread - 1), total: s.total - 1 }))
      }
    } catch (err) {
      console.error('Failed to delete notification:', err)
    }
  }

  const getIcon = (type) => {
    const icons = {
      incident_alert: '🚨',
      escalation: '⚠️',
      knowledge_alert: '💡',
      info: 'ℹ️',
      warning: '⚡',
      critical: '🔴'
    }
    return icons[type] || 'ℹ️'
  }

  const getSeverityColor = (severity) => {
    const colors = {
      critical: 'var(--kalro-red)',
      high: 'var(--kalro-red-light)',
      normal: 'var(--kalro-green)',
      low: 'var(--kalro-green-light)'
    }
    return colors[severity] || 'var(--kalro-green)'
  }

  const getTypeLabel = (type) => {
    const labels = {
      incident_alert: 'Incident Alert',
      escalation: 'Escalation',
      knowledge_alert: 'Knowledge Alert',
      info: 'Information',
      warning: 'Warning',
      critical: 'Critical'
    }
    return labels[type] || type
  }

  // Filter notifications
  let filtered = notifs
  if (filter === 'unread') filtered = filtered.filter(n => !n.read)
  if (filter === 'critical') filtered = filtered.filter(n => n.severity === 'critical')
  if (searchText) {
    const lower = searchText.toLowerCase()
    filtered = filtered.filter(n => 
      n.title.toLowerCase().includes(lower) || 
      n.message.toLowerCase().includes(lower)
    )
  }

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <p>Loading notifications...</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '20px' }}>
      <h1>🔔 Notifications Center</h1>
      <p style={{ color: 'var(--text3)', marginBottom: '20px' }}>
        Manage all system notifications and alerts
      </p>

      {/* Summary Cards */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginBottom: '30px' }}>
          {[
            { label: 'Total', value: summary.total, color: 'var(--kalro-green)' },
            { label: 'Unread', value: summary.unread, color: 'var(--kalro-red-light)' },
            { label: 'Critical', value: summary.by_severity?.critical || 0, color: 'var(--kalro-red)' },
            { label: 'Alerts', value: summary.by_type?.incident_alert || 0, color: 'var(--kalro-green-light)' }
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
              <p style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 5px 0' }}>
                {stat.value}
              </p>
              <p style={{ fontSize: '12px', margin: 0 }}>{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Controls */}
      <div
        style={{
          display: 'flex',
          gap: '10px',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          flexWrap: 'wrap'
        }}
      >
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flex: 1 }}>
          <input
            type="text"
            placeholder="Search notifications..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{
              padding: '8px 12px',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              flex: 1,
              maxWidth: '300px'
            }}
          />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              padding: '8px 12px',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              backgroundColor: 'var(--bg2)'
            }}
          >
            <option value="all">All Notifications</option>
            <option value="unread">Unread Only</option>
            <option value="critical">Critical Only</option>
          </select>
        </div>
        {summary && summary.unread > 0 && (
          <button
            onClick={handleMarkAllAsRead}
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
            Mark All as Read
          </button>
        )}
      </div>

      {/* Notification List */}
      {filtered.length === 0 ? (
        <div
          style={{
            padding: '40px',
            textAlign: 'center',
            color: 'var(--text3)',
            backgroundColor: 'var(--bg3)',
            borderRadius: '6px',
            border: '1px solid var(--border)'
          }}
        >
          <p style={{ fontSize: '16px' }}>No notifications to display</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          {filtered.map(notif => (
            <div
              key={notif.id}
              style={{
                padding: '15px',
                backgroundColor: notif.read ? 'var(--background)' : 'var(--kalro-green-pale)',
                border: `1px solid ${notif.read ? 'var(--border)' : 'var(--kalro-green)'}`,
                borderRadius: '6px',
                borderLeft: `4px solid ${getSeverityColor(notif.severity)}`,
                display: 'flex',
                gap: '15px',
                alignItems: 'flex-start'
              }}
            >
              {/* Icon */}
              <div style={{ fontSize: '24px', marginTop: '2px' }}>
                {getIcon(notif.type)}
              </div>

              {/* Content */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <h4 style={{ margin: 0, fontWeight: notif.read ? 'normal' : 'bold' }}>
                    {notif.title}
                  </h4>
                  <span
                    style={{
                      fontSize: '11px',
                      padding: '2px 8px',
                      backgroundColor: notif.read ? 'var(--border)' : 'var(--kalro-green)',
                      color: notif.read ? 'var(--text3)' : 'white',
                      borderRadius: '3px'
                    }}
                  >
                    {getTypeLabel(notif.type)}
                  </span>
                  <span
                    style={{
                      fontSize: '11px',
                      padding: '2px 8px',
                      backgroundColor: getSeverityColor(notif.severity),
                      color: 'white',
                      borderRadius: '3px'
                    }}
                  >
                    {notif.severity.toUpperCase()}
                  </span>
                </div>
                <p style={{ margin: '8px 0', color: 'var(--text3)', lineHeight: '1.5' }}>
                  {notif.message}
                </p>
                <div style={{ fontSize: '12px', color: 'var(--text3)', display: 'flex', gap: '15px' }}>
                  <span>{new Date(notif.created_at).toLocaleString()}</span>
                  {notif.related_incident_id && (
                    <span>Incident: {notif.related_incident_id}</span>
                  )}
                  {notif.related_knowledge_id && (
                    <span>Knowledge: {notif.related_knowledge_id}</span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
                {notif.action_url && (
                  <a
                    href={notif.action_url}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: 'var(--kalro-green)',
                      color: 'white',
                      textDecoration: 'none',
                      borderRadius: '4px',
                      fontSize: '12px',
                      textAlign: 'center',
                      cursor: 'pointer'
                    }}
                  >
                    View
                  </a>
                )}
                {!notif.read && (
                  <button
                    onClick={() => handleMarkAsRead(notif.id)}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: 'var(--kalro-green-light)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    Mark Read
                  </button>
                )}
                <button
                  onClick={() => handleDelete(notif.id)}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: 'var(--kalro-red)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
