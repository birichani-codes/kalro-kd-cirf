const express = require('express');
const { read, write } = require('../store');
const { authenticate } = require('../middleware/auth');
const { requireMinRole } = require('../middleware/rbac');
const { logAction } = require('./audit');
const router = express.Router();

router.get('/knowledge-pulse', authenticate, (req, res) => {
  const alerts = read('knowledge_alerts');
  res.json(alerts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
});

router.post('/knowledge-pulse', authenticate, requireMinRole('analyst'), (req, res) => {
  const { incident_id, routine_id, title, summary, source_site, source_station_id, target_site, target_station_id } = req.body;
  if (!incident_id || !routine_id || !title || !summary) {
    return res.status(400).json({ error: 'incident_id, routine_id, title and summary are required' });
  }

  const alerts = read('knowledge_alerts');
  const newAlert = {
    id: 'pulse' + Math.random().toString(36).slice(2, 9),
    incident_id,
    routine_id,
    title,
    summary,
    source_site: source_site || 'Headquarters',
    source_station_id: source_station_id || req.user.station_id || 'Headquarters',
    target_site: target_site || 'All Sites',
    target_station_id: target_station_id || 'All Sites',
    severity: 'high',
    status: 'new',
    created_at: new Date().toISOString(),
    created_by: req.user.id
  };
  alerts.push(newAlert);
  write('knowledge_alerts', alerts);

  logAction({ userId: req.user.id, action: 'CREATE_KNOWLEDGE_PULSE', targetType: 'knowledge_alert', targetId: newAlert.id, metadata: { incident_id, routine_id } });
  res.status(201).json(newAlert);
});

module.exports = router;
