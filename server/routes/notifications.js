const express = require('express');
const { read, write } = require('../store');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAction } = require('./audit');
const router = express.Router();

/**
 * POST /notifications/create
 * Create a new notification (internal use by incidents/knowledge routes)
 */
router.post('/create', (req, res) => {
  const { 
    title, 
    message, 
    type, 
    recipient_id, 
    recipient_station_id, 
    severity,
    related_incident_id,
    related_knowledge_id,
    action_url
  } = req.body;

  const notification = {
    id: Date.now().toString() + Math.random(),
    title: title || 'New Notification',
    message: message || '',
    type: type || 'info', // info, warning, critical, knowledge_alert, escalation
    recipient_id: recipient_id || null,
    recipient_station_id: recipient_station_id || null,
    severity: severity || 'normal', // low, normal, high, critical
    related_incident_id: related_incident_id || null,
    related_knowledge_id: related_knowledge_id || null,
    action_url: action_url || null,
    read: false,
    created_at: new Date().toISOString(),
    created_by: 'SYSTEM'
  };

  const notifs = read('notifications');
  notifs.push(notification);
  write('notifications', notifs);

  res.json({ success: true, notification });
});

/**
 * GET /notifications
 * Get all notifications for authenticated user
 */
router.get('/', authenticate, (req, res) => {
  const notifs = read('notifications');
  const user = req.user;

  // Get notifications for this user (by ID, station, or global system notifications)
  const userNotifs = notifs.filter(n => 
    n.recipient_id === user.id || 
    n.recipient_station_id === user.station_id ||
    (n.recipient_id == null && n.recipient_station_id == null) ||
    (n.type === 'escalation' && user.role === 'super_admin')
  );

  // Sort by newest first
  userNotifs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  res.json(userNotifs);
});

/**
 * GET /notifications/unread
 * Get count of unread notifications
 */
router.get('/unread', authenticate, (req, res) => {
  const notifs = read('notifications');
  const user = req.user;

  const userNotifs = notifs.filter(n => 
    ((n.recipient_id === user.id || 
    n.recipient_station_id === user.station_id ||
    (n.recipient_id == null && n.recipient_station_id == null) ||
    (n.type === 'escalation' && user.role === 'super_admin')) &&
    !n.read)
  );

  res.json({ unread_count: userNotifs.length });
});

/**
 * GET /notifications/summary
 * Get summary of notifications by type and severity
 */
router.get('/summary', authenticate, (req, res) => {
  const notifs = read('notifications');
  const user = req.user;

  const userNotifs = notifs.filter(n => 
    n.recipient_id === user.id || 
    n.recipient_station_id === user.station_id ||
    (n.recipient_id == null && n.recipient_station_id == null) ||
    (n.type === 'escalation' && user.role === 'super_admin')
  );

  const summary = {
    total: userNotifs.length,
    unread: userNotifs.filter(n => !n.read).length,
    by_type: {},
    by_severity: {},
    recent_critical: userNotifs.filter(n => n.severity === 'critical').slice(0, 5)
  };

  userNotifs.forEach(n => {
    summary.by_type[n.type] = (summary.by_type[n.type] || 0) + 1;
    summary.by_severity[n.severity] = (summary.by_severity[n.severity] || 0) + 1;
  });

  res.json(summary);
});

/**
 * PUT /notifications/:id/read
 * Mark notification as read
 */
router.put('/:id/read', authenticate, (req, res) => {
  const notifs = read('notifications');
  const idx = notifs.findIndex(n => n.id === req.params.id);

  if (idx === -1) return res.status(404).json({ error: 'Notification not found' });

  notifs[idx].read = true;
  notifs[idx].read_at = new Date().toISOString();

  write('notifications', notifs);

  res.json({ success: true, notification: notifs[idx] });
});

/**
 * PUT /notifications/read-all
 * Mark all user's notifications as read
 */
router.put('/read-all', authenticate, (req, res) => {
  const notifs = read('notifications');
  const user = req.user;

  let updated = 0;
  notifs.forEach(n => {
    if ((n.recipient_id === user.id || n.recipient_station_id === user.station_id) && !n.read) {
      n.read = true;
      n.read_at = new Date().toISOString();
      updated++;
    }
  });

  write('notifications', notifs);

  res.json({ success: true, updated_count: updated });
});

/**
 * DELETE /notifications/:id
 * Delete a notification
 */
router.delete('/:id', authenticate, (req, res) => {
  const notifs = read('notifications');
  const idx = notifs.findIndex(n => n.id === req.params.id);

  if (idx === -1) return res.status(404).json({ error: 'Notification not found' });

  const deleted = notifs.splice(idx, 1)[0];
  write('notifications', notifs);

  logAction({
    userId: req.user.id,
    action: 'DELETE_NOTIFICATION',
    targetType: 'notification',
    targetId: req.params.id,
    metadata: {}
  });

  res.json({ success: true, deleted });
});

