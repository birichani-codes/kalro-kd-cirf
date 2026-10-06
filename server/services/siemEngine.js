/**
 * SIEM Analysis Engine
 * Analyzes normalized logs to detect security events
 * 
 * Features:
 * - Pattern matching against threat rules
 * - Event correlation (multi-source attacks)
 * - Severity calculation with context
 * - False positive reduction
 * - Alert generation
 */

const { read, write } = require('../store');

/**
 * Built-in threat detection rules
 * Format: { name, pattern, eventType, baseSeverity, minOccurrences }
 */
const THREAT_RULES = [
  {
    id: 'rule-brute-force',
    name: 'Brute Force Attack',
    pattern: /fail|denied|invalid.*password/i,
    eventType: 'brute_force',
    baseSeverity: 'high',
    correlation: {
      window: 300000, // 5 minutes
      minOccurrences: 10,
      groupBy: ['source_ip', 'target_ip']
    }
  },
  {
    id: 'rule-syn-flood',
    name: 'SYN Flood Detection',
    pattern: /syn.*flood|drop.*syn|connection.*reset/i,
    eventType: 'network_anomaly',
    baseSeverity: 'critical',
    correlation: {
      window: 300000,
      minOccurrences: 50,
      groupBy: ['source_ip', 'target_ip']
    }
  },
  {
    id: 'rule-malware',
    name: 'Malware Detected',
    pattern: /malware|trojan|virus|ransomware|worm|exploit/i,
    eventType: 'malware_detected',
    baseSeverity: 'critical',
    correlation: {
      window: 600000, // 10 minutes
      minOccurrences: 2,
      groupBy: ['source_ip']
    }
  },
  {
    id: 'rule-unauthorized-access',
    name: 'Unauthorized Access Attempt',
    pattern: /unauthorized|privilege.*escalation|access.*denied|403|401/i,
    eventType: 'unauthorized_access',
    baseSeverity: 'high',
    correlation: {
      window: 300000,
      minOccurrences: 5,
      groupBy: ['source_ip', 'target_ip']
    }
  },
  {
    id: 'rule-data-exfiltration',
    name: 'Potential Data Exfiltration',
    pattern: /exfil|large.*transfer|unusual.*outbound|data.*transfer/i,
    eventType: 'data_exfiltration',
    baseSeverity: 'critical',
    correlation: {
      window: 600000,
      minOccurrences: 3,
      groupBy: ['source_ip']
    }
  }
];

/**
 * IP/Domain whitelist to reduce false positives
 */
const WHITELIST = {
  ips: [
    '127.0.0.1',
    '::1',
    '192.168.0.0/16', // Private networks
    '10.0.0.0/8'
  ],
  domains: [
    'localhost',
    '*.internal',
    'kalro.local'
  ],
  eventPatterns: [
    /heartbeat|keepalive|ping|health.*check/i,
    /authenticated.*success|login.*ok/i
  ]
};

/**
 * Check if log is in whitelist
 */
function isWhitelisted(log) {
  // Check event type patterns
  for (const pattern of WHITELIST.eventPatterns) {
    const messageToCheck = log.raw_message || log.message || '';
    if (pattern.test(messageToCheck)) {
      return true;
    }
  }
  
  // Check source IP
  const sourceIp = log.source_ip || log.normalized?.source_ip;
  if (sourceIp && isIpInRange(sourceIp, WHITELIST.ips)) {
    return true;
  }
  
  return false;
}

/**
 * Simple IP range check
 */
function isIpInRange(ip, ranges) {
  if (!ip || !ranges) {
    return false;
  }
  
  for (const range of ranges) {
    if (range.includes('/')) {
      // CIDR check simplified - in production use proper library
      const [subnet] = range.split('/');
      if (ip.startsWith(subnet.split('.').slice(0, 2).join('.'))) {
        return true;
      }
    } else if (ip === range || ip.includes(range)) {
      return true;
    }
  }
  return false;
}

/**
 * Match log against threat rules
 */
