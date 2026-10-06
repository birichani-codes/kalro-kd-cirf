/**
 * Alert Enrichment Service
 * Transforms SIEM alerts into actionable incidents
 * Integrates institutional knowledge, historical context, and suggested responses
 */

const { read, write } = require('../store');
const { v4: uuid } = require('uuid');

/**
 * Enrich alert with institutional knowledge
 */
function enrichAlert(alert) {
  const now = new Date();
  
  return {
    ...alert,
    
    // Asset enrichment
    source_asset: enrichAsset(alert.source_ip),
    target_asset: enrichAsset(alert.target_ip),
    
    // Historical context
    historical_incidents: findSimilarIncidents(alert),
    
    // Threat intelligence
    threat_intel: enrichThreatIntel(alert.source_ip),
    
    // Suggested responses
    suggested_routines: suggestDefensiveRoutines(alert),
    
    // Related knowledge
    related_knowledge: findRelatedKnowledge(alert),
    
    // Priority calculation
    priority_score: calculatePriority(alert),
    
    enriched_at: now.toISOString()
  };
}

/**
 * Enrich asset information (IP → hostname, criticality, etc)
 */
function enrichAsset(ip) {
  if (!ip) return null;
  
  const assetDb = read('assets') || [];
  let asset = assetDb.find(a => a.ip === ip);
  
  if (!asset) {
    asset = {
      ip,
      hostname: `host-${ip.split('.').pop()}`,
      type: 'unknown',
      criticality: 'medium',
      owner: 'unknown'
    };
  }
  
  return asset;
}

/**
 * Find historical incidents similar to this alert
 */
function findSimilarIncidents(alert) {
  const incidents = read('incidents') || [];
  const similar = [];
  
  // Look for incidents with same type in past 90 days
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  
  for (const incident of incidents) {
    if (new Date(incident.created_at) < ninetyDaysAgo) continue;
    
    // Same type
    if (incident.type === alert.event_type) {
      similar.push({
        id: incident.id,
        title: incident.title,
        severity: incident.severity,
        status: incident.status,
        resolution_time: calculateResolutionTime(incident),
        resolved_by: incident.assigned_to,
        created_at: incident.created_at
      });
    }
    
    // Same source IP
    if (incident.entities && incident.entities.ips && 
        incident.entities.ips.includes(alert.source_ip)) {
      similar.push({
        id: incident.id,
        title: incident.title,
        severity: incident.severity,
        status: incident.status,
        match_reason: 'same_source_ip'
      });
    }
  }
  
  // Return top 3 most relevant
  return similar
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 3);
}

/**
 * Calculate resolution time for incident
 */
function calculateResolutionTime(incident) {
  if (!incident.updated_at || incident.status !== 'resolved') {
    return null;
  }
  
  const created = new Date(incident.created_at);
  const resolved = new Date(incident.updated_at);
  const minutes = Math.round((resolved - created) / 60000);
  
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
}

/**
 * Enrich threat intelligence
 */
function enrichThreatIntel(ip) {
  if (!ip) return null;
  
  // In production, integrate with threat feeds:
  // - VirusTotal
  // - AbuseIPDB
  // - AlienVault OTX
  // - Custom threat database
  
  return {
    source_ip: ip,
    reputation: getThreatReputation(ip),
    abuse_score: getThreatScore(ip),
    known_campaigns: findCampaigns(ip),
    geolocation: getGeolocation(ip),
    asn: getASN(ip)
  };
}

/**
 * Get threat reputation (known malicious, suspicious, clean, etc)
 */
function getThreatReputation(ip) {
  const knownMalicious = ['192.168.1.50', '203.0.113.45'];
  
  if (knownMalicious.includes(ip)) return 'malicious';
  if (ip.startsWith('192.168.') || ip.startsWith('10.')) return 'internal';
  
  return 'unknown';
}

/**
 * Get threat score (0-100)
 */