/**
 * DELETE /notifications/clear-all
 * Clear all old notifications (older than 30 days)
 */
router.delete('/clear-old', authenticate, requireRole('super_admin'), (req, res) => {
  const notifs = read('notifications');
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const filtered = notifs.filter(n => new Date(n.created_at) > thirtyDaysAgo);
  const removed = notifs.length - filtered.length;

  write('notifications', filtered);

  logAction({
    userId: req.user.id,
    action: 'CLEAR_OLD_NOTIFICATIONS',
    targetType: 'notifications',
    targetId: 'all',
    metadata: { removed_count: removed }
  });

  res.json({ success: true, removed_count: removed });
});

/**
 * POST /notifications/incident-alert/:incidentId
 * Create an incident alert notification for relevant users
 */
router.post('/incident-alert/:incidentId', authenticate, (req, res) => {
  const incidents = read('incidents');
  const users = read('users');
  const incident = incidents.find(i => i.id === req.params.incidentId);

  if (!incident) return res.status(404).json({ error: 'Incident not found' });

  const notifs = read('notifications');
  const severity = incident.severity || 'normal';

  // Alert for same station analysts
  const stationAnalysts = users.filter(u => 
    u.station_id === incident.station_id && 
    (u.role === 'analyst' || u.role === 'super_admin')
  );

  let created = 0;

  stationAnalysts.forEach(analyst => {
    const notification = {
      id: Date.now().toString() + Math.random(),
      title: `🚨 New Incident at ${incident.station_id}`,
      message: `${incident.title} - ${incident.description?.substring(0, 100)}...`,
      type: 'incident_alert',
      recipient_id: analyst.id,
      recipient_station_id: incident.station_id,
      severity: severity,
      related_incident_id: incident.id,
      action_url: `/incidents/${incident.id}`,
      read: false,
      created_at: new Date().toISOString(),
      created_by: 'SYSTEM'
    };
    notifs.push(notification);
    created++;
  });

  // Escalation alert for super admins if critical
  if (severity === 'critical' || incident.risk_level === 'high') {
    const superAdmins = users.filter(u => u.role === 'super_admin');
    superAdmins.forEach(admin => {
      const notification = {
        id: Date.now().toString() + Math.random(),
        title: `⚠️ ESCALATION: Critical Incident at ${incident.station_id}`,
        message: `${incident.title} - Risk Level: ${incident.risk_level || 'Unknown'}`,
        type: 'escalation',
        recipient_id: admin.id,
        severity: 'critical',
        related_incident_id: incident.id,
        action_url: `/incidents/${incident.id}`,
        read: false,
        created_at: new Date().toISOString(),
        created_by: 'SYSTEM'
      };
      notifs.push(notification);
      created++;
    });
  }

  write('notifications', notifs);

  res.json({ success: true, notifications_created: created });
});

/**
 * POST /notifications/knowledge-alert/:knowledgeId
 * Create a knowledge sharing alert for similar incidents at other stations
 */
router.post('/knowledge-alert/:knowledgeId', authenticate, (req, res) => {
  const knowledge = read('knowledge');
  const users = read('users');
  const entries = read('incidents');
  
  const knowledgeEntry = knowledge.find(k => k.id === req.params.knowledgeId);

  if (!knowledgeEntry) return res.status(404).json({ error: 'Knowledge entry not found' });

  const notifs = read('notifications');
  let created = 0;

  // Find analysts at other stations who may benefit from this knowledge
  const stationAnalysts = users.filter(u => 
    u.station_id !== knowledgeEntry.station_id && 
    (u.role === 'analyst' || u.role === 'super_admin')
  );

  stationAnalysts.forEach(analyst => {
    const notification = {
      id: Date.now().toString() + Math.random(),
      title: `💡 Knowledge Shared from ${knowledgeEntry.station_id}`,
      message: `New defensive routine: ${knowledgeEntry.title}`,
      type: 'knowledge_alert',
      recipient_id: analyst.id,
      recipient_station_id: analyst.station_id,
      severity: 'normal',
      related_knowledge_id: knowledgeEntry.id,
      action_url: `/knowledge/${knowledgeEntry.id}`,
      read: false,
      created_at: new Date().toISOString(),
      created_by: 'SYSTEM'
    };
    notifs.push(notification);
    created++;
  });

  write('notifications', notifs);

  res.json({ success: true, notifications_created: created });
});

module.exports = router;
