/**
 * Log Collection API Routes
 * Endpoints for receiving logs from various sources
 * 
 * POST /api/log-collection/api    - JSON API endpoint
 * POST /api/log-collection/webhook - Generic webhook endpoint
 * GET  /api/log-collection/stats  - Collection statistics
 * POST /api/log-collection/process - Trigger SIEM processing
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireMinRole } = require('../middleware/rbac');

const logIngestion = require('../services/logIngestion');
const siemEngine = require('../services/siemEngine');
const alertEnrichment = require('../services/alertEnrichment');

/**
 * POST /api/log-collection/api
 * Standard JSON API for log submission
 * 
 * Body:
 * {
 *   "source": "firewall-01",          // Log source identifier
 *   "event_type": "connection_denied", // Type of event
 *   "timestamp": "2026-05-10T10:30Z",  // ISO timestamp
 *   "source_ip": "192.168.1.5",
 *   "target_ip": "10.0.0.1",
 *   "message": "TCP SYN flood detected",
 *   "severity": "high",
 *   "station_id": "Headquarters"
 * }
 */
router.post('/api', (req, res) => {
  try {
    const { source, events, station_id } = req.body;
    
    if (!source) {
      return res.status(400).json({ error: 'source is required' });
    }
    
    // Support both single event and batch
    const logs = Array.isArray(events) ? events : [req.body];
    
    const result = logIngestion.ingestBatch(logs, source, station_id || 'Headquarters');
    
    res.json({
      success: true,
      message: `Ingested ${result.ingested} log(s)`,
      ...result
    });
    
  } catch (error) {
    console.error('[LogCollection/API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/log-collection/webhook
 * Generic webhook endpoint for third-party SIEM/security tools
 * 
 * Supports multiple formats:
 * - Splunk webhook format
 * - ELK/Elasticsearch format
 * - Generic JSON
 */
router.post('/webhook', (req, res) => {
  try {
    const sourceType = req.headers['x-source-type'] || 'webhook';
    const stationId = req.headers['x-station-id'] || 'Headquarters';
    const apiKey = req.headers['x-api-key'];
    
    // Basic API key validation
    if (apiKey && !validateApiKey(apiKey)) {
      return res.status(401).json({ error: 'Invalid API key' });
    }
    
    // Handle Splunk format
    if (req.body.result) {
      return handleSplunkWebhook(req, res, sourceType, stationId);
    }
    
    // Handle generic JSON
    const result = logIngestion.ingestLog(req.body, sourceType, stationId);
    
    res.status(result.success ? 202 : 400).json(result);
    
  } catch (error) {
    console.error('[LogCollection/Webhook] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Handle Splunk webhook format
 */
function handleSplunkWebhook(req, res, sourceType, stationId) {
  try {
    const { result } = req.body;
    
    const log = {
      source_ip: result.src_ip || result.source || 'unknown',
      target_ip: result.dst_ip || result.dest || null,
      event_type: result.signature || result.event_type || 'security_event',
      timestamp: result._time || new Date().toISOString(),
      raw_message: JSON.stringify(result),
      severity: result.severity || 'medium',
      fields: result
    };
    
    const result_data = logIngestion.ingestLog(log, sourceType || 'splunk', stationId);
    res.status(result_data.success ? 202 : 400).json(result_data);
    
  } catch (error) {
    console.error('[LogCollection/Splunk] Error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Simple API key validation
 */
function validateApiKey(apiKey) {
  // In production, validate against secure key store
  const validKeys = [
    'demo-api-key-001',
    'firewall-01-key',
    'ids-primary-key'
  ];
  return validKeys.includes(apiKey);
}

/**
 * POST /api/log-collection/syslog
 * Syslog reception (usually handled by dedicated Syslog daemon)
 * This is for direct API calls in Syslog format
 */
router.post('/syslog', (req, res) => {
  try {
    const { message, station_id } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }
    
    const result = logIngestion.ingestLog(message, 'syslog', station_id || 'Headquarters');
    
    res.status(result.success ? 202 : 400).json(result);
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/log-collection/stats
 * Get collection and processing statistics
 */
router.get('/stats', authenticate, (req, res) => {
  try {
    const ingestionStats = logIngestion.getStatistics();
    const alertStats = siemEngine.getAlertStats();
    
    res.json({
      ingestion: ingestionStats,
      alerts: alertStats,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/log-collection/process
 * Trigger SIEM processing of queued logs
 * (Normally runs on timer, but can be triggered manually)
 */
router.post('/process', authenticate, requireMinRole('analyst'), (req, res) => {
  try {
    // Step 1: Process logs through SIEM
    console.log('[LogCollection] Processing SIEM queue...');
    const siemResults = siemEngine.processSiemQueue();
    
    console.log(`[LogCollection] Generated ${siemResults.alerts_generated} alerts`);
    
    // Step 2: Enrich alerts and create incidents
    console.log('[LogCollection] Processing enrichment...');
    const enrichResults = alertEnrichment.processPendingAlerts();
    
    console.log(`[LogCollection] Created ${enrichResults.incidents_created} incidents`);
    
    res.json({
      success: true,
      siem_processing: siemResults,
      incident_creation: enrichResults,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[LogCollection/Process] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/log-collection/status
 * Get current system status
 */
router.get('/status', authenticate, (req, res) => {
  try {
    const { read } = require('../store');
    
    const rawLogs = read('raw_logs') || [];
    const siemAlerts = read('siem_alerts') || [];
    const incidents = read('incidents') || [];
    
    const unprocessedLogs = rawLogs.filter(l => !l.processed).length;
    const newAlerts = siemAlerts.filter(a => a.status === 'new').length;
    const openIncidents = incidents.filter(i => ['open', 'investigating', 'escalated'].includes(i.status)).length;
    
    res.json({
      system_status: 'operational',
      pipeline_health: {
        raw_logs: {
          total: rawLogs.length,
          unprocessed: unprocessedLogs
        },
        siem_alerts: {
          total: siemAlerts.length,
          pending: newAlerts
        },
        incidents: {
          total: incidents.length,
          open: openIncidents
        }
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/log-collection/test
 * Test endpoint for configuration verification
 */
router.post('/test', (req, res) => {
  try {
    const { source, message } = req.body;
    
    // Test log ingestion
    const testLog = {
      source_ip: '192.168.1.100',
      target_ip: '10.0.0.1',
      event_type: 'test_event',
      raw_message: message || 'Test message from log collection API',
      fields: { test: true }
    };
    
    const result = logIngestion.ingestLog(testLog, source || 'test', 'Test Station');
    
    res.json({
      success: true,
      message: 'Test log ingested successfully',
      log_id: result.log_id,
      test_connection: 'OK'
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message,
      test_connection: 'FAILED'
    });
  }
});

module.exports = router;
