/**
 * SIEM Sync Service
 * Fetches real vulnerabilities from NIST NVD CVE API (free, no auth)
 * Maps CVEs to incident format and stores locally
 * Streams new incidents via SSE
 */

const https = require('https');
const { read, write } = require('../store');

const NIST_API_BASE = 'https://services.nvd.nist.gov/rest/json/cves/1.0';
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
          reject(new Error(`Failed to parse response from ${url}: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Fetch recent CVEs from NIST National Vulnerability Database
 * No authentication required - completely free
 */
async function fetchNISTCVEs() {
  try {
    console.log('[SIEM] Fetching from NIST NVD CVE API...');
    // Get random CVEs from recent releases (no auth needed)
    const startIndex = Math.floor(Math.random() * 10000);
    const url = `${NIST_API_BASE}?startIndex=${startIndex}&resultsPerPage=50`;
    const response = await httpGet(url);
    const cves = response.result?.CVE_Items || [];
    console.log(`[SIEM] Fetched ${cves.length} CVEs from NIST NVD`);
    return cves;
  } catch (err) {
    console.error('[SIEM] Failed to fetch NIST CVEs:', err.message);
    return [];
  }
}

/**
 * Map NIST CVE to incident format
 */
function mapCVEToIncident(cveItem) {
  const cveId = cveItem.cve.CVE_data_meta.ID;
  const desc = cveItem.cve.description?.description_data?.[0]?.value || 'Security vulnerability detected';
  
  // Determine severity from CVSS score
  let severity = 'medium';
  const cvss = cveItem.impact?.baseMetricV3?.cvssV3?.baseSeverity ||
               cveItem.impact?.baseMetricV2?.severity;
  
  if (cvss === 'CRITICAL') severity = 'critical';
  else if (cvss === 'HIGH') severity = 'high';
  else if (cvss === 'MEDIUM') severity = 'medium';
  else if (cvss === 'LOW') severity = 'low';

  return {
    id: `cve-${cveId}`,
    title: `Vulnerability: ${cveId}`,
    description: desc.substring(0, 250),
    type: 'malware',
    severity,
    status: 'open',
    is_major: severity === 'critical',
    reported_by: 'SYSTEM',
    assigned_to: null,
    station_id: 'SIEM',
    entities: {},
    source: 'NIST NVD',
    source_url: `https://nvd.nist.gov/vuln/detail/${cveId}`,
    created_at: new Date(cveItem.publishedDate).toISOString(),
    updated_at: new Date(cveItem.lastModifiedDate).toISOString(),
    metadata: {
      cve_id: cveId,
      cvss_score: cveItem.impact?.baseMetricV3?.cvssV3?.baseScore,
      cvss_severity: cvss
    }
  };
}


/**
 * Sync incidents from external SIEM
 * Fetches new CVEs and updates local incidents.json
 * Broadcasts new incidents to connected SSE streams
 */
async function syncIncidents() {
  try {
    const cves = await fetchNISTCVEs();
    if (cves.length === 0) {
      console.log('[SIEM] No CVEs to sync');
      return [];
    }

    const incidents = read('incidents');
    const existingIds = new Set(incidents.map(i => i.id));
    const newIncidents = [];

    for (const cveItem of cves) {
      const incident = mapCVEToIncident(cveItem);
      if (!existingIds.has(incident.id)) {
        incidents.unshift(incident); // Add to front
        newIncidents.push(incident);
        console.log(`[SIEM] Added new incident: ${incident.id}`);
      }
    }

    // Keep only last 500 incidents (prevent unbounded growth)
    if (incidents.length > 500) {
      incidents.splice(500);
    }

    write('incidents', incidents);

    // Broadcast new incidents to all connected SSE clients
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
      console.error('[SIEM] Failed to write to stream:', err.message);
    }
  });
}

/**
 * Register an SSE response for broadcasting
 */
function registerStream(res) {
  activeStreams.push(res);
  res.on('close', () => {
    activeStreams = activeStreams.filter(r => r !== res);
    console.log(`[SIEM] SSE client disconnected (${activeStreams.length} remaining)`);
  });
}

/**
 * Start periodic sync (every 5 minutes)
 */
function startPeriodicSync(intervalMs = 5 * 60 * 1000) {
  console.log(`[SIEM] Starting periodic sync every ${intervalMs / 1000}s`);
  
  // Run immediately
  syncIncidents().catch(err => console.error('[SIEM] Initial sync failed:', err));
  
  // Then run on interval
  setInterval(() => {
    syncIncidents().catch(err => console.error('[SIEM] Periodic sync failed:', err));
  }, intervalMs);
}

module.exports = {
  fetchNISTCVEs,
  mapCVEToIncident,
  syncIncidents,
  broadcastIncidents,
  registerStream,
  startPeriodicSync
};
