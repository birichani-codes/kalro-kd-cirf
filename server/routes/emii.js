/**
 * External Media Incident Integration (EMII) Routes
 * API endpoints for managing authorized media registry and EMII incidents
 */

const express = require('express');
const router = express.Router();
const emii = require('../services/emii');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { read, write } = require('../store');

// Get authorized media registry
router.get('/registry', authenticateToken, (req, res) => {
  try {
    const registry = emii.getAuthorizedMediaRegistry();
    res.json({
      success: true,
      data: registry
    });
  } catch (error) {
    console.error('[EMII] Error fetching registry:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch authorized media registry'
    });
  }
});

// Add device to authorized registry
router.post('/registry', authenticateToken, requireRole(['admin', 'security']), (req, res) => {
  try {
    const { vid, pid, serialNumber, deviceName, authorizedUsers, authorizedStations } = req.body;

    if (!serialNumber || !deviceName) {
      return res.status(400).json({
        success: false,
        error: 'Serial number and device name are required'
      });
    }

    const deviceData = {
      vid,
      pid,
      serialNumber,
      deviceName,
      authorizedUsers: authorizedUsers || [],
      authorizedStations: authorizedStations || [],
      added_by: req.user.id
    };

    const newDevice = emii.addAuthorizedDevice(deviceData);

    // Log the action
    const auditLogs = read('audit_logs') || [];
    auditLogs.push({
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      action: 'add_authorized_device',
      user_id: req.user.id,
      details: { deviceData },
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });
    write('audit_logs', auditLogs);

    res.json({
      success: true,
      data: newDevice,
      message: 'Device added to authorized media registry'
    });
  } catch (error) {
    console.error('[EMII] Error adding device:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add device to registry'
    });
  }
});

// Revoke device authorization
router.put('/registry/:serialNumber/revoke', authenticateToken, requireRole(['admin', 'security']), (req, res) => {
  try {
    const { serialNumber } = req.params;
    const success = emii.revokeDeviceAuthorization(serialNumber, req.user.id);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Device not found in registry'
      });
    }

    // Log the action
    const auditLogs = read('audit_logs') || [];
    auditLogs.push({
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      action: 'revoke_device_authorization',
      user_id: req.user.id,
      details: { serialNumber },
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });
    write('audit_logs', auditLogs);

    res.json({
      success: true,
      message: 'Device authorization revoked'
    });
  } catch (error) {
    console.error('[EMII] Error revoking device:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to revoke device authorization'
    });
  }
});

// Get EMII statistics
router.get('/stats', authenticateToken, (req, res) => {
  try {
    const stats = emii.getEMIIStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('[EMII] Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch EMII statistics'
    });
  }
});

// Get EMII incidents
router.get('/incidents', authenticateToken, (req, res) => {
  try {
    const incidents = read('incidents') || [];
    const emiiIncidents = incidents.filter(inc =>
      inc.type === 'unauthorized_media_access' ||
      inc.type === 'authorized_media_access'
    );

    // Apply filters if provided
    const { status, severity, station } = req.query;
    let filteredIncidents = emiiIncidents;

    if (status) {
      filteredIncidents = filteredIncidents.filter(inc => inc.status === status);
    }

    if (severity) {
      filteredIncidents = filteredIncidents.filter(inc => inc.severity === severity);
    }

    if (station) {
      filteredIncidents = filteredIncidents.filter(inc =>
        inc.entities?.stations?.includes(station)
      );
    }

    // Sort by creation date (newest first)
    filteredIncidents.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json({
      success: true,
      data: filteredIncidents
    });
  } catch (error) {
    console.error('[EMII] Error fetching incidents:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch EMII incidents'
    });
  }
});

// Update EMII incident status
router.put('/incidents/:incidentId', authenticateToken, requireRole(['admin', 'security', 'analyst']), (req, res) => {
  try {
    const { incidentId } = req.params;
    const { status, assigned_to, notes } = req.body;

    const incidents = read('incidents') || [];
    const incident = incidents.find(inc => inc.id === incidentId);

    if (!incident) {
      return res.status(404).json({
        success: false,
        error: 'Incident not found'
      });
    }

    // Update incident
    if (status) incident.status = status;
    if (assigned_to) incident.assigned_to = assigned_to;
    if (notes) {
      incident.notes = incident.notes || [];
      incident.notes.push({
        timestamp: new Date().toISOString(),
        user_id: req.user.id,
        note: notes
      });
    }
    incident.updated_at = new Date().toISOString();
    incident.updated_by = req.user.id;

    write('incidents', incidents);

    // Log the action
    const auditLogs = read('audit_logs') || [];
    auditLogs.push({
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      action: 'update_emii_incident',
      user_id: req.user.id,
      details: { incidentId, updates: { status, assigned_to, notes } },
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });
    write('audit_logs', auditLogs);

    res.json({
      success: true,
      data: incident,
      message: 'Incident updated successfully'
    });
  } catch (error) {
    console.error('[EMII] Error updating incident:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update incident'
    });
  }
});

// Test EMII functionality (admin only)
router.post('/test', authenticateToken, requireRole(['admin']), (req, res) => {
  try {
    // Simulate a USB insertion event for testing
    const testDevice = {
      eventType: 'usb_insertion',
      device: {
        vid: '1234',
        pid: '5678',
        serialNumber: 'TEST-SERIAL-001',
        deviceName: 'Test USB Device'
      },
      timestamp: new Date().toISOString(),
      stationId: req.body.stationId || 'Test Station',
      workstationId: req.body.workstationId || 'Test Workstation'
    };

    // This will trigger the analysis and incident creation
    const result = emii.analyzeUSBDevice(testDevice, req.app.get('io'));

    res.json({
      success: true,
      data: result,
      message: 'EMII test event triggered successfully'
    });
  } catch (error) {
    console.error('[EMII] Error in test:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to run EMII test'
    });
  }
});

// Bulk import authorized devices
router.post('/registry/import', authenticateToken, requireRole(['admin']), (req, res) => {
  try {
    const { devices } = req.body;

    if (!Array.isArray(devices)) {
      return res.status(400).json({
        success: false,
        error: 'Devices must be an array'
      });
    }

    const registry = emii.getAuthorizedMediaRegistry();
    let imported = 0;
    let skipped = 0;

    for (const device of devices) {
      if (!device.serialNumber || !device.deviceName) {
        skipped++;
        continue;
      }

      if (!registry[device.serialNumber]) {
        emii.addAuthorizedDevice({
          ...device,
          added_by: req.user.id
        });
        imported++;
      } else {
        skipped++;
      }
    }

    // Log the action
    const auditLogs = read('audit_logs') || [];
    auditLogs.push({
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      action: 'bulk_import_devices',
      user_id: req.user.id,
      details: { imported, skipped, total: devices.length },
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });
    write('audit_logs', auditLogs);

    res.json({
      success: true,
      data: { imported, skipped, total: devices.length },
      message: `Bulk import completed: ${imported} imported, ${skipped} skipped`
    });
  } catch (error) {
    console.error('[EMII] Error in bulk import:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to import devices'
    });
  }
});

module.exports = router;