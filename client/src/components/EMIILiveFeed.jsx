import { useState, useEffect } from 'react'
import { io } from 'socket.io-client'

export default function EMIILiveFeed() {
  const [events, setEvents] = useState([])
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    const serverOrigin = window.location.hostname === 'localhost'
      ? 'http://localhost:10000'
      : window.location.origin

    const socket = io(serverOrigin, { transports: ['websocket'] })

    socket.on('connect', () => {
      setIsConnected(true)
      console.debug('[EMII Feed] Socket connected')
    })

    socket.on('disconnect', () => {
      setIsConnected(false)
      console.debug('[EMII Feed] Socket disconnected')
    })

    socket.on('emii_alert', (event) => {
      const feedEvent = {
        id: event.id || `emii-${Date.now()}`,
        type: 'usb_detection',
        title: event.title || 'USB Device Event',
        description: event.description || 'External media device event',
        severity: event.severity || 'medium',
        authorized: !event.requires_attention,
        device: event.entities?.devices?.[0] || {},
        station: event.entities?.stations?.[0] || 'Unknown',
        timestamp: event.created_at || new Date().toISOString(),
        alert_type: 'external_media'
      }
      setEvents(prev => [feedEvent, ...prev].slice(0, 20))
    })

    socket.on('usb_event', (event) => {
      const feedEvent = {
        id: `usb-${Date.now()}`,
        type: event.eventType,
        title: event.eventType === 'usb_removal'
          ? `USB Device Removed: ${event.device?.deviceName || 'Unknown'}`
          : `USB Device Inserted: ${event.device?.deviceName || 'Unknown'}`,
        description: `${event.device?.deviceName || 'Device'} (${event.device?.serialNumber || 'N/A'}) at ${event.stationId || 'Unknown station'}`,
        severity: 'low',
        authorized: true,
        device: event.device || {},
        station: event.stationId || 'Unknown',
        timestamp: event.timestamp || new Date().toISOString(),
        alert_type: 'usb_event'
      }
      setEvents(prev => [feedEvent, ...prev].slice(0, 20))
    })

    socket.on('connect_error', err => {
      console.error('[EMII Feed] Socket error:', err)
    })

    return () => {
      socket.disconnect()
    }
  }, [])

  const getEventColor = (severity, authorized) => {
    if (!authorized) return 'var(--kalro-red)'
    if (severity === 'critical') return 'var(--kalro-red-light)'
    if (severity === 'high') return 'var(--orange)'
    if (severity === 'medium') return 'var(--yellow)'
    return 'var(--kalro-green)'
  }

  const getEventIcon = (type, authorized) => {
    if (!authorized) return '🚨'
    if (type === 'usb_removal') return '🔌'
    return '🖥️'
  }

  const formatTime = (timestamp) => {
    const d = new Date(timestamp)
    const now = new Date()
    const diff = now - d
    const secs = Math.floor(diff / 1000)
    const mins = Math.floor(secs / 60)
    const hours = Math.floor(mins / 60)
    
    if (secs < 60) return 'just now'
    if (mins < 60) return `${mins}m ago`
    if (hours < 24) return `${hours}h ago`
    return d.toLocaleTimeString()
  }

  return (
    <div className="card" style={{ marginBottom: 20, borderLeft: '3px solid ' + (isConnected ? 'var(--kalro-green)' : 'var(--text3)') }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 20 }}>📡</div>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>EMII Live Feed</h2>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
              {isConnected
                ? '● LISTENING'
                : '⊘ OFFLINE'}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text3)' }}>
          {events.length} event{events.length !== 1 ? 's' : ''} logged
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {events.length === 0 ? (
          <div style={{
            padding: '24px',
            textAlign: 'center',
            color: 'var(--text3)',
            fontSize: 13,
            background: 'var(--bg2)',
            borderRadius: 8,
            border: '1px dashed var(--border)'
          }}>
            Waiting for external media events...
          </div>
        ) : (
          events.map(event => (
            <div
              key={event.id}
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
                padding: '12px',
                background: event.authorized ? 'var(--bg2)' : 'var(--kalro-red-glow)',
                border: '1px solid ' + (event.authorized ? 'var(--border)' : 'var(--kalro-red-light)'),
                borderRadius: 8,
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = event.authorized ? 'var(--bg3)' : 'var(--kalro-red-glow)'
                e.currentTarget.style.borderColor = event.authorized ? 'var(--kalro-green-light)' : 'var(--kalro-red)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = event.authorized ? 'var(--bg2)' : 'var(--kalro-red-glow)'
                e.currentTarget.style.borderColor = event.authorized ? 'var(--border)' : 'var(--kalro-red-light)'
              }}
            >
              <div style={{ fontSize: 18, minWidth: 24, textAlign: 'center' }}>
                {getEventIcon(event.type, event.authorized)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontWeight: 600,
                  fontSize: 13,
                  color: getEventColor(event.severity, event.authorized),
                  marginBottom: 4
                }}>
                  {event.title}
                </div>
                <div style={{
                  fontSize: 12,
                  color: 'var(--text2)',
                  marginBottom: 6
                }}>
                  {event.description}
                </div>
                <div style={{
                  display: 'flex',
                  gap: 12,
                  fontSize: 11,
                  color: 'var(--text3)',
                  fontFamily: 'var(--font-mono)'
                }}>
                  <span>📍 {event.station}</span>
                  <span>⏱ {formatTime(event.timestamp)}</span>
                  {event.device?.vid && (
                    <span>
                      VID: {event.device.vid}{event.device.pid && ` / PID: ${event.device.pid}`}
                    </span>
                  )}
                </div>
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 10px',
                background: getEventColor(event.severity, event.authorized) + '22',
                border: '1px solid ' + getEventColor(event.severity, event.authorized),
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 600,
                color: getEventColor(event.severity, event.authorized),
                textTransform: 'uppercase',
                whiteSpace: 'nowrap'
              }}>
                {event.authorized ? '✓ AUTHORIZED' : '⚠ UNAUTHORIZED'}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
