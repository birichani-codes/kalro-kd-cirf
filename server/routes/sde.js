const express = require('express');
const fs = require('fs');
const path = require('path');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

const router = express.Router();
const sdeSettingsPath = path.join(__dirname, '../data/sde_settings.json');

// Helper to read settings
const readSettings = () => {
  try {
    const data = fs.readFileSync(sdeSettingsPath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading SDE settings:', err);
    return null;
  }
};

// Helper to write settings
const writeSettings = (settings) => {
  try {
    fs.writeFileSync(sdeSettingsPath, JSON.stringify(settings, null, 2));
    return true;
  } catch (err) {
    console.error('Error writing SDE settings:', err);
    return false;
  }
};

// GET /api/sde/settings - Get SDE settings (Super Admin only)
router.get('/settings', authenticate, requireRole('super_admin'), (req, res) => {
  const settings = readSettings();
  if (!settings) {
    return res.status(500).json({ error: 'Failed to read SDE settings' });
  }
  res.json(settings);
});

// PUT /api/sde/settings - Update SDE settings (Super Admin only)
router.put('/settings', authenticate, requireRole('super_admin'), (req, res) => {
  const newSettings = req.body;
  // Basic validation
  if (typeof newSettings.riskAppetite !== 'number' || newSettings.riskAppetite < 0 || newSettings.riskAppetite > 1) {
    return res.status(400).json({ error: 'Invalid riskAppetite: must be between 0.0 and 1.0' });
  }
  if (typeof newSettings.knowledgeConfidenceFactor !== 'number' || newSettings.knowledgeConfidenceFactor < 0 || newSettings.knowledgeConfidenceFactor > 1) {
    return res.status(400).json({ error: 'Invalid knowledgeConfidenceFactor: must be between 0.0 and 1.0' });
  }
  // Add more validations as needed

  const success = writeSettings(newSettings);
  if (!success) {
    return res.status(500).json({ error: 'Failed to save SDE settings' });
  }

  // Log the change for audit
  console.log(`SDE settings updated by user ${req.user.id} at ${new Date().toISOString()}`);

  res.json({ message: 'SDE settings updated successfully', settings: newSettings });
});

module.exports = router;