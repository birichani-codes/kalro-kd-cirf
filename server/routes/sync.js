const express = require('express');
const { read, write } = require('../store');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAction } = require('./audit');
const router = express.Router();

const calculateStationHealth = (station) => {
  if (station.major_incidents > 0 || station.open_incidents > 4) return 'critical';
  if (station.open_incidents > 1) return 'active';
  return 'stable';
};

const buildStationStatus = (stationName, incidents, knowledge, users) => {
  const stationIncidents = incidents.filter(i => (i.station_id || 'Headquarters') === stationName);
  const stationUsers = users.filter(u => u.station_id === stationName);
  const stationKnowledge = knowledge.filter(k => k.station_id === stationName && !k.global_routine);
  const stationMajor = stationIncidents.filter(i => i.is_major).length;
  const pending = knowledge.filter(k => k.station_id === stationName && k.sync_status === 'pending').length;
  const globalAvailable = knowledge.filter(k => k.global_routine && k.status === 'active').length;
  const averageConfidence = stationKnowledge.length ? Number((stationKnowledge.reduce((sum, item) => sum + (item.confidence_score || 0), 0) / stationKnowledge.length).toFixed(2)) : 0;
  return {
    station_id: stationName,
    total_incidents: stationIncidents.length,
    open_incidents: stationIncidents.filter(i => ['open','investigating','escalated'].includes(i.status)).length,
    major_incidents: stationMajor,
    total_users: stationUsers.length,
    local_routines: stationKnowledge.length,
    pending_approvals: pending,
    global_routines_available: globalAvailable,
    avg_local_routine_confidence: averageConfidence,
    health: calculateStationHealth({ open_incidents: stationIncidents.filter(i => ['open','investigating','escalated'].includes(i.status)).length, major_incidents: stationMajor }),
    last_sync: new Date().toISOString()
  };
};

const calculateResilienceMetrics = (incidents, knowledge) => {
  const total = incidents.length;
  const open = incidents.filter(i => ['open','investigating','escalated'].includes(i.status)).length;
  const major_count = incidents.filter(i => i.is_major).length;
  const critical = incidents.filter(i => i.severity === 'critical').length;
  const sla_breached = incidents.filter(i => !['resolved','closed'].includes(i.status) && new Date() > new Date(i.sla_deadline || i.created_at)).length;
  const activeGlobalRoutines = knowledge.filter(k => k.global_routine && k.status === 'active');
  const avgRoutineEffectiveness = activeGlobalRoutines.length ? Number((activeGlobalRoutines.reduce((sum, item) => sum + (item.confidence_score || 0), 0) / activeGlobalRoutines.length).toFixed(2)) : 0;
  const incidentTypes = {};
  incidents.forEach(i => { incidentTypes[i.type] = (incidentTypes[i.type] || 0) + 1; });
  const resilienceScore = Number((((total - sla_breached) / (total || 1)) * 0.5 + (activeGlobalRoutines.length > 0 ? Math.min(avgRoutineEffectiveness, 1) * 0.5 : 0)).toFixed(2));
  return {
    total_incidents: total,
    open_incidents: open,
    major_incidents: major_count,
    critical_incidents: critical,
    sla_breached: sla_breached,
    total_global_routines: activeGlobalRoutines.length,
    avg_global_routine_effectiveness: avgRoutineEffectiveness,
    incident_type_distribution: incidentTypes,
    resilience_score: resilienceScore
  };
};

const buildLinkedIncidentClusters = (incidents) => {
  return incidents
    .filter(i => Array.isArray(i.linked_incidents) && i.linked_incidents.length > 0)
    .map(i => ({
      incident_id: i.id,
      title: i.title,
      station_id: i.station_id || 'Headquarters',
      linked_incidents: i.linked_incidents
    }));
};

