/**
 * Log Ingestion Service
 * Handles receiving logs from multiple sources:
 * - Syslog (UDP/TCP on port 514)
 * - HTTP API (POST /api/log-collection/api)
 * - Webhooks (POST /api/log-collection/webhook)
 * 
 * Responsibilities:
 * 1. Normalize logs to standard format
 * 2. Deduplicate repeated events
 * 3. Store raw logs
 * 4. Queue for SIEM processing
 */

const { read, write } = require('../store');
const fs = require('fs');
const path = require('path');

// In-memory dedup cache (last 100 events, 5-minute window)
const dedupCache = new Map();
const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_DEDUP_ENTRIES = 1000;

/**
 * Generate a fingerprint for log deduplication
 * Two events with same fingerprint within 5 min = duplicate
 */
function generateLogFingerprint(log) {
  const key = [
    log.source_ip,
    log.event_type,
    log.target_ip,
    JSON.stringify(log.fields || {})
  ].join('::');
  
  return Buffer.from(key).toString('base64');
}

/**
 * Check if log is duplicate of recent event
 */
function isDuplicate(fingerprint) {
  if (!dedupCache.has(fingerprint)) return false;
  
  const lastTime = dedupCache.get(fingerprint);
  const ageMs = Date.now() - lastTime;
  
  if (ageMs > DEDUP_WINDOW_MS) {
    dedupCache.delete(fingerprint);
    return false;
  }
  
  return true;
}

/**
 * Record log fingerprint for dedup
 */
function recordFingerprint(fingerprint) {
  dedupCache.set(fingerprint, Date.now());
  
  // Keep cache size bounded
  if (dedupCache.size > MAX_DEDUP_ENTRIES) {
    const oldestKey = dedupCache.keys().next().value;
    dedupCache.delete(oldestKey);
  }
}

/**
 * Normalize various log formats to standard schema
 * 
 * Input formats:
 * - Syslog: "May 10 10:30:45 fw01 DROP [SYN FLOOD] src=192.168.1.5 dst=10.0.0.1"
 * - JSON: {"timestamp": "...", "event": "...", ...}
 * - CEF: "CEF:0|Vendor|Product|Version|Event ID|Name|Severity|..."
 */
function normalizeLog(rawLog, sourceType) {
  const now = new Date().toISOString();
  
  // If already normalized JSON
  if (typeof rawLog === 'object' && rawLog.event_type) {
    return {
      id: 'log-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9),
      timestamp: rawLog.timestamp || now,
      source_ip: rawLog.source_ip || rawLog.src_ip || 'unknown',
      target_ip: rawLog.target_ip || rawLog.dst_ip || null,
      source_hostname: rawLog.source_hostname || rawLog.host || 'unknown',
      source_type: sourceType || 'api',
      event_type: rawLog.event_type || 'generic_event',
      raw_message: JSON.stringify(rawLog),
      fields: rawLog.fields || extractFieldsFromLog(rawLog),
      severity_raw: rawLog.severity || calculateSeverity(rawLog),
      ingested_at: now,
      station_id: rawLog.station_id || 'Headquarters',
      processed: false,
      correlation_group: null
    };
  }
  
  // Parse Syslog format
  if (typeof rawLog === 'string') {
    return parseSyslog(rawLog, sourceType, now);
  }
  
  // Fallback: treat as string message
  return {
    id: 'log-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9),
    timestamp: now,
    source_ip: 'unknown',
    source_type: sourceType || 'unknown',
    event_type: 'raw_message',
    raw_message: String(rawLog),
    fields: {},
    severity_raw: 'medium',
    ingested_at: now,
    station_id: 'Headquarters',
    processed: false
  };
}

/**
 * Parse Syslog format (RFC 3164)
 */
function parseSyslog(message, sourceType, now) {
  // Format: "May 10 10:30:45 hostname TAG: message"
  const regex = /(\w+\s+\d+\s+\d+:\d+:\d+)\s+(\S+)\s+(.+)/;
  const match = message.match(regex);
  
  if (!match) {
    return normalizeLog({ raw_message: message }, sourceType);
  }
  
  const [, timestamp, hostname, content] = match;
  
  // Extract IPs from message
  const ipRegex = /(\d+\.\d+\.\d+\.\d+)/g;
  const ips = content.match(ipRegex) || [];
  
  return {
    id: 'log-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9),
    timestamp: now,
    source_hostname: hostname,
    source_ip: ips[0] || 'unknown',
    target_ip: ips[1] || null,
    source_type: sourceType || 'syslog',
    event_type: extractEventType(content),
    raw_message: message,
    fields: extractFieldsFromLog(content),
    severity_raw: calculateSeverity(content),
    ingested_at: now,
    station_id: 'Headquarters',
    processed: false
  };
}

/**
 * Extract event type from log message
 */
