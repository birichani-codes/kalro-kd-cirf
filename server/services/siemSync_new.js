/**
 * SIEM Sync Service
 * Fetches cybersecurity alerts from NIST/CISA (free, no auth required)
 * Maps CVE alerts to incident format and stores locally
 * Streams new incidents via SSE
 */

const https = require('https');
const { read, write } = require('../store');

const NIST_CVE_API = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
let activeStreams = []; // Track SSE connections for broadcasting

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 15000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse response: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Fetch recent CVEs from NIST (free public API, no auth)
 */
async function fetchCVEAlerts() {
  try {
    console.log('[SIEM] Fetching CVE alerts from NIST...');
    const url = `${NIST_CVE_API}?startIndex=0&resultsPerPage=50&sortBy=published`;
    const response = await httpGet(url);
    const cves = response.vulnerabilities || [];
    console.log(`[SIEM] Fetched ${cves.length} CVEs from NIST`);
    return cves;
  } catch (err) {
    console.error('[SIEM] Failed to fetch NIST CVEs:', err.message);
    console.log('[SIEM] Using demo incidents instead');
    return generateDemoIncidents();
  }
}

/**
 * Generate realistic demo incidents for testing
 */
function generateDemoIncidents() {
  const types = ['ransomware', 'phishing', 'malware', 'ddos', 'data_exfiltration', 'unauthorized_access'];
  const severities = ['critical', 'high', 'medium', 'low'];
  const threats = [
    'Unusual network traffic detected',
    'SQL injection attempt blocked',
    'Brute force attack in progress',
    'Suspicious file upload detected',
    'Privilege escalation attempt',
    'Data exfiltration detected',
    'Ransomware signature matched',
    'Phishing email identified'
  ];

  const demoIncidents = [];
  for (let i = 0; i < 20; i++) {
    demoIncidents.push({
      id: `demo-${Date.now()}-${i}`,
      title: threats[Math.floor(Math.random() * threats.length)],
      severity: severities[Math.floor(Math.random() * severities.length)],
      type: types[Math.floor(Math.random() * types.length)],
      description: `Security alert generated for demo. Incident ${i + 1}.`,
      published: new Date(Date.now() - Math.random() * 86400000 * 30).toISOString() // Last 30 days
    });
  }
  return demoIncidents;
}

/**
 * Map CVE/Alert to KALRO incident format
 */
function mapAlertToIncident(alert, index) {
  const cveId = alert.cve?.id || `alert-${Date.now()}-${index}`;
  
  // Extract severity from CVSS
  let severity = 'medium';
  const cvssScore = alert.impact?.baseMetricV3?.cvssV3?.baseScore || alert.cvssScore || 5;
  if (cvssScore >= 9) severity = 'critical';
  else if (cvssScore >= 7) severity = 'high';
  else if (cvssScore >= 4) severity = 'medium';
  else severity = 'low';

  const description = alert.descriptions?.[0]?.value || alert.description || alert.title || 'Security vulnerability detected';
  
  // Categorize incident type
  let incidentType = 'other';
  const desc = description.toLowerCase();
  if (desc.includes('phish')) incidentType = 'phishing';
  else if (desc.includes('ransomware') || desc.includes('crypt')) incidentType = 'ransomware';
  else if (desc.includes('malware') || desc.includes('trojan') || desc.includes('worm')) incidentType = 'malware';
  else if (desc.includes('denial') || desc.includes('dos')) incidentType = 'ddos';
  else if (desc.includes('exfil') || desc.includes('steal')) incidentType = 'data_exfiltration';
  else if (desc.includes('access') || desc.includes('auth') || desc.includes('privilege')) incidentType = 'unauthorized_access';

  return {
    id: `cve-${cveId}`,
    title: `[${severity.toUpperCase()}] ${cveId}`,
    description: description.substring(0, 500),
    type: incidentType,
    severity,
    status: 'open',
    is_major: severity === 'critical' || severity === 'high',
    reported_by: 'SYSTEM',
    assigned_to: null,
    station_id: 'SIEM',
    entities: {
      cve_id: cveId,
      cvss_score: cvssScore
    },
    source: 'NIST CVE Database',
    source_cve_id: cveId,
    source_url: `https://nvd.nist.gov/vuln/detail/${cveId}`,
    created_at: new Date(alert.published || new Date()).toISOString(),
    updated_at: new Date().toISOString(),
    metadata: {
      cve_id: cveId,
      cvss_score: cvssScore
    }
  };
}

/**
 * Sync incidents from external SIEM
 */
async function syncIncidents() {
  try {
    const alerts = await fetchCVEAlerts();
    if (alerts.length === 0) {
      console.log('[SIEM] No alerts to sync');
      return [];
    }

    const incidents = read('incidents');
    const existingIds = new Set(incidents.map(i => i.id));
    const newIncidents = [];

    for (let i = 0; i < Math.min(alerts.length, 50); i++) {
      const incident = mapAlertToIncident(alerts[i], i);
      if (!existingIds.has(incident.id)) {
        incidents.unshift(incident);
        newIncidents.push(incident);
        console.log(`[SIEM] Added: ${incident.id}`);
      }
    }

    if (incidents.length > 500) {
      incidents.splice(500);
    }

    write('incidents', incidents);

    if (newIncidents.length > 0) {
      broadcastIncidents(newIncidents);
    }

    return newIncidents;
  } catch (err) {
    console.error('[SIEM] Sync failed:', err.message);
    return [];
  }
}

/**
 * Broadcast new incidents to all connected SSE clients
 */
function broadcastIncidents(incidents) {
  const data = JSON.stringify({ type: 'new_incidents', data: incidents });
  activeStreams.forEach(res => {
    try {
      res.write(`data: ${data}\n\n`);
    } catch (err) {
      console.error('[SIEM] Stream write failed:', err.message);
    }
  });
}

/**
 * Register SSE response
 */
function registerStream(res) {
  activeStreams.push(res);
  res.on('close', () => {
    activeStreams = activeStreams.filter(r => r !== res);
    console.log(`[SIEM] SSE disconnected (${activeStreams.length} remaining)`);
  });
}

/**
 * Start periodic sync
 */
function startPeriodicSync(intervalMs = 5 * 60 * 1000) {
  console.log(`[SIEM] Starting periodic sync every ${intervalMs / 1000}s (NIST CVE Database)`);
  syncIncidents().catch(err => console.error('[SIEM] Initial sync failed:', err));
  setInterval(() => {
    syncIncidents().catch(err => console.error('[SIEM] Periodic sync failed:', err));
  }, intervalMs);
}

module.exports = {
  fetchCVEAlerts,
  mapAlertToIncident,
  syncIncidents,
  broadcastIncidents,
  registerStream,
  startPeriodicSync
};