const buildStsHeatmap = (incidents) => {
  const heatmap = {};
  incidents.forEach(i => {
    if (i.socio_technical) {
      const station = i.station_id || 'Headquarters';
      heatmap[station] = heatmap[station] || { station, records: 0, technical: 0, social: 0, hybrid: 0 };
      heatmap[station].records++;
      const type = i.socio_technical.focus || 'hybrid';
      if (type === 'technical') heatmap[station].technical++;
      else if (type === 'social') heatmap[station].social++;
      else heatmap[station].hybrid++;
    }
  });
  return Object.values(heatmap);
};

/**
 * GET /sync/stations
 * List all known stations and their sync status
 */
router.get('/stations', authenticate, requireRole('super_admin'), (req, res) => {
  const incidents = read('incidents');
  const knowledge = read('knowledge');
  const users = read('users');

  // Aggregate station metadata
  const stations = {};
  
  incidents.forEach(inc => {
    const station = inc.station_id || 'Headquarters';
    if (!stations[station]) {
      stations[station] = {
        name: station,
        total_incidents: 0,
        open_incidents: 0,
        users: 0,
        local_routines: 0,
        major_incidents: 0,
        pending_approvals: 0,
        global_routines_available: 0,
        avg_local_routine_confidence: 0,
        synced_at: new Date().toISOString()
      };
    }
    stations[station].total_incidents++;
    if (['open','investigating','escalated'].includes(inc.status)) {
      stations[station].open_incidents++;
    }
    if (inc.is_major) {
      stations[station].major_incidents++;
    }
  });

  users.forEach(u => {
    if (u.station_id) {
      if (!stations[u.station_id]) {
        stations[u.station_id] = {
          name: u.station_id,
          total_incidents: 0,
          open_incidents: 0,
          users: 0,
          local_routines: 0,
          major_incidents: 0,
          pending_approvals: 0,
          global_routines_available: 0,
          avg_local_routine_confidence: 0,
          synced_at: new Date().toISOString()
        };
      }
      stations[u.station_id].users++;
    }
  });

  knowledge.forEach(k => {
    const station = k.station_id || 'Headquarters';
    if (!stations[station]) {
      stations[station] = {
        name: station,
        total_incidents: 0,
        open_incidents: 0,
        users: 0,
        local_routines: 0,
        major_incidents: 0,
        pending_approvals: 0,
        global_routines_available: 0,
        avg_local_routine_confidence: 0,
        synced_at: new Date().toISOString()
      };
    }
    if (!k.global_routine) {
      stations[station].local_routines++;
    }
    if (k.sync_status === 'pending') {
      stations[station].pending_approvals++;
    }
    if (k.global_routine && k.status === 'active') {
      stations[station].global_routines_available++;
    }
    if (!k.global_routine && k.confidence_score !== undefined) {
      stations[station].avg_local_routine_confidence = ((stations[station].avg_local_routine_confidence * (stations[station].local_routines - 1 || 0)) + k.confidence_score) / stations[station].local_routines;
    }
  });

  const result = Object.values(stations).map(st => ({
    ...st,
    health: calculateStationHealth(st)
  }));

  res.json(result);
});

/**
 * GET /sync/pending-approvals
 * Super Admin view: routines pending approval for global sync
 */
router.get('/pending-approvals', authenticate, requireRole('super_admin'), (req, res) => {
  const knowledge = read('knowledge');
  const users = read('users');

  const pending = knowledge.filter(k => k.sync_status === 'pending').map(k => {
    const contributor = users.find(u => u.id === k.contributor_id);
    return {
      id: k.id,
      title: k.title,
      station_id: k.station_id || 'Unknown',
      contributor: contributor?.name || 'Unknown',
      pushed_at: k.pushed_at,
      content_preview: k.content.substring(0, 150) + '...',
      tags: k.tags
    };
  });

  res.json(pending);
});

/**
 * POST /sync/approve/:knowledgeId
 * Super Admin: approve a local routine for global sync
 */
