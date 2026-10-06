/**
 * Game Theory Route Handler
 * Strategic decision support and configuration management
 */

const express = require('express');
const { read, write } = require('../store');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAction } = require('./audit');
const gameTheory = require('../logic/game-theory');
const sosioTechnical = require('../logic/socio-technical');
const router = express.Router();

// ─── GET CONFIGURATION ────────────────────────────────────────────────────

router.get('/config', authenticate, (req, res) => {
  const config = read('game-theory-config') || [];
  if (config.length === 0) {
    return res.json({
      riskAppetite: 0.5,
      businessImpactHours: 8,
      hourlyBusinessCost: 500,
      isolationCost: 4000,
      monitoringCost: 100
    });
  }
  res.json(config[0]);
});

// ─── UPDATE CONFIGURATION (Super Admin Only) ──────────────────────────────

router.post('/config', authenticate, requireRole('super_admin'), (req, res) => {
  const { riskAppetite, businessImpactHours, hourlyBusinessCost, isolationCost, monitoringCost } = req.body;

  if (riskAppetite === undefined) {
    return res.status(400).json({ error: 'riskAppetite required' });
  }

  if (riskAppetite < 0 || riskAppetite > 1) {
    return res.status(400).json({ error: 'riskAppetite must be between 0 and 1' });
  }

  const config = {
    riskAppetite,
    businessImpactHours: businessImpactHours || 8,
    hourlyBusinessCost: hourlyBusinessCost || 500,
    isolationCost: isolationCost || 4000,
    monitoringCost: monitoringCost || 100,
    updated_at: new Date().toISOString(),
    updated_by: req.user.id
  };

  write('game-theory-config', [config]);

  logAction({
    userId: req.user.id,
    action: 'UPDATE_GAME_THEORY_CONFIG',
    metadata: { riskAppetite }
  });

  res.json(config);
});

// ─── GET RESILIENCE DASHBOARD ─────────────────────────────────────────────