function getThreatScore(ip) {
  // Placeholder - integrate with actual threat intelligence
  if (ip === '203.0.113.45') return 85;
  return 0;
}

/**
 * Find known threat campaigns
 */
function findCampaigns(ip) {
  // Placeholder - integrate with threat intelligence feeds
  return [];
}

/**
 * Get IP geolocation
 */
function getGeolocation(ip) {
  if (ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return { location: 'Internal', country: 'ZA' };
  }
  
  // Placeholder - integrate with GeoIP database
  return { location: 'Unknown', country: 'Unknown' };
}

/**
 * Get ASN (Autonomous System Number)
 */
function getASN(ip) {
  // Placeholder
  return null;
}

/**
 * Suggest defensive routines from knowledge base
 */
function suggestDefensiveRoutines(alert) {
  const knowledge = read('knowledge') || [];
  const suggestions = [];

  // Special handling for EMII (External Media Incident Integration) alerts
  if (alert.type === 'external_media' || alert.event_type === 'unauthorized_media_access') {
    return suggestEMIIRoutines(alert);
  }

  // Find routines that match alert type
  for (const entry of knowledge) {
    if (!entry.defensive_routine || !entry.defensive_routine.enabled) continue;
    if (entry.status !== 'active') continue;

    // Match by incident type
    const routineTypes = entry.defensive_routine.applicable_incident_types || [];
    if (routineTypes.length === 0 || routineTypes.includes(alert.event_type)) {

      // Match by severity
      const applicableSeverities = entry.defensive_routine.applicable_severities || ['critical', 'high', 'medium', 'low'];
      if (applicableSeverities.includes(alert.severity)) {

        suggestions.push({
          routine_id: entry.id,
          title: entry.title,
          category: entry.defensive_routine.category,
          nist_function: entry.defensive_routine.nist_function,
          success_rate: entry.defensive_routine.success_rate || 0,
          avg_resolution_time: entry.defensive_routine.avg_resolution_time,
          confidence_score: entry.confidence_score || 0.5,
          steps: (entry.steps || []).slice(0, 5), // First 5 steps
          prerequisites: entry.defensive_routine.prerequisites || [],
          estimated_time_minutes: estimateTime(entry.defensive_routine.avg_resolution_time)
        });
      }
    }
  }
  
  // Sort by relevance (success rate + confidence)
  suggestions.sort((a, b) => {
    const scoreA = a.success_rate * 0.6 + a.confidence_score * 0.4;
    const scoreB = b.success_rate * 0.6 + b.confidence_score * 0.4;
    return scoreB - scoreA;
  });
  
  return suggestions.slice(0, 5); // Top 5 suggestions
}

/**
 * Suggest defensive routines specifically for EMII (External Media Incident) alerts
 */