router.post('/approve/:knowledgeId', authenticate, requireRole('super_admin'), (req, res) => {
  const knowledge = read('knowledge');
  const idx = knowledge.findIndex(k => k.id === req.params.knowledgeId);

  if (idx === -1) return res.status(404).json({ error: 'Knowledge entry not found' });

  knowledge[idx].sync_status = 'approved';
  knowledge[idx].global_routine = true;
  knowledge[idx].approved_by = req.user.id;
  knowledge[idx].approved_at = new Date().toISOString();

  write('knowledge', knowledge);

  logAction({
    userId: req.user.id,
    action: 'APPROVE_ROUTINE_GLOBAL_SYNC',
    targetType: 'knowledge',
    targetId: req.params.knowledgeId,
    metadata: { station_id: knowledge[idx].station_id }
  });

  res.json({ success: true, entry: knowledge[idx] });
});

/**
 * POST /sync/reject/:knowledgeId
 * Super Admin: reject a routine for global sync
 */
router.post('/reject/:knowledgeId', authenticate, requireRole('super_admin'), (req, res) => {
  const { reason } = req.body;
  const knowledge = read('knowledge');
  const idx = knowledge.findIndex(k => k.id === req.params.knowledgeId);

  if (idx === -1) return res.status(404).json({ error: 'Knowledge entry not found' });

  knowledge[idx].sync_status = 'rejected';
  knowledge[idx].rejection_reason = reason || '';
  knowledge[idx].rejected_by = req.user.id;
  knowledge[idx].rejected_at = new Date().toISOString();

  write('knowledge', knowledge);

  logAction({
    userId: req.user.id,
    action: 'REJECT_ROUTINE_GLOBAL_SYNC',
    targetType: 'knowledge',
    targetId: req.params.knowledgeId,
    metadata: { reason, station_id: knowledge[idx].station_id }
  });

  res.json({ success: true, entry: knowledge[idx] });
});

/**
 * GET /sync/global-routines
 * Get all globally approved routines for distribution to spokes
 */
router.get('/global-routines', authenticate, (req, res) => {
  const knowledge = read('knowledge');
  const global = knowledge.filter(k => k.global_routine && k.status === 'active');
  res.json(global);
});

/**
 * GET /sync/local-cache
 * Local station: get routines available locally (global + own station)
 */
router.get('/local-cache', authenticate, (req, res) => {
  const knowledge = read('knowledge');
  const userStation = req.user.station_id || 'Headquarters';

  const local = knowledge.filter(k =>
    k.status === 'active' && (
      k.global_routine ||
      k.station_id === userStation ||
      !k.station_id
    )
  );

  res.json(local);
});

/**
 * POST /sync/pull-updates
 * Local station: manually pull updates from hub
 */
router.post('/pull-updates', authenticate, (req, res) => {
  const userStation = req.user.station_id || 'Headquarters';
  const knowledge = read('knowledge');
  const global = knowledge.filter(k => k.global_routine && k.status === 'active');

  logAction({
    userId: req.user.id,
    action: 'PULL_UPDATES_FROM_HUB',
    targetType: 'station',
    targetId: userStation,
    metadata: { routines_pulled: global.length }
  });

  res.json({
    success: true,
    station: userStation,
    global_routines_count: global.length,
    pulled_at: new Date().toISOString(),
    routines: global
  });
});

/**
 * GET /sync/status/:stationId
 * Get sync health and last update for a specific station
 */
router.get('/status/:stationId', authenticate, requireRole('super_admin'), (req, res) => {
  const { stationId } = req.params;
  const knowledge = read('knowledge');
  const incidents = read('incidents');
  const users = read('users');

  const stationIncidents = incidents.filter(i => i.station_id === stationId);
  const stationUsers = users.filter(u => u.station_id === stationId);
  const stationRoutines = knowledge.filter(k => k.station_id === stationId && !k.global_routine);
  const globalRoutines = knowledge.filter(k => k.global_routine);

  const status = {
    station_id: stationId,
    total_incidents: stationIncidents.length,
    open_incidents: stationIncidents.filter(i => i.status === 'open' || i.status === 'investigating').length,
    total_users: stationUsers.length,
    local_routines: stationRoutines.length,
    global_routines_available: globalRoutines.length,
    last_sync: new Date().toISOString(),
    pending_approvals: knowledge.filter(k => k.station_id === stationId && k.sync_status === 'pending').length,
    health: stationIncidents.length > 0 ? 'active' : 'quiet'
  };

  res.json(status);
});