function matchRules(log) {
  const matches = [];
  
  for (const rule of THREAT_RULES) {
    if (rule.pattern.test(log.raw_message)) {
      matches.push({
        rule_id: rule.id,
        rule_name: rule.name,
        event_type: rule.eventType,
        base_severity: rule.baseSeverity,
        correlation: rule.correlation
      });
    }
  }
  
  return matches;
}

/**
 * Correlate similar events within time window
 */
function correlateEvents(logs) {
  const correlated = [];
  const processed = new Set();
  
  for (let i = 0; i < logs.length; i++) {
    if (processed.has(logs[i].id)) continue;
    
    const current = logs[i];
    const matches = matchRules(current);
    
    for (const match of matches) {
      if (!match.correlation) continue;
      
      const { window, minOccurrences, groupBy } = match.correlation;
      const windowStart = new Date(new Date(current.timestamp).getTime() - window);
      
      // Find related events
      const related = logs.filter(log => {
        if (processed.has(log.id)) return false;
        
        const logTime = new Date(log.timestamp);
        if (logTime < windowStart) return false;
        
        // Check if grouped by same values
        for (const key of groupBy) {
          if (log[key] !== current[key]) return false;
        }
        
        // Check if same rule matches
        return matchRules(log).some(m => m.rule_id === match.rule_id);
      });
      
      if (related.length >= minOccurrences) {
        // Mark as processed
        related.forEach(log => processed.add(log.id));
        
        // Create correlation alert
        correlated.push({
          type: 'correlation',
          rule_id: match.rule_id,
          rule_name: match.rule_name,
          event_type: match.event_type,
          base_severity: match.base_severity,
          source_ip: current.source_ip,
          target_ip: current.target_ip,
          related_log_ids: related.map(l => l.id),
          event_count: related.length,
          first_event: related[0].timestamp,
          last_event: related[related.length - 1].timestamp,
          duration_seconds: (new Date(related[related.length - 1].timestamp) - new Date(related[0].timestamp)) / 1000,
          confidence: Math.min(1, related.length / (minOccurrences * 1.5)) // Higher count = higher confidence
        });
      }
    }
  }
  
  return correlated;
}

/**
 * Generate SIEM alert from correlated events
 */
function generateAlert(correlation) {
  const alert = {
    id: 'alert-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9),
    alert_name: correlation.rule_name,
    alert_rule: correlation.rule_id,
    event_type: correlation.event_type,
    severity: calculateAlertSeverity(correlation),
    confidence: Number(correlation.confidence.toFixed(2)),
    event_count: correlation.event_count,
    time_window: correlation.duration_seconds,
    source_ip: correlation.source_ip,
    target_ip: correlation.target_ip,
    related_logs: correlation.related_log_ids,
    created_at: new Date().toISOString(),
    status: 'new',
    deduplicated: false,
    whitelist_status: 'not_whitelisted'
  };
  
  return alert;
}

/**
 * Calculate alert severity (may be elevated based on context)
 */
function calculateAlertSeverity(correlation) {
  let severity = correlation.base_severity;
  let multiplier = 1;
  
  // Adjust based on event frequency
  if (correlation.event_count > 100) multiplier = 1.5;
  else if (correlation.event_count > 50) multiplier = 1.2;
  
  // Adjust based on target criticality
  const targetInfo = getAssetInfo(correlation.target_ip);
  if (targetInfo && targetInfo.criticality === 'critical') {
    multiplier *= 1.3;
  }
  
  // Adjust based on threat intelligence
  const threatScore = getThreatScore(correlation.source_ip);
  if (threatScore > 0.7) multiplier *= 1.2;
  
  const severityLevels = ['low', 'medium', 'high', 'critical'];
  const baseIndex = severityLevels.indexOf(severity);
  const elevatedIndex = Math.min(severityLevels.length - 1, Math.ceil(baseIndex * multiplier));
  
  return severityLevels[elevatedIndex];
}

/**
 * Get asset information (in real system, query asset database)
 */
