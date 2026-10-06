const express = require('express');
const { v4: uuid } = require('uuid');
const { read, write } = require('../store');
const { authenticate } = require('../middleware/auth');
const { requireMinRole } = require('../middleware/rbac');
const { logAction } = require('./audit');
const router = express.Router();

const readData = (name) => read(name) || [];
const writeData = (name, data) => write(name, data);

router.get('/endpoints', authenticate, requireMinRole('analyst'), (req, res) => {
  const endpoints = readData('external_report_endpoints');
  res.json(endpoints);
});

router.post('/endpoints', authenticate, requireMinRole('analyst'), (req, res) => {
  const { name, url, api_key, description, enabled } = req.body;
  if (!name || !url) return res.status(400).json({ error: 'name and url are required' });
  const endpoints = readData('external_report_endpoints');
  const newEndpoint = {
    id: 'er' + uuid().slice(0,8),
    name,
    url,
    api_key: api_key || null,
    description: description || '',
    enabled: enabled === false ? false : true,
    created_by: req.user.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  endpoints.push(newEndpoint);
  writeData('external_report_endpoints', endpoints);
  logAction({ userId: req.user.id, action: 'CREATE_EXTERNAL_ENDPOINT', targetType: 'external_endpoint', targetId: newEndpoint.id });
  res.status(201).json(newEndpoint);
});

router.put('/endpoints/:id', authenticate, requireMinRole('analyst'), (req, res) => {
  const endpoints = readData('external_report_endpoints');
  const idx = endpoints.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Endpoint not found' });
  ['name','url','api_key','description','enabled'].forEach(field => {
    if (req.body[field] !== undefined) endpoints[idx][field] = req.body[field];
  });
  endpoints[idx].updated_at = new Date().toISOString();
  writeData('external_report_endpoints', endpoints);
  logAction({ userId: req.user.id, action: 'UPDATE_EXTERNAL_ENDPOINT', targetType: 'external_endpoint', targetId: req.params.id });
  res.json(endpoints[idx]);
});

router.post('/report', authenticate, requireMinRole('analyst'), (req, res) => {
  const { endpoint_id, incident_id, incident_summary } = req.body;
  if (!endpoint_id || !incident_id) return res.status(400).json({ error: 'endpoint_id and incident_id are required' });
  const endpoints = readData('external_report_endpoints');
  const endpoint = endpoints.find(e => e.id === endpoint_id && e.enabled);
  if (!endpoint) return res.status(404).json({ error: 'Endpoint not found or disabled' });
  const incidents = readData('incidents');
  const incident = incidents.find(i => i.id === incident_id);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });
  const reports = readData('external_reports');
  const newReport = {
    id: 'erpt' + uuid().slice(0,8),
    endpoint_id,
    incident_id,
    incident_summary: incident_summary || incident.description || incident.title,
    status: 'queued',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    queued_by: req.user.id
  };
  reports.push(newReport);
  writeData('external_reports', reports);
  logAction({ userId: req.user.id, action: 'QUEUE_EXTERNAL_REPORT', targetType: 'external_report', targetId: newReport.id, metadata:{ endpoint_id, incident_id } });
  res.status(201).json(newReport);
});

router.get('/reports', authenticate, requireMinRole('analyst'), (req, res) => {
  res.json(readData('external_reports').sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)));
});

module.exports = router;