/**
 * GET /sync/station-health
 * Detailed health status for all stations
 */
router.get('/station-health', authenticate, requireRole('super_admin'), (req, res) => {
  const incidents = read('incidents');
  const users = read('users');
  const knowledge = read('knowledge');
  const logs = read('audit_logs');

  const stations = {};
  const now = new Date();

  incidents.forEach(inc => {
    const stationId = inc.station_id || 'Headquarters';
    if (!stations[stationId]) {
      stations[stationId] = {
        station_id: stationId,
        total_incidents: 0,
        open_incidents: 0,
        sla_breached: 0,
        avg_resolution_time: 0,
        connectivity: 'online',
        last_activity: null,
        sync_lag_minutes: 0,
        uptime_percent: 99.5
      };
    }
    stations[stationId].total_incidents++;
    if (inc.status === 'open' || inc.status === 'investigating') stations[stationId].open_incidents++;
    if (inc.sla_breached) stations[stationId].sla_breached++;
    if (inc.updated_at) {
      if (!stations[stationId].last_activity || new Date(inc.updated_at) > new Date(stations[stationId].last_activity)) {
        stations[stationId].last_activity = inc.updated_at;
      }
    }
  });

  logs.forEach(log => {
    const stationId = log.metadata?.station_id || null;
    if (stationId && stations[stationId]) {
      if (!stations[stationId].last_activity || new Date(log.created_at) > new Date(stations[stationId].last_activity)) {
        stations[stationId].last_activity = log.created_at;
      }
    }
  });

  Object.keys(stations).forEach(stationId => {
    const stationIncidents = incidents.filter(i => i.station_id === stationId);
    if (stationIncidents.length > 0) {
      const resolutionTimes = stationIncidents
        .filter(i => i.status === 'closed' || i.status === 'resolved')
        .map(i => new Date(i.updated_at) - new Date(i.created_at))
        .filter(t => t > 0);
      if (resolutionTimes.length > 0) {
        stations[stationId].avg_resolution_time = Math.round(resolutionTimes.reduce((a, b) => a + b) / resolutionTimes.length / 3600000);
      }
    }
    if (stations[stationId].last_activity) {
      const lag = (now - new Date(stations[stationId].last_activity)) / 60000;
      stations[stationId].sync_lag_minutes = Math.round(lag);
      stations[stationId].connectivity = lag > 120 ? 'offline' : 'online';
    }
  });

  res.json(Object.values(stations));
});

/**
 * GET /sync/network-resilience
 * Network-wide resilience metrics
 */
