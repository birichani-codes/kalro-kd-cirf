import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'

export default function EMIILiveFeed() {
  const [events, setEvents] = useState([])
  const [isConnected, setIsConnected] = useState(false)
  const [status, setStatus] = useState('disabled')

  /*
   * EMII is intentionally disabled by default.
   *
   * Enable later with:
   * VITE_EMII_ENABLED=true
   *
   * Backend URL:
   * VITE_API_URL=https://kalro-kd-cirf.onrender.com
   */
  const emiiEnabled =
    String(import.meta.env.VITE_EMII_ENABLED || 'false').toLowerCase() === 'true'

  const serverOrigin =
    import.meta.env.VITE_API_URL ||
    'http://localhost:10000'

  useEffect(() => {
    /*
     * Physical USB monitoring is not currently active.
     * Do not create a Socket.IO connection unless EMII
     * has explicitly been enabled.
     */
    if (!emiiEnabled) {
      setIsConnected(false)
      setStatus('disabled')

      console.debug(
        '[EMII Feed] Live external-media monitoring is currently disabled.'
      )

      return
    }

    setStatus('connecting')

    const socket = io(serverOrigin, {
      transports: ['websocket', 'polling'],
      withCredentials: true,

      /*
       * Prevent endless reconnect errors if Render
       * or the EMII service is unavailable.
       */
      reconnection: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 1500,
      timeout: 10000
    })

    socket.on('connect', () => {
      setIsConnected(true)
      setStatus('connected')

      console.debug(
        '[EMII Feed] Socket connected:',
        socket.id
      )
    })

    socket.on('disconnect', (reason) => {
      setIsConnected(false)
      setStatus('offline')

      console.debug(
        '[EMII Feed] Socket disconnected:',
        reason
      )
    })

    socket.on('connect_error', (err) => {
      setIsConnected(false)
      setStatus('offline')

      console.warn(
        '[EMII Feed] Real-time connection unavailable:',
        err?.message || err
      )
    })

    socket.on('emii_status', (data) => {
      console.debug(
        '[EMII Feed] EMII status:',
        data
      )
    })

    socket.on('emii_alert', (event) => {
      const feedEvent = {
        id:
          event.id ||
          `emii-${Date.now()}-${Math.random()}`,

        type: 'usb_detection',

        title:
          event.title ||
          'USB Device Event',

        description:
          event.description ||
          'External media device event',

        severity:
          event.severity ||
          'medium',

        authorized:
          !event.requires_attention,

        device:
          event.entities?.devices?.[0] ||
          {},

        station:
          event.entities?.stations?.[0] ||
          'Unknown',

        timestamp:
          event.created_at ||
          new Date().toISOString(),

        alert_type:
          'external_media'
      }

      setEvents(prev =>
        [feedEvent, ...prev].slice(0, 20)
      )
    })

    socket.on('usb_event', (event) => {
      const isRemoval =
        event.eventType === 'usb_removal'

      const feedEvent = {
        id:
          event.id ||
          `usb-${Date.now()}-${Math.random()}`,

        type:
          event.eventType ||
          'usb_event',

        title: isRemoval
          ? `USB Device Removed: ${
              event.device?.deviceName ||
              'Unknown'
            }`
          : `USB Device Inserted: ${
              event.device?.deviceName ||
              'Unknown'
            }`,

        description:
          `${event.device?.deviceName || 'Device'} ` +
          `(${event.device?.serialNumber || 'N/A'}) ` +
          `at ${event.stationId || 'Unknown station'}`,

        severity:
          event.severity ||
          'low',

        authorized:
          event.authorized !== false,

        device:
          event.device ||
          {},

        station:
          event.stationId ||
          'Unknown',

        timestamp:
          event.timestamp ||
          new Date().toISOString(),

        alert_type:
          'usb_event'
      }

      setEvents(prev =>
        [feedEvent, ...prev].slice(0, 20)
      )
    })

    return () => {
      socket.removeAllListeners()
      socket.disconnect()
    }
  }, [emiiEnabled, serverOrigin])

  const getEventColor = (severity, authorized) => {
    if (!authorized) {
      return 'var(--kalro-red)'
    }

    if (severity === 'critical') {
      return 'var(--kalro-red-light)'
    }

    if (severity === 'high') {
      return 'var(--orange)'
    }

    if (severity === 'medium') {
      return 'var(--yellow)'
    }

    return 'var(--kalro-green)'
  }

  const getEventIcon = (type, authorized) => {
    if (!authorized) {
      return '🚨'
    }

    if (type === 'usb_removal') {
      return '🔌'
    }

    return '🖥️'
  }

  const formatTime = (timestamp) => {
    const d = new Date(timestamp)

    if (Number.isNaN(d.getTime())) {
      return 'Unknown time'
    }

    const now = new Date()
    const diff = now - d

    const secs = Math.floor(diff / 1000)
    const mins = Math.floor(secs / 60)
    const hours = Math.floor(mins / 60)

    if (secs < 60) {
      return 'just now'
    }

    if (mins < 60) {
      return `${mins}m ago`
    }

    if (hours < 24) {
      return `${hours}h ago`
    }

    return d.toLocaleString()
  }

  const getStatusText = () => {
    if (!emiiEnabled) {
      return '○ MONITORING NOT ENABLED'
    }

    if (status === 'connecting') {
      return '◌ CONNECTING'
    }

    if (isConnected) {
      return '● LISTENING'
    }

    return '⊘ OFFLINE'
  }

  const getStatusColor = () => {
    if (!emiiEnabled) {
      return 'var(--text3)'
    }

    if (isConnected) {
      return 'var(--kalro-green)'
    }

    return 'var(--text3)'
  }

  return (
    <div
      className="card"
      style={{
        marginBottom: 20,
        borderLeft:
          '3px solid ' +
          getStatusColor()
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12
          }}
        >
          <div
            style={{
              fontSize: 20
            }}
          >
            📡
          </div>

          <div>
            <h2
              style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 600,
                color: 'var(--text)'
              }}
            >
              EMII Live Feed
            </h2>

            <div
              style={{
                fontSize: 11,
                color: getStatusColor(),
                fontFamily: 'var(--font-mono)',
                marginTop: 2
              }}
            >
              {getStatusText()}
            </div>
          </div>
        </div>

        <div
          style={{
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            color: 'var(--text3)'
          }}
        >
          {events.length}{' '}
          event{events.length !== 1 ? 's' : ''} logged
        </div>
      </div>

      {!emiiEnabled ? (
        <div
          style={{
            padding: '22px',
            background: 'var(--bg2)',
            borderRadius: 8,
            border: '1px dashed var(--border)'
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text2)',
              marginBottom: 6
            }}
          >
            External media live monitoring is not currently enabled.
          </div>

          <div
            style={{
              fontSize: 12,
              lineHeight: 1.6,
              color: 'var(--text3)'
            }}
          >
            EMII remains available as part of the framework,
            but automatic physical USB detection is not active
            in this deployment. Incident-response exercises can
            still use simulated external-media events where required.
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8
          }}
        >
          {events.length === 0 ? (
            <div
              style={{
                padding: '24px',
                textAlign: 'center',
                color: 'var(--text3)',
                fontSize: 13,
                background: 'var(--bg2)',
                borderRadius: 8,
                border: '1px dashed var(--border)'
              }}
            >
              {isConnected
                ? 'Listening for external media events...'
                : 'External media event stream is currently unavailable.'}
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

                  background:
                    event.authorized
                      ? 'var(--bg2)'
                      : 'var(--kalro-red-glow)',

                  border:
                    '1px solid ' +
                    (
                      event.authorized
                        ? 'var(--border)'
                        : 'var(--kalro-red-light)'
                    ),

                  borderRadius: 8,
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background =
                    event.authorized
                      ? 'var(--bg3)'
                      : 'var(--kalro-red-glow)'

                  e.currentTarget.style.borderColor =
                    event.authorized
                      ? 'var(--kalro-green-light)'
                      : 'var(--kalro-red)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background =
                    event.authorized
                      ? 'var(--bg2)'
                      : 'var(--kalro-red-glow)'

                  e.currentTarget.style.borderColor =
                    event.authorized
                      ? 'var(--border)'
                      : 'var(--kalro-red-light)'
                }}
              >
                <div
                  style={{
                    fontSize: 18,
                    minWidth: 24,
                    textAlign: 'center'
                  }}
                >
                  {getEventIcon(
                    event.type,
                    event.authorized
                  )}
                </div>

                <div
                  style={{
                    flex: 1
                  }}
                >
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 13,
                      color: getEventColor(
                        event.severity,
                        event.authorized
                      ),
                      marginBottom: 4
                    }}
                  >
                    {event.title}
                  </div>

                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--text2)',
                      marginBottom: 6
                    }}
                  >
                    {event.description}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 12,
                      fontSize: 11,
                      color: 'var(--text3)',
                      fontFamily: 'var(--font-mono)'
                    }}
                  >
                    <span>
                      📍 {event.station}
                    </span>

                    <span>
                      ⏱ {formatTime(event.timestamp)}
                    </span>

                    {event.device?.vid && (
                      <span>
                        VID: {event.device.vid}
                        {event.device.pid &&
                          ` / PID: ${event.device.pid}`}
                      </span>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 10px',

                    background:
                      getEventColor(
                        event.severity,
                        event.authorized
                      ) + '22',

                    border:
                      '1px solid ' +
                      getEventColor(
                        event.severity,
                        event.authorized
                      ),

                    borderRadius: 4,
                    fontSize: 10,
                    fontWeight: 600,

                    color:
                      getEventColor(
                        event.severity,
                        event.authorized
                      ),

                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {event.authorized
                    ? '✓ AUTHORIZED'
                    : '⚠ UNAUTHORIZED'}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}