function extractEventType(message) {
  const patterns = {
    'brute_force': /brute|fail|auth|password|denied/i,
    'network_anomaly': /syn|ddos|flood|packet|drop/i,
    'malware': /malware|trojan|virus|ransomware|worm/i,
    'unauthorized_access': /unauthorized|access_denied|privilege|escalation/i,
    'data_exfiltration': /exfil|data|transfer|large|upload/i,
    'compliance': /pci|hipaa|gdpr|sox|compliance/i
  };
  
  for (const [type, pattern] of Object.entries(patterns)) {
    if (pattern.test(message)) return type;
  }
  
  return 'security_event';
}

/**
 * Calculate severity based on keywords
 */
function calculateSeverity(data) {
  const text = typeof data === 'string' ? data : JSON.stringify(data);
  
  if (/critical|exploit|ransomware|unauthorized/i.test(text)) return 'critical';
  if (/high|brute|malware|attack/i.test(text)) return 'high';
  if (/medium|warning|suspicious|potential/i.test(text)) return 'medium';
  
  return 'low';
}

/**
 * Extract key-value fields from log
 */
function extractFieldsFromLog(data) {
  const fields = {};
  
  if (typeof data === 'object') {
    return data;
  }
  
  const text = String(data);
  
  // Extract key=value pairs
  const kvRegex = /(\w+)=([^\s,]+)/g;
  let match;
  while ((match = kvRegex.exec(text)) !== null) {
    fields[match[1]] = match[2];
  }
  
  return fields;
}

/**
 * Ingest log from any source
 */
function ingestLog(rawLog, sourceType = 'api', stationId = 'Headquarters') {
  try {
    // 1. Normalize log
    const normalized = normalizeLog(rawLog, sourceType);
    normalized.station_id = stationId;
    
    // 2. Check for duplicates
    const fingerprint = generateLogFingerprint(normalized);
    
    if (isDuplicate(fingerprint)) {
      console.log(`[LogIngestion] Duplicate event filtered: ${normalized.event_type}`);
      return { success: true, status: 'deduplicated', log: normalized };
    }
    
    recordFingerprint(fingerprint);
    
    // 3. Store raw log
    const logs = read('raw_logs') || [];
    logs.push(normalized);
    write('raw_logs', logs);
    
    // 4. Add to processing queue
    const queue = read('siem_queue') || [];
    queue.push({
      log_id: normalized.id,
      added_at: new Date().toISOString(),
      status: 'pending'
    });
    write('siem_queue', queue);
    
    return {
      success: true,
      status: 'ingested',
      log_id: normalized.id,
      event_type: normalized.event_type,
      severity: normalized.severity_raw
    };
    
  } catch (error) {
    console.error('[LogIngestion] Error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Batch ingest multiple logs
 */
function ingestBatch(logs, sourceType = 'api', stationId = 'Headquarters') {
  const results = [];
  
  for (const log of logs) {
    results.push(ingestLog(log, sourceType, stationId));
  }
  
  return {
    success: true,
    total: logs.length,
    ingested: results.filter(r => r.status === 'ingested').length,
    deduplicated: results.filter(r => r.status === 'deduplicated').length,
    failed: results.filter(r => !r.success).length
  };
}

/**
 * Get unprocessed logs for SIEM analysis
 */
function getUnprocessedLogs() {
  const logs = read('raw_logs') || [];
  return logs.filter(log => !log.processed);
}

/**
 * Mark log as processed by SIEM
 */
function markLogProcessed(logId) {
  const logs = read('raw_logs') || [];
  const log = logs.find(l => l.id === logId);
  
  if (log) {
    log.processed = true;
    write('raw_logs', logs);
  }
}

/**
 * Get statistics
 */
function getStatistics() {
  const logs = read('raw_logs') || [];
  const queue = read('siem_queue') || [];
  
  const byType = {};
  const bySeverity = {};
  const bySource = {};
  
  logs.forEach(log => {
    byType[log.event_type] = (byType[log.event_type] || 0) + 1;
    bySeverity[log.severity_raw] = (bySeverity[log.severity_raw] || 0) + 1;
    bySource[log.source_type] = (bySource[log.source_type] || 0) + 1;
  });
  
  return {
    total_logs: logs.length,
    processed_logs: logs.filter(l => l.processed).length,
    unprocessed_logs: logs.filter(l => !l.processed).length,
    queue_length: queue.length,
    dedup_cache_size: dedupCache.size,
    by_type: byType,
    by_severity: bySeverity,
    by_source: bySource
  };
}

/**
 * Clear old logs (older than days)
 */
function clearOldLogs(days = 30) {
  const logs = read('raw_logs') || [];
  const cutoffTime = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  const filtered = logs.filter(log => new Date(log.ingested_at) > cutoffTime);
  const removed = logs.length - filtered.length;
  
  write('raw_logs', filtered);
  
  return { removed, remaining: filtered.length };
}

module.exports = {
  ingestLog,
  ingestBatch,
  getUnprocessedLogs,
  markLogProcessed,
  getStatistics,
  clearOldLogs,
  normalizeLog,
  isDuplicate
};