router.get('/metrics/resilience', authenticate, (req, res) => {
  try {
    const metrics = gameTheory.calculateResilienceMetrics();
    res.json(metrics);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET STS ANALYSIS REPORT ──────────────────────────────────────────────

router.get('/metrics/socio-technical', authenticate, (req, res) => {
  try {
    const report = sosioTechnical.generateResiliencyReport();
    res.json(report);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET STRATEGIC INSIGHTS ───────────────────────────────────────────────

router.get('/insights', authenticate, (req, res) => {
  const incidents = read('incidents');
  const knowledge = read('knowledge');

  // Analyze incident patterns
  const criticalUnresolved = incidents.filter(i =>
    i.severity === 'critical' && !['resolved', 'closed'].includes(i.status)
  );

  const slaBreachers = incidents.filter(i => i.sla_breached === true);

  const highRiskSTS = incidents.filter(i =>
    i.socio_technical?.sts_risk_score > 60
  );

  const underutilizedRoutines = knowledge
    .filter(k => k.defensive_routine && k.defensive_routine.times_applied < 2)
    .length;

  const insights = {
    alerts: [],
    recommendations: [],
    opportunities: []
  };

  // Generate alerts
  if (criticalUnresolved.length > 0) {
    insights.alerts.push({
      severity: 'critical',
      message: `${criticalUnresolved.length} critical incidents unresolved`,
      incidents: criticalUnresolved.map(i => ({ id: i.id, title: i.title }))
    });
  }

  if (slaBreachers.length > incidents.length * 0.2) {
    insights.alerts.push({
      severity: 'high',
      message: `${slaBreachers.length} incidents have breached SLA`,
      count: slaBreachers.length
    });
  }

  if (highRiskSTS.length > 0) {
    insights.alerts.push({
      severity: 'high',
      message: `${highRiskSTS.length} incidents have high socio-technical complexity (>60 score)`,
      incidents: highRiskSTS.map(i => ({ id: i.id, title: i.title, score: i.socio_technical?.sts_risk_score }))
    });
  }

  // Generate recommendations
  if (underutilizedRoutines > 0) {
    insights.recommendations.push({
      type: 'knowledge',
      message: `${underutilizedRoutines} defensive routines are underutilized. Consider reviewing or updating them.`,
      action: 'review-routines'
    });
  }

  const avgGameTheoryConfidence = incidents
    .filter(i => i.strategic_decisions?.length > 0)
    .reduce((sum, i) => sum + (i.strategic_decisions[0]?.confidence || 0), 0) / 
    Math.max(incidents.filter(i => i.strategic_decisions?.length > 0).length, 1);

  if (avgGameTheoryConfidence < 0.6) {
    insights.recommendations.push({
      type: 'strategy',
      message: 'Average confidence in strategic decisions is low. Consider updating risk appetite configuration.',
      action: 'review-config'
    });
  }

  // Generate opportunities
  const wellPerformingRoutines = knowledge
    .filter(k => k.defensive_routine?.success_rate > 0.9)
    .sort((a, b) => b.defensive_routine.times_applied - a.defensive_routine.times_applied)
    .slice(0, 3);

  if (wellPerformingRoutines.length > 0) {
    insights.opportunities.push({
      type: 'routine',
      message: 'Best-performing defensive routines available',
      routines: wellPerformingRoutines.map(r => ({
        id: r.id,
        title: r.title,
        success_rate: r.defensive_routine.success_rate
      }))
    });
  }

  res.json(insights);
});

// ─── GET HISTORICAL DECISIONS ─────────────────────────────────────────────

router.get('/decisions/history', authenticate, (req, res) => {
  const incidents = read('incidents');
  const users = read('users');
  const decisions = [];

  incidents.forEach(incident => {
    if (incident.strategic_decisions?.length > 0) {
      incident.strategic_decisions.forEach(decision => {
        decisions.push({
          id: decision.id,
          incident_id: incident.id,
          incident_title: incident.title,
          decision_type: decision.decision_type,
          confidence: decision.confidence,
          user_name: users.find(u => u.id === decision.user_id)?.name || 'Unknown',
          created_at: decision.created_at,
          implemented_at: decision.implemented_at,
          outcome: decision.outcome
        });
      });
    }
  });

  res.json(decisions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
});

// ─── INSTITUTIONAL ENABLERS ────────────────────────────────────────────────

router.get('/institutional-enablers', authenticate, (req, res) => {
  const enablers = read('institutional-enablers') || [];
  res.json(enablers);
});

router.post('/institutional-enablers', authenticate, requireRole('super_admin'), (req, res) => {
  const { category, title, description, addresses_factor, related_incidents } = req.body;

  if (!category || !title) {
    return res.status(400).json({ error: 'category and title required' });
  }

  const enabler = {
    id: 'ie' + Math.random().toString(36).slice(2, 9),
    category,
    title,
    description: description || '',
    addresses_factor: addresses_factor || null,
    implementation_status: 'proposed',
    related_incidents: related_incidents || [],
    created_at: new Date().toISOString(),
    created_by: req.user.id,
    implemented_at: null,
    impact_metric: null
  };

  const enablers = read('institutional-enablers') || [];
  enablers.push(enabler);
  write('institutional-enablers', enablers);

  logAction({
    userId: req.user.id,
    action: 'CREATE_INSTITUTIONAL_ENABLER',
    targetType: 'enabler',
    targetId: enabler.id,
    metadata: { category, title }
  });

  res.status(201).json(enabler);
});

router.put('/institutional-enablers/:id', authenticate, requireRole('super_admin'), (req, res) => {
  const enablers = read('institutional-enablers') || [];
  const idx = enablers.findIndex(e => e.id === req.params.id);

  if (idx === -1) return res.status(404).json({ error: 'Not found' });

  const { implementation_status, impact_metric } = req.body;

  if (implementation_status) {
    enablers[idx].implementation_status = implementation_status;
    if (implementation_status === 'implemented') {
      enablers[idx].implemented_at = new Date().toISOString();
    }
  }

  if (impact_metric !== undefined) {
    enablers[idx].impact_metric = impact_metric;
  }

  write('institutional-enablers', enablers);

  logAction({
    userId: req.user.id,
    action: 'UPDATE_INSTITUTIONAL_ENABLER',
    targetType: 'enabler',
    targetId: req.params.id,
    metadata: { status: implementation_status }
  });

  res.json(enablers[idx]);
});

module.exports = router;