function suggestEMIIRoutines(alert) {
  const knowledge = read('knowledge') || [];
  const suggestions = [];

  // EMII-specific defensive routines
  const emiiRoutines = [
    {
      title: 'Isolate Affected Workstation',
      category: 'Containment',
      nist_function: 'Contain',
      steps: [
        'Immediately disconnect the workstation from the network',
        'Physically secure the USB device',
        'Document the device serial number and insertion time',
        'Notify security team for forensic analysis'
      ],
      estimated_time_minutes: 15,
      success_rate: 0.95,
      prerequisites: ['Administrative access to workstation', 'Physical access to device']
    },
    {
      title: 'USB Port Security Assessment',
      category: 'Investigation',
      nist_function: 'Investigate',
      steps: [
        'Check Windows Event Logs for PnP events (Event ID 6416)',
        'Verify device authenticity against authorized registry',
        'Scan workstation for malware using endpoint protection',
        'Review user access logs for the affected workstation'
      ],
      estimated_time_minutes: 30,
      success_rate: 0.88,
      prerequisites: ['Security event log access', 'Endpoint protection console access']
    },
    {
      title: 'Data Exfiltration Analysis',
      category: 'Analysis',
      nist_function: 'Analyze',
      steps: [
        'Monitor network traffic for unusual outbound connections',
        'Check file system for recent unauthorized file access',
        'Analyze USB device contents if safe to do so',
        'Correlate with other security events in the timeframe'
      ],
      estimated_time_minutes: 45,
      success_rate: 0.82,
      prerequisites: ['Network monitoring tools', 'File system analysis tools']
    },
    {
      title: 'Registry Update and Notification',
      category: 'Recovery',
      nist_function: 'Recover',
      steps: [
        'Update authorized media registry if device is legitimate',
        'Notify affected user and provide security awareness training',
        'Implement additional USB access controls if needed',
        'Document incident for future reference'
      ],
      estimated_time_minutes: 20,
      success_rate: 0.90,
      prerequisites: ['Access to authorized media registry', 'User communication channels']
    },
    {
      title: 'Critical Asset Protection',
      category: 'Protection',
      nist_function: 'Protect',
      steps: [
        'Temporarily revoke access to sensitive systems',
        'Enable enhanced monitoring on affected workstation',
        'Update endpoint protection policies',
        'Conduct security awareness briefing for the team'
      ],
      estimated_time_minutes: 25,
      success_rate: 0.93,
      prerequisites: ['Access management system', 'Endpoint protection management']
    }
  ];

  // Add EMII-specific routines based on severity and context
  for (const routine of emiiRoutines) {
    // Always include containment for unauthorized access
    if (alert.severity === 'critical' || alert.severity === 'high' ||
        alert.type === 'unauthorized_media_access') {
      suggestions.push({
        routine_id: `emii-${routine.title.toLowerCase().replace(/\s+/g, '-')}`,
        title: routine.title,
        category: routine.category,
        nist_function: routine.nist_function,
        success_rate: routine.success_rate,
        avg_resolution_time: `${routine.estimated_time_minutes}m`,
        confidence_score: 0.9,
        steps: routine.steps,
        prerequisites: routine.prerequisites,
        estimated_time_minutes: routine.estimated_time_minutes
      });
    }
  }

  // Also check knowledge base for any EMII-related routines
  for (const entry of knowledge) {
    if (!entry.defensive_routine || !entry.defensive_routine.enabled) continue;
    if (entry.status !== 'active') continue;

    // Look for USB, media, or physical security related routines
    const title = entry.title.toLowerCase();
    const description = (entry.description || '').toLowerCase();
    const tags = (entry.tags || []).join(' ').toLowerCase();

    if (title.includes('usb') || title.includes('media') || title.includes('physical') ||
        description.includes('usb') || description.includes('removable') ||
        tags.includes('usb') || tags.includes('media') || tags.includes('physical')) {

      suggestions.push({
        routine_id: entry.id,
        title: entry.title,
        category: entry.defensive_routine.category,
        nist_function: entry.defensive_routine.nist_function,
        success_rate: entry.defensive_routine.success_rate || 0,
        avg_resolution_time: entry.defensive_routine.avg_resolution_time,
        confidence_score: entry.confidence_score || 0.5,
        steps: (entry.steps || []).slice(0, 5),
        prerequisites: entry.defensive_routine.prerequisites || [],
        estimated_time_minutes: estimateTime(entry.defensive_routine.avg_resolution_time)
      });
    }
  }

  // Sort by priority for EMII incidents (containment first)
  const priorityOrder = ['Containment', 'Investigation', 'Analysis', 'Protection', 'Recovery'];
  suggestions.sort((a, b) => {
    const aIndex = priorityOrder.indexOf(a.category);
    const bIndex = priorityOrder.indexOf(b.category);
    if (aIndex !== bIndex) return aIndex - bIndex;
    return b.success_rate - a.success_rate;
  });

  return suggestions.slice(0, 5);
}

/**
 * Convert time string to minutes
 */