router.get('/network-resilience', authenticate, requireRole('super_admin'), (req, res) => {
  const incidents = read('incidents');
  const knowledge = read('knowledge');

  const totalIncidents = incidents.length;
  const resolvedIncidents = incidents.filter(i => i.status === 'closed' || i.status === 'resolved').length;
  const resolutionRate = totalIncidents > 0 ? (resolvedIncidents / totalIncidents * 100) : 0;
  
  const slaBreached = incidents.filter(i => i.sla_breached).length;
  const slaCompliance = totalIncidents > 0 ? ((totalIncidents - slaBreached) / totalIncidents * 100) : 0;

  const majorIncidents = incidents.filter(i => i.is_major).length;
  const majorResolved = incidents.filter(i => i.is_major && (i.status === 'closed' || i.status === 'resolved')).length;
  const majorResolutionRate = majorIncidents > 0 ? (majorResolved / majorIncidents * 100) : 0;

  const globalRoutines = knowledge.filter(k => k.global_routine && k.status === 'active').length;
  const routineApplications = knowledge.filter(k => k.applications_count > 0).reduce((sum, k) => sum + (k.applications_count || 0), 0);
  const routineEffectiveness = knowledge.filter(k => k.payoff_rating).reduce((sum, k) => sum + (k.payoff_rating || 0), 0) / Math.max(globalRoutines, 1);

  const resilience = {
    resolution_rate: Math.round(resolutionRate * 10) / 10,
    sla_compliance: Math.round(slaCompliance * 10) / 10,
    major_incident_resolution_rate: Math.round(majorResolutionRate * 10) / 10,
    global_routines_active: globalRoutines,
    routine_effectiveness_score: Math.round(routineEffectiveness * 100) / 100,
    network_health_score: Math.round(((resolutionRate + slaCompliance + majorResolutionRate) / 3) * 10) / 10,
    metrics_timestamp: new Date().toISOString()
  };

  res.json(resilience);
});

/**
 * GET /sync/knowledge-alerts
 * Cross-site threat awareness alerts
 */
router.get('/knowledge-alerts', authenticate, requireRole('super_admin'), (req, res) => {
  const knowledge = read('knowledge');
  const incidents = read('incidents');

  const alerts = knowledge
    .filter(k => k.status === 'active' && k.tags && k.tags.length > 0)
    .map(k => {
      const relatedIncidents = incidents.filter(i => 
        k.tags.some(tag => (i.type && i.type.toLowerCase().includes(tag.toLowerCase())) || (i.tags && i.tags.includes(tag)))
      );
      const stationsAffected = new Set(relatedIncidents.map(i => i.station_id));
      return {
        id: k.id,
        title: k.title,
        source_station: k.station_id,
        incident_type: k.incident_id ? 'incident_derived' : 'manual',
        tags: k.tags,
        stations_with_similar_incidents: Array.from(stationsAffected),
        incident_count: relatedIncidents.length,
        created_at: k.created_at,
        confidence_score: k.confidence_score || 0.7
      };
    })
    .filter(a => a.stations_with_similar_incidents.length > 1)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  res.json(alerts);
});

/**
 * GET /sync/socio-technical-risk
 * STS risk assessment by station
 */
router.get('/socio-technical-risk', authenticate, requireRole('super_admin'), (req, res) => {
  const incidents = read('incidents');
  const users = read('users');
  const knowledge = read('knowledge');

  const stations = {};

  incidents.forEach(inc => {
    const stationId = inc.station_id || 'Headquarters';
    if (!stations[stationId]) {
      stations[stationId] = {
        station_id: stationId,
        technical_incidents: 0,
        social_incidents: 0,
        hybrid_incidents: 0,
        training_readiness: 0.6,
        policy_compliance: 0.7,
        infrastructure_maturity: 0.65,
        sts_risk_score: 0
      };
    }
    const stType = inc.socio_technical?.root_cause_type || 'hybrid';
    stations[stationId][stType + '_incidents']++;
  });

  users.forEach(u => {
    if (u.station_id && stations[u.station_id]) {
      if (u.training_status === 'completed') {
        stations[u.station_id].training_readiness += 0.1;
      }
    }
  });

  knowledge.forEach(k => {
    if (k.station_id && stations[k.station_id]) {
      if (k.status === 'active') {
        stations[k.station_id].policy_compliance += 0.05;
      }
    }
  });

  Object.keys(stations).forEach(stationId => {
    const st = stations[stationId];
    st.training_readiness = Math.min(st.training_readiness, 1.0);
    st.policy_compliance = Math.min(st.policy_compliance, 1.0);
    st.sts_risk_score = 1.0 - ((st.training_readiness + st.policy_compliance + st.infrastructure_maturity) / 3);
  });

  res.json(Object.values(stations));
});