function getAssetInfo(ip) {
  // Placeholder - in production, query your asset management system
  const criticalAssets = ['10.0.0.1', '10.0.0.2', '10.0.0.100']; // DC, SQL Server, etc
  
  return {
    ip,
    criticality: criticalAssets.includes(ip) ? 'critical' : 'medium'
  };
}

/**
 * Get threat intelligence score for IP (0-1)
 */
function getThreatScore(ip) {
  // Placeholder - in production, query threat intelligence feeds
  // Common public IPs to watch
  const knownMaliciousIps = {
    '192.168.1.100': 0.3,
    '203.0.113.45': 0.8 // Example malicious IP
  };
  
  return knownMaliciousIps[ip] || 0;
}

/**
 * Check for duplicate alerts (alert within 5 min with same signature)
 */
function isDuplicateAlert(newAlert, existingAlerts) {
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  
  for (const existing of existingAlerts) {
    if (new Date(existing.created_at) < fiveMinAgo) continue;
    
    // Same rule, source, target = duplicate
    if (existing.alert_rule === newAlert.alert_rule &&
        existing.source_ip === newAlert.source_ip &&
        existing.target_ip === newAlert.target_ip) {
      return true;
    }
  }
  
  return false;
}

/**
 * Analyze batch of logs
 */
function analyzeLogs(logs) {
  const results = {
    total_logs: logs.length,
    whitelisted: 0,
    alerts_generated: 0,
    alerts: []
  };
  
  // Filter whitelist
  const filtered = logs.filter(log => {
    if (isWhitelisted(log)) {
      results.whitelisted++;
      return false;
    }
    return true;
  });
  
  // Correlate events
  const correlations = correlateEvents(filtered);
  
  // Generate alerts from correlations
  const existingAlerts = read('siem_alerts') || [];
  
  for (const correlation of correlations) {
    const alert = generateAlert(correlation);
    
    // Check for duplicates
    if (isDuplicateAlert(alert, existingAlerts)) {
      alert.deduplicated = true;
      alert.status = 'duplicate';
    }
    
    results.alerts.push(alert);
    results.alerts_generated++;
  }
  
  // Save alerts
  const allAlerts = [...existingAlerts, ...results.alerts];
  write('siem_alerts', allAlerts);
  
  return results;
}

/**
 * Process SIEM queue
 */
function processSiemQueue() {
  const logIngestion = require('./logIngestion');
  
  // Get unprocessed logs
  const unprocessedLogs = logIngestion.getUnprocessedLogs();
  
  if (unprocessedLogs.length === 0) {
    return { status: 'no_logs', processed: 0 };
  }
  
  // Analyze in batch
  const results = analyzeLogs(unprocessedLogs);
  
  // Mark logs as processed
  unprocessedLogs.forEach(log => {
    logIngestion.markLogProcessed(log.id);
  });
  
  return {
    status: 'success',
    processed: unprocessedLogs.length,
    ...results
  };
}

/**
 * Get alert statistics
 */
function getAlertStats() {
  const alerts = read('siem_alerts') || [];
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  const recentAlerts = alerts.filter(a => new Date(a.created_at) > oneDayAgo);
  
  const stats = {
    total_alerts: alerts.length,
    alerts_24h: recentAlerts.length,
    by_severity: {},
    by_rule: {},
    duplicate_rate: 0
  };
  
  recentAlerts.forEach(alert => {
    stats.by_severity[alert.severity] = (stats.by_severity[alert.severity] || 0) + 1;
    stats.by_rule[alert.alert_rule] = (stats.by_rule[alert.alert_rule] || 0) + 1;
  });
  
  const duplicated = recentAlerts.filter(a => a.deduplicated).length;
  stats.duplicate_rate = recentAlerts.length ? (duplicated / recentAlerts.length * 100).toFixed(1) : 0;
  
  return stats;
}

module.exports = {
  analyzeLogs,
  processSiemQueue,
  matchRules,
  correlateEvents,
  generateAlert,
  getAlertStats,
  THREAT_RULES,
  WHITELIST
};