function estimateTime(timeStr) {
  if (!timeStr) return 30;
  
  if (timeStr.includes('h')) {
    return parseInt(timeStr) * 60;
  }
  if (timeStr.includes('m')) {
    return parseInt(timeStr);
  }
  
  return 30;
}

/**
 * Find related knowledge entries
 */
function findRelatedKnowledge(alert) {
  const knowledge = read('knowledge') || [];
  const related = [];
  
  for (const entry of knowledge) {
    if (entry.status !== 'active') continue;
    
    // Match by tags
    const tags = entry.tags || [];
    if (tags.some(tag => alert.event_type.includes(tag.toLowerCase()))) {
      related.push({
        id: entry.id,
        title: entry.title,
        tags: tags,
        confidence_score: entry.confidence_score
      });
    }
    
    // Match by incident type
    if (entry.incident_type === alert.event_type) {
      related.push({
        id: entry.id,
        title: entry.title,
        confidence_score: entry.confidence_score
      });
    }
  }
  
  return related.slice(0, 5);
}

/**
 * Calculate priority score (0-100)
 */
function calculatePriority(alert) {
  let score = 0;
  
  // Severity weight (40%)
  const severityScores = {
    'critical': 100,
    'high': 70,
    'medium': 40,
    'low': 10
  };
  score += (severityScores[alert.severity] || 40) * 0.4;
  
  // Confidence weight (30%)
  score += (alert.confidence * 100) * 0.3;
  
  // Event frequency (20%)
  const frequencyScore = Math.min(100, (alert.event_count / 50) * 100);
  score += frequencyScore * 0.2;
  
  // Target criticality (10%)
  const targetAsset = enrichAsset(alert.target_ip);
  const criticalityScore = targetAsset && targetAsset.criticality === 'critical' ? 100 : 50;
  score += criticalityScore * 0.1;
  
  return Math.round(score);
}

/**
 * Convert enriched alert to incident
 */
function alertToIncident(enrichedAlert) {
  const incident = {
    id: 'inc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9),
    title: generateIncidentTitle(enrichedAlert),
    type: enrichedAlert.event_type,
    severity: enrichedAlert.severity,
    status: 'open',
    is_major: enrichedAlert.severity === 'critical',
    
    description: generateIncidentDescription(enrichedAlert),
    
    source: enrichedAlert.source_asset,
    target: enrichedAlert.target_asset,
    
    // Link to SIEM
    siem_alert_id: enrichedAlert.id,
    siem_rule_id: enrichedAlert.alert_rule,
    related_logs: enrichedAlert.related_logs,
    
    // Enrichment data
    threat_intel: enrichedAlert.threat_intel,
    historical_context: enrichedAlert.historical_incidents,
    suggested_routines: enrichedAlert.suggested_routines,
    related_knowledge: enrichedAlert.related_knowledge,
    
    // SLA calculation
    sla_deadline: calculateSLA(enrichedAlert.severity),
    
    // Entities
    entities: {
      ips: [enrichedAlert.source_ip, enrichedAlert.target_ip].filter(Boolean),
      hostnames: [
        enrichedAlert.source_asset?.hostname,
        enrichedAlert.target_asset?.hostname
      ].filter(Boolean)
    },
    
    // Reporting
    reported_by: 'SIEM',
    assigned_to: null,
    
    // Metadata
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: 'SIEM',
    priority_score: enrichedAlert.priority_score,
    
    // Tracking
    event_count: enrichedAlert.event_count,
    duration_seconds: enrichedAlert.time_window
  };
  
  return incident;
}

/**
 * Generate incident title from alert
 */
function generateIncidentTitle(alert) {
  const typeLabels = {
    'brute_force': 'Brute Force Attack',
    'network_anomaly': 'Network Anomaly',
    'malware_detected': 'Malware Detected',
    'unauthorized_access': 'Unauthorized Access Attempt',
    'data_exfiltration': 'Potential Data Exfiltration'
  };
  
  const typeName = typeLabels[alert.event_type] || alert.alert_name;
  const target = alert.target_asset?.hostname || alert.target_ip || 'Unknown Target';
  
  return `${typeName} - ${target}`;
}