/**
 * GET /sync/routine-effectiveness
 * Routine payoff ratings and effectiveness trends
 */
router.get('/routine-effectiveness', authenticate, requireRole('super_admin'), (req, res) => {
  const knowledge = read('knowledge');
  const incidents = read('incidents');

  const routines = knowledge
    .filter(k => k.global_routine && k.status === 'active')
    .map(k => {
      const applications = incidents.filter(i => i.applied_defensive_routines?.some(r => r.knowledge_id === k.id));
      const successfulApplications = applications.filter(a => a.status === 'closed' || a.status === 'resolved').length;
      const successRate = applications.length > 0 ? (successfulApplications / applications.length) : 0;
      return {
        id: k.id,
        title: k.title,
        station_source: k.station_id,
        applications_count: applications.length,
        success_rate: Math.round(successRate * 100) / 100,
        payoff_rating: k.payoff_rating || successRate,
        nist_function: k.nist_function || 'unknown',
        tags: k.tags,
        last_applied: applications.length > 0 ? applications[applications.length - 1].updated_at : null
      };
    })
    .sort((a, b) => (b.payoff_rating || 0) - (a.payoff_rating || 0));

  res.json(routines);
});

/**
 * GET /sync/cross-site-incidents
 * Related incidents across stations
 */
router.get('/cross-site-incidents', authenticate, requireRole('super_admin'), (req, res) => {
  const incidents = read('incidents');

  const groupedByType = {};
  incidents.forEach(inc => {
    const type = inc.type || 'unknown';
    if (!groupedByType[type]) groupedByType[type] = [];
    groupedByType[type].push(inc);
  });

  const crossSiteGroups = Object.entries(groupedByType)
    .filter(([_, incs]) => incs.length > 1)
    .map(([type, incs]) => {
      const stations = new Set(incs.map(i => i.station_id));
      return {
        incident_type: type,
        total_count: incs.length,
        stations_affected: Array.from(stations),
        incidents: incs.map(i => ({
          id: i.id,
          title: i.title,
          station_id: i.station_id,
          status: i.status,
          severity: i.severity,
          created_at: i.created_at
        })),
        pattern: incs.length > 2 ? 'cluster' : 'correlation'
      };
    })
    .sort((a, b) => b.total_count - a.total_count);

  res.json(crossSiteGroups);
});

/**
 * GET /sync/response-analytics
 * SLA compliance and response time metrics by station and type
 */
router.get('/response-analytics', authenticate, requireRole('super_admin'), (req, res) => {
  const incidents = read('incidents');

  const byStation = {};
  const byType = {};

  incidents.forEach(inc => {
    const station = inc.station_id || 'Headquarters';
    const type = inc.type || 'unknown';

    if (!byStation[station]) byStation[station] = { total: 0, sla_met: 0, avg_time: 0, times: [] };
    if (!byType[type]) byType[type] = { total: 0, sla_met: 0, avg_time: 0, times: [] };

    byStation[station].total++;
    byType[type].total++;

    if (!inc.sla_breached) {
      byStation[station].sla_met++;
      byType[type].sla_met++;
    }

    if (inc.status === 'closed' || inc.status === 'resolved') {
      const resolution_time = (new Date(inc.updated_at) - new Date(inc.created_at)) / 3600000;
      byStation[station].times.push(resolution_time);
      byType[type].times.push(resolution_time);
    }
  });

  const formatStats = (data) => {
    return Object.entries(data).map(([key, stat]) => ({
      key,
      total_incidents: stat.total,
      sla_compliance_percent: stat.total > 0 ? Math.round((stat.sla_met / stat.total) * 100 * 10) / 10 : 0,
      avg_resolution_hours: stat.times.length > 0 ? Math.round((stat.times.reduce((a, b) => a + b) / stat.times.length) * 10) / 10 : 0
    }));
  };

  res.json({
    by_station: formatStats(byStation),
    by_incident_type: formatStats(byType)
  });
});

module.exports = router;
