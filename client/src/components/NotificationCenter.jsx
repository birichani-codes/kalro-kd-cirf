import { useState, useEffect } from 'react'
import { io } from 'socket.io-client'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'

export default function NotificationCenter() {
  const { user } = useAuth()

  const [notifs, setNotifs] = useState([])
  const [unread, setUnread] = useState(0)
  const [showPanel, setShowPanel] = useState(false)
  const [loading, setLoading] = useState(false)
  const [socketConnected, setSocketConnected] = useState(false)

  // =====================================================
  // BACKEND URL
  // =====================================================

  const serverOrigin =
    import.meta.env.VITE_API_URL ||
    'http://localhost:10000'

  // =====================================================
  // LOAD NOTIFICATIONS + REAL-TIME SOCKET
  // =====================================================

  useEffect(() => {
    if (!user) {
      setNotifs([])
      setUnread(0)
      setSocketConnected(false)
      return
    }

    let mounted = true

    const loadInitialNotifications = async () => {
      try {
        setLoading(true)
        await loadNotifications()
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    loadInitialNotifications()

    /*
     * REST fallback.
     *
     * Even if Socket.IO is unavailable, notifications
     * will still refresh every 10 seconds.
     */
    const interval = setInterval(() => {
      loadNotifications()
    }, 10000)

    // ===================================================
    // SOCKET.IO CONNECTION
    // ===================================================

    const socket = io(serverOrigin, {
      transports: [
        'websocket',
        'polling'
      ],

      withCredentials: true,

      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1500,
      reconnectionDelayMax: 5000,

      timeout: 10000
    })

    const pushLiveNotification = (event, source) => {
      if (!event) return

      const isUsbEvent =
        source === 'usb_event'

      const eventType =
        event.eventType ||
        event.event_type ||
        ''

      const deviceName =
        event.device?.deviceName ||
        event.device?.name ||
        event.device?.serialNumber ||
        'unknown device'

      const station =
        event.stationId ||
        event.station_id ||
        event.workstationId ||
        event.workstation_id ||
        'Unknown station'

      const title =
        event.title ||
        (
          isUsbEvent
            ? `USB ${
                eventType === 'usb_removal'
                  ? 'removed'
                  : 'inserted'
              }`
            : 'External Media Alert'
        )

      const message =
        event.description ||
        event.message ||
        (
          `Device ${deviceName} ${
            eventType === 'usb_removal'
              ? 'removed'
              : 'connected'
          } at ${station}`
        )

      const severity =
        event.severity ||
        (
          source === 'emii_alert'
            ? (
                event.requires_attention
                  ? 'critical'
                  : 'high'
              )
            : 'normal'
        )

      const relatedId =
        event.related_incident_id ||
        event.relatedIncidentId ||
        null

      /*
       * Only create an incident link if we actually have
       * an incident ID.
       *
       * Do not use the notification/event ID as an incident ID.
       */
      const action_url =
        relatedId
          ? `/incidents/${relatedId}`
          : null

      const liveNotif = {
        id:
          event.notification_id ||
          event.id ||
          `live-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 11)}`,

        title,
        message,

        type:
          event.type ||
          'incident_alert',

        severity,

        read: false,

        created_at:
          event.created_at ||
          event.timestamp ||
          new Date().toISOString(),

        action_url,

        live: true,
        source
      }

      setNotifs(prev => {
        /*
         * Avoid duplicate live notifications if the same
         * event is emitted more than once.
         */
        const exists = prev.some(
          item => item.id === liveNotif.id
        )

        if (exists) {
          return prev
        }

        return [
          liveNotif,
          ...prev
        ].slice(0, 25)
      })

      setUnread(prev => prev + 1)
    }

    // ===================================================
    // SOCKET EVENTS
    // ===================================================

    socket.on('connect', () => {
      if (!mounted) return

      setSocketConnected(true)

      console.debug(
        '[Socket] connected to notification service:',
        socket.id,
        serverOrigin
      )
    })

    socket.on('disconnect', reason => {
      if (!mounted) return

      setSocketConnected(false)

      console.debug(
        '[Socket] disconnected from notification service:',
        reason
      )
    })

    socket.on('connect_error', err => {
      if (!mounted) return

      setSocketConnected(false)

      /*
       * Use warn instead of repeatedly throwing disruptive
       * errors. REST polling remains available.
       */
      console.warn(
        '[Socket] real-time notification connection unavailable:',
        err?.message || err
      )
    })

    /*
     * External-media events.
     *
     * These listeners may remain even while physical EMII
     * monitoring is disabled. They simply do nothing unless
     * the backend emits such events.
     */
    socket.on('emii_alert', event => {
      pushLiveNotification(
        event,
        'emii_alert'
      )
    })

    socket.on('usb_event', event => {
      pushLiveNotification(
        event,
        'usb_event'
      )
    })

    /*
     * General notification event.
     *
     * This allows Operational Testing, collaboration,
     * escalation, incident assignment, knowledge actions,
     * etc. to push notifications through the same channel
     * when the backend emits "notification".
     */
    socket.on('notification', event => {
      pushLiveNotification(
        event,
        'notification'
      )
    })

    /*
     * Optional incident notification channel.
     */
    socket.on('incident_notification', event => {
      pushLiveNotification(
        event,
        'incident_notification'
      )
    })

    return () => {
      mounted = false

      clearInterval(interval)

      socket.removeAllListeners()

      socket.disconnect()

      setSocketConnected(false)
    }
  }, [user, serverOrigin])

  // =====================================================
  // LOAD STORED NOTIFICATIONS
  // =====================================================

  const loadNotifications = async () => {
    if (!user) return

    try {
      const [
        notificationsResponse,
        unreadResponse
      ] = await Promise.all([
        api.get('/notifications'),
        api.get('/notifications/unread')
      ])

      const notificationData =
        Array.isArray(notificationsResponse.data)
          ? notificationsResponse.data
          : (
              notificationsResponse.data?.notifications ||
              []
            )

      const unreadCount =
        Number(
          unreadResponse.data?.unread_count ??
          unreadResponse.data?.count ??
          0
        )

      setNotifs(notificationData)

      setUnread(
        Number.isFinite(unreadCount)
          ? unreadCount
          : 0
      )
    } catch (err) {
      console.error(
        'Failed to load notifications:',
        err
      )
    }
  }

  // =====================================================
  // MARK ONE AS READ
  // =====================================================

  const handleMarkAsRead = async notifId => {
    if (!notifId) return

    const notification =
      notifs.find(
        n => n.id === notifId
      )

    /*
     * A live-only notification might not yet exist in the
     * REST store. In that case update it locally.
     */
    if (notification?.live) {
      setNotifs(prev =>
        prev.map(item =>
          item.id === notifId
            ? {
                ...item,
                read: true
              }
            : item
        )
      )

      if (!notification.read) {
        setUnread(prev =>
          Math.max(
            0,
            prev - 1
          )
        )
      }

      return
    }

    try {
      await api.put(
        `/notifications/${notifId}/read`
      )

      setNotifs(prev =>
        prev.map(item =>
          item.id === notifId
            ? {
                ...item,
                read: true
              }
            : item
        )
      )

      if (!notification?.read) {
        setUnread(prev =>
          Math.max(
            0,
            prev - 1
          )
        )
      }
    } catch (err) {
      console.error(
        'Failed to mark notification as read:',
        err
      )
    }
  }

  // =====================================================
  // MARK ALL AS READ
  // =====================================================

  const handleMarkAllAsRead = async () => {
    try {
      await api.put(
        '/notifications/read-all'
      )

      setNotifs(prev =>
        prev.map(item => ({
          ...item,
          read: true
        }))
      )

      setUnread(0)
    } catch (err) {
      console.error(
        'Failed to mark all notifications as read:',
        err
      )
    }
  }

  // =====================================================
  // DELETE NOTIFICATION
  // =====================================================

  const handleDelete = async notifId => {
    if (!notifId) return

    const notification =
      notifs.find(
        n => n.id === notifId
      )

    /*
     * Live-only notification:
     * remove locally without calling REST API.
     */
    if (notification?.live) {
      setNotifs(prev =>
        prev.filter(
          item => item.id !== notifId
        )
      )

      if (!notification.read) {
        setUnread(prev =>
          Math.max(
            0,
            prev - 1
          )
        )
      }

      return
    }

    try {
      await api.delete(
        `/notifications/${notifId}`
      )

      setNotifs(prev =>
        prev.filter(
          item => item.id !== notifId
        )
      )

      if (!notification?.read) {
        setUnread(prev =>
          Math.max(
            0,
            prev - 1
          )
        )
      }
    } catch (err) {
      console.error(
        'Failed to delete notification:',
        err
      )
    }
  }

  // =====================================================
  // ICONS
  // =====================================================

  const getIcon = type => {
    const icons = {
      incident_alert: '🚨',
      incident_notification: '🚨',
      escalation: '⚠️',
      collaboration: '🤝',
      knowledge_alert: '💡',
      operational_test: '🧪',
      notification: '🔔',
      info: 'ℹ️',
      warning: '⚡',
      critical: '🔴'
    }

    return (
      icons[type] ||
      'ℹ️'
    )
  }

  // =====================================================
  // SEVERITY COLORS
  // =====================================================

  const getSeverityColor = severity => {
    const colors = {
      critical: 'var(--kalro-red)',
      high: 'var(--kalro-red-light)',
      medium: 'var(--yellow)',
      warning: 'var(--orange)',
      normal: 'var(--kalro-green)',
      low: 'var(--kalro-green-light)',
      info: 'var(--kalro-green-light)'
    }

    return (
      colors[severity] ||
      'var(--kalro-green)'
    )
  }

  // =====================================================
  // DATE FORMATTER
  // =====================================================

  const formatNotificationTime = timestamp => {
    if (!timestamp) {
      return ''
    }

    const date =
      new Date(timestamp)

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return ''
    }

    return date.toLocaleString()
  }

  // =====================================================
  // UI
  // =====================================================

  return (
    <div
      style={{
        position: 'relative'
      }}
    >
      {/* Notification Bell */}

      <button
        onClick={() =>
          setShowPanel(
            previous =>
              !previous
          )
        }
        style={{
          position: 'relative',
          background: 'none',
          border: 'none',
          fontSize: '20px',
          cursor: 'pointer',
          padding: '5px'
        }}
        title={
          `${unread} unread notifications`
        }
        aria-label={
          `${unread} unread notifications`
        }
      >
        🔔

        {unread > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '-5px',
              right: '-5px',
              backgroundColor: '#ff4444',
              color: 'white',
              borderRadius: '50%',
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              fontWeight: 'bold'
            }}
          >
            {unread > 9
              ? '9+'
              : unread}
          </span>
        )}
      </button>

      {/* Notification Panel */}

      {showPanel && (
        <div
          style={{
            position: 'absolute',
            top: '40px',
            right: '0',
            width: '400px',
            maxWidth: 'calc(100vw - 24px)',
            maxHeight: '600px',
            backgroundColor: 'white',
            border: '1px solid #ddd',
            borderRadius: '8px',
            boxShadow:
              '0 2px 8px rgba(0,0,0,0.1)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          {/* Header */}

          <div
            style={{
              padding: '12px',
              borderBottom:
                '1px solid #eee',
              display: 'flex',
              justifyContent:
                'space-between',
              alignItems: 'center',
              gap: 12,
              backgroundColor:
                '#f9f9f9'
            }}
          >
            <div>
              <h3
                style={{
                  margin: 0,
                  fontSize: '14px',
                  fontWeight: 'bold'
                }}
              >
                Notifications
                {unread > 0 &&
                  ` (${unread})`}
              </h3>

              <div
                style={{
                  marginTop: 3,
                  fontSize: 10,
                  color:
                    socketConnected
                      ? 'var(--kalro-green)'
                      : '#999'
                }}
              >
                {socketConnected
                  ? '● LIVE'
                  : '○ REFRESHING'}
              </div>
            </div>

            {unread > 0 && (
              <button
                onClick={
                  handleMarkAllAsRead
                }
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#2196F3',
                  cursor: 'pointer',
                  fontSize: '12px',
                  textDecoration:
                    'underline'
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Notification List */}

          <div
            style={{
              overflowY: 'auto',
              flex: 1
            }}
          >
            {loading &&
            notifs.length === 0 ? (
              <div
                style={{
                  padding: '20px',
                  textAlign: 'center',
                  color: '#999'
                }}
              >
                Loading notifications...
              </div>
            ) : notifs.length === 0 ? (
              <div
                style={{
                  padding: '20px',
                  textAlign: 'center',
                  color: '#999'
                }}
              >
                No notifications
              </div>
            ) : (
              notifs.map(notif => (
                <div
                  key={notif.id}
                  style={{
                    padding: '12px',
                    borderBottom:
                      '1px solid #f0f0f0',

                    backgroundColor:
                      notif.read
                        ? '#fff'
                        : '#f5f5f5',

                    display: 'flex',
                    gap: '10px',
                    alignItems:
                      'flex-start',

                    cursor: 'default',

                    transition:
                      'background 0.2s'
                  }}
                  onMouseEnter={e => {
                    if (!notif.read) {
                      e.currentTarget.style.backgroundColor =
                        '#eee'
                    }
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.backgroundColor =
                      notif.read
                        ? '#fff'
                        : '#f5f5f5'
                  }}
                >
                  {/* Icon */}

                  <div
                    style={{
                      fontSize: '16px',
                      marginTop: '2px'
                    }}
                  >
                    {getIcon(
                      notif.type
                    )}
                  </div>

                  {/* Content */}

                  <div
                    style={{
                      flex: 1,
                      minWidth: 0
                    }}
                  >
                    <div
                      style={{
                        fontWeight:
                          notif.read
                            ? 'normal'
                            : 'bold',

                        fontSize:
                          '13px',

                        color:
                          '#000',

                        marginBottom:
                          '4px'
                      }}
                    >
                      {notif.title}
                    </div>

                    <div
                      style={{
                        fontSize:
                          '12px',

                        color:
                          '#666',

                        marginBottom:
                          '4px',

                        overflow:
                          'hidden',

                        textOverflow:
                          'ellipsis',

                        whiteSpace:
                          'nowrap'
                      }}
                      title={
                        notif.message
                      }
                    >
                      {notif.message}
                    </div>

                    <div
                      style={{
                        fontSize:
                          '11px',

                        color:
                          '#999',

                        display:
                          'flex',

                        gap:
                          '8px',

                        alignItems:
                          'center',

                        flexWrap:
                          'wrap'
                      }}
                    >
                      <span
                        style={{
                          display:
                            'inline-block',

                          width:
                            '8px',

                          height:
                            '8px',

                          borderRadius:
                            '50%',

                          backgroundColor:
                            getSeverityColor(
                              notif.severity
                            )
                        }}
                      />

                      <span>
                        {formatNotificationTime(
                          notif.created_at
                        )}
                      </span>

                      {notif.live && (
                        <span>
                          LIVE
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}

                  <div
                    style={{
                      display:
                        'flex',

                      gap:
                        '6px',

                      alignItems:
                        'center'
                    }}
                  >
                    {notif.action_url && (
                      <a
                        href={
                          notif.action_url
                        }
                        onClick={e =>
                          e.stopPropagation()
                        }
                        style={{
                          fontSize:
                            '12px',

                          color:
                            'var(--kalro-green)',

                          textDecoration:
                            'none',

                          cursor:
                            'pointer'
                        }}
                        title="Open related incident"
                      >
                        →
                      </a>
                    )}

                    {!notif.read && (
                      <button
                        onClick={e => {
                          e.stopPropagation()

                          handleMarkAsRead(
                            notif.id
                          )
                        }}
                        style={{
                          background:
                            'none',

                          border:
                            'none',

                          color:
                            'var(--kalro-green-light)',

                          cursor:
                            'pointer',

                          fontSize:
                            '12px'
                        }}
                        title="Mark as read"
                      >
                        ✓
                      </button>
                    )}

                    <button
                      onClick={e => {
                        e.stopPropagation()

                        handleDelete(
                          notif.id
                        )
                      }}
                      style={{
                        background:
                          'none',

                        border:
                          'none',

                        color:
                          '#999',

                        cursor:
                          'pointer',

                        fontSize:
                          '12px'
                      }}
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}