/**
 * Generate incident description
 */
function generateIncidentDescription(alert) {
  let desc = `SIEM detected ${alert.event_type} with ${alert.event_count} related events.\n\n`;
  
  desc += `Source: ${alert.source_ip}`;
  if (alert.source_asset?.hostname) desc += ` (${alert.source_asset.hostname})`;
  desc += `\n`;
  
  desc += `Target: ${alert.target_ip}`;
  if (alert.target_asset?.hostname) desc += ` (${alert.target_asset.hostname})`;
  desc += `\n`;
  
  desc += `Time Window: ${alert.time_window} seconds\n`;
  desc += `Detection Confidence: ${(alert.confidence * 100).toFixed(0)}%\n`;
  
  if (alert.threat_intel?.reputation) {
    desc += `Threat Intelligence: ${alert.threat_intel.reputation}\n`;
  }
  
  return desc;
}

/**
 * Calculate SLA deadline based on severity
 */
function calculateSLA(severity) {
  const slaHours = {
    'critical': 2,
    'high': 4,
    'medium': 8,
    'low': 24
  };
  
  const hours = slaHours[severity] || 8;
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

/**
 * Create incident from alert
 */
function createIncidentFromAlert(alert) {
  const enriched = enrichAlert(alert);
  const incident = alertToIncident(enriched);
  
  // Store incident
  const incidents = read('incidents') || [];
  incidents.push(incident);
  write('incidents', incidents);
  
  // Create notification
  createNotification({
    title: `New Incident: ${incident.title}`,
    message: `Severity: ${incident.severity} | Source: ${incident.source?.ip}`,
    type: 'critical_incident',
    severity: incident.severity,
    related_incident_id: incident.id
  });
  
  // Log action
  if (require('../routes/audit').logAction) {
    require('../routes/audit').logAction({
      userId: 'SIEM',
      action: 'CREATE_INCIDENT_FROM_ALERT',
      targetType: 'incident',
      targetId: incident.id,
      metadata: { alert_id: alert.id, siem_rule: alert.alert_rule }
    });
  }
  
  return incident;
}

/**
 * Create notification
 */
function createNotification(data) {
  try {
    const notifications = read('notifications') || [];
    const notification = {
      id: Date.now().toString() + Math.random(),
      ...data,
      read: false,
      created_at: new Date().toISOString(),
      created_by: 'SIEM'
    };
    notifications.push(notification);
    write('notifications', notifications);
  } catch (error) {
    console.error('[AlertEnrichment] Error creating notification:', error);
  }
}

/**
 * Process pending alerts
 */
function processPendingAlerts() {
  const siemEngine = require('./siemEngine');
  
  // Get alerts
  const alerts = read('siem_alerts') || [];
  const newAlerts = alerts.filter(a => a.status === 'new');
  
  const results = {
    total_alerts: newAlerts.length,
    incidents_created: 0,
    duplicates_skipped: 0
  };
  
  for (const alert of newAlerts) {
    if (alert.deduplicated) {
      alert.status = 'skipped';
      results.duplicates_skipped++;
      continue;
    }
    
    try {
      createIncidentFromAlert(alert);
      alert.status = 'processed';
      results.incidents_created++;
    } catch (error) {
      console.error('[AlertEnrichment] Error processing alert:', error);
      alert.status = 'error';
    }
  }
  
  write('siem_alerts', alerts);
  return results;
}

module.exports = {
  enrichAlert,
  createIncidentFromAlert,
  processPendingAlerts,
  suggestDefensiveRoutines,
  findSimilarIncidents,
  enrichThreatIntel,
  alertToIncident
};
