const express = require('express');
const { read } = require('../store');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const gameTheory = require('../logic/game-theory');
const socioTechnical = require('../logic/socio-technical');
const email = require('../logic/email');
const router = express.Router();

const SLA_HOURS = { critical:2, high:4, medium:8, low:24 };

const CSF_MAPPING = {
  phishing: 'DE',
  ransomware: 'RS',
  unauthorized_access: 'PR',
  ddos: 'DE',
  malware: 'PR',
  powershell: 'DE',
  data_exfiltration: 'PR',
  insider_threat: 'PR',
  misconfiguration: 'PR',
  suspicious_activity: 'DE',
  credential_theft: 'PR',
};

const CSF_LABELS = {
  ID: 'Identify',
  PR: 'Protect',
  DE: 'Detect',
  RS: 'Respond',
  RC: 'Recover'
};

function predictAttackerMove(incident) {
  if (!incident) return null;
  if (incident.type?.includes('powershell') || incident.description?.toLowerCase().includes('powershell')) {
    return 'The attacker is likely seeking persistence and credential access via PowerShell abuse.';
  }
  if (incident.type === 'unauthorized_access' || incident.title?.toLowerCase().includes('hr database')) {
    return 'The attacker is likely moving to data exfiltration or privilege escalation from the HR database.';
  }
  if (incident.type === 'ransomware') {
    return 'The attacker is likely attempting lateral movement and file encryption on shared assets.';
  }
  return 'The next attacker move is likely reconnaissance or privilege escalation based on current behavior.';
}

function computeCsfFunctionCounts(incidents) {
  const counts = { ID:0, PR:0, DE:0, RS:0, RC:0 };
  incidents.forEach(inc => {
    const key = CSF_MAPPING[inc.type] || 'DE';
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}

function computeCsfMaturityScore(summary, metrics) {
  const score = Math.round(
    (summary.avg_confidence * 100) * 0.35 +
    (100 - metrics.sla_breach_rate) * 0.25 +
    summary.pir_completion_rate * 0.25 +
    (summary.active_knowledge ? Math.min(100, summary.active_knowledge * 4) : 0) * 0.15
  );
  const tier = score >= 80 ? 4 : score >= 65 ? 3 : score >= 50 ? 2 : 1;
  return { score: Math.min(score,100), tier, label: `Tier ${tier}` };
}

function computePrAcCompliance(incidents) {
  const protectedCounts = incidents.filter(i => ['unauthorized_access','credential_theft','data_exfiltration','insider_threat'].includes(i.type)).length;
  const covered = incidents.filter(i => i.related_knowledge?.length > 0 || i.socio_technical?.root_cause_type === 'technical').length;
  const compliance = incidents.length ? Math.round((covered / incidents.length) * 100) : 0;
  return { compliance, protectedCounts };
}

function getKeyIncident(incidents) {
  return incidents.find(i => i.type === 'unauthorized_access' || i.title?.toLowerCase().includes('hr database')) || incidents[0] || null;
}


function slaDeadline(inc) {
  return inc.sla_deadline || new Date(new Date(inc.created_at).getTime() + (SLA_HOURS[inc.severity]||8)*3600000).toISOString();
}

function computeGaps(incidents, knowledge) {
  const active = knowledge.filter(k=>k.status==='active');
  const types  = [...new Set(incidents.map(i=>i.type).filter(Boolean))];
  return types.map(type => {
    const typeInc = incidents.filter(i=>i.type===type);
    const covered = active.some(k=>k.tags.some(t=>type.toLowerCase().includes(t.toLowerCase())||t.toLowerCase().includes(type.toLowerCase()))||(k.incident_id&&typeInc.some(i=>i.id===k.incident_id)));
    return { type, incident_count:typeInc.length, covered, latest_incident:typeInc.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))[0]?.created_at||null };
  }).sort((a,b)=>b.incident_count-a.incident_count);
}

function coverageRate(gaps) {
  return gaps.length?Math.round((gaps.filter(g=>g.covered).length/gaps.length)*100):0;
}

function computeMetrics(incidents, knowledge=[]) {
  const resolved = incidents.filter(i=>['resolved','closed'].includes(i.status));
  const now = new Date();
  // SLA breach rate
  const active = incidents.filter(i=>!['resolved','closed'].includes(i.status));
  const breached = active.filter(i=>now>new Date(slaDeadline(i))).length;
  const sla_breach_rate = active.length?Math.round((breached/active.length)*100):0;

  const durationMinutes = (inc) => Math.round((new Date(inc.updated_at) - new Date(inc.created_at)) / 60000);
  const resolvedWithDuration = resolved.filter(i=>i.created_at && i.updated_at);
  const allDurations = resolvedWithDuration.map(durationMinutes);
  const avg_time_to_resolve_min = allDurations.length?
    Math.round(allDurations.reduce((sum, m) => sum + m, 0) / allDurations.length):null;

  const guided = resolvedWithDuration.filter(i => (i.applied_defensive_routines?.length || 0) > 0 || (i.used_knowledge_ids?.length || 0) > 0);
  const manual = resolvedWithDuration.filter(i => !((i.applied_defensive_routines?.length || 0) > 0 || (i.used_knowledge_ids?.length || 0) > 0));
  const avg_mttr_playbook_min = guided.length ? Math.round(guided.map(durationMinutes).reduce((sum, m) => sum + m, 0) / guided.length) : null;
  const avg_mttr_manual_min = manual.length ? Math.round(manual.map(durationMinutes).reduce((sum, m) => sum + m, 0) / manual.length) : null;
  const resolution_speed_gain = (avg_mttr_playbook_min && avg_mttr_manual_min && avg_mttr_manual_min > 0)
    ? Math.round(((avg_mttr_manual_min - avg_mttr_playbook_min) / avg_mttr_manual_min) * 1000) / 10
    : 0;

  const sixHoursMs = 6 * 60 * 60 * 1000;
  const sla_nearing_count = active.filter(i => {
    const deadline = new Date(slaDeadline(i));
    return deadline > now && (deadline - now) <= sixHoursMs;
  }).length;

  const threatWeight = { critical: 3, high: 2, medium: 1, low: 0.5 };
  const totalThreat = active.reduce((sum, i) => sum + (threatWeight[i.severity] || 0), 0);
  const maxThreat = active.length * 3;
  const active_threat_index = maxThreat ? Math.round((totalThreat / maxThreat) * 100) / 10 : 0;

  const growthWindow = 30 * 24 * 60 * 60 * 1000;
  const knowledge_growth_velocity = knowledge.filter(k => k.knowledge_type === 'playbook' && new Date(k.created_at) >= new Date(now - growthWindow)).length;

  // avg time to detect cannot be computed without raw alert arrival time metadata
  const avg_time_to_detect_min = null;

  const ttrBySeverity = {};
  ['critical','high','medium','low'].forEach(sev => {
    const inc = resolved.filter(i=>i.severity===sev&&i.created_at&&i.updated_at);
    if (inc.length) {
      const times = inc.map(i=>(new Date(i.updated_at)-new Date(i.created_at))/60000).sort((a,b)=>a-b);
      const p50 = times[Math.floor(times.length*0.5)];
      const p90 = times[Math.floor(times.length*0.9)];
      ttrBySeverity[sev] = { count:inc.length, p50_min:Math.round(p50), p90_min:Math.round(p90) };
    }
  });

  // recurrence: incidents of same type within 90 days of a previous one
  const typeMap = {};
  incidents.forEach(i=>{ if (!typeMap[i.type]) typeMap[i.type]=[]; typeMap[i.type].push(new Date(i.created_at)); });
  let recurrences=0;
  Object.values(typeMap).forEach(dates => { dates.sort((a,b)=>a-b); for (let j=1;j<dates.length;j++) { if ((dates[j]-dates[j-1])<90*24*3600000) { recurrences++; break; } } });

  return {
    sla_breach_rate,
    ttr_by_severity:ttrBySeverity,
    recurrence_count:recurrences,
    avg_time_to_resolve_min,
    avg_time_to_detect_min,
    avg_mttr_playbook_min,
    avg_mttr_manual_min,
    resolution_speed_gain,
    sla_nearing_count,
    active_threat_index,
    knowledge_growth_velocity
  };
}

router.get('/dashboard', authenticate, (req,res) => {
  const incidents=read('incidents'), knowledge=read('knowledge'),
        users=read('users'), logs=read('audit_logs'), pirs=read('pirs');
  const active=knowledge.filter(k=>k.status==='active');
  const byStatus={},bySeverity={},byType={};
  incidents.forEach(i=>{ byStatus[i.status]=(byStatus[i.status]||0)+1; bySeverity[i.severity]=(bySeverity[i.severity]||0)+1; byType[i.type]=(byType[i.type]||0)+1; });
  const avgConf=active.length?parseFloat((active.reduce((s,k)=>s+k.confidence_score,0)/active.length).toFixed(2)):0;
  const gaps=computeGaps(incidents,knowledge);
  const metrics=computeMetrics(incidents,knowledge);
  const pir_completion_rate=incidents.filter(i=>i.status==='closed').length?
    Math.round((pirs.length/incidents.filter(i=>i.status==='closed').length)*100):0;
  const csf_function_counts = computeCsfFunctionCounts(incidents);
  const csf_maturity = computeCsfMaturityScore({ avg_confidence: avgConf, active_knowledge: active.length, pir_completion_rate }, metrics);
  const pr_ac = computePrAcCompliance(incidents);
  const keyIncident = getKeyIncident(incidents);
  const attacker_prediction = predictAttackerMove(keyIncident);
  const payoffMatrix = keyIncident ? gameTheory.calculatePayoffMatrix(keyIncident) : null;
  const nashDecision = payoffMatrix ? gameTheory.calculateNashEquilibrium(payoffMatrix, keyIncident) : null;
  const enrich=(arr,fld)=>arr.map(i=>{const r=users.find(u=>u.id===i[fld]);return{...i,reporter_name:r?r.name:'Unknown'};});
  res.json({
    summary:{ total_incidents:incidents.length, open_incidents:incidents.filter(i=>['open','investigating','escalated'].includes(i.status)).length,
      resolved_incidents:incidents.filter(i=>i.status==='resolved').length, total_knowledge:knowledge.length,
      active_knowledge:active.length, avg_confidence:avgConf, total_users:users.length,
      total_audit_events:logs.length, major_incidents:incidents.filter(i=>i.is_major).length,
      pir_count:pirs.length, pir_completion_rate,
      csf_maturity_score:csf_maturity, pr_ac_compliance:pr_ac.compliance,
      attacker_prediction, recommended_countermeasure: nashDecision ? nashDecision.recommendedAction : null,
      recommended_reasoning: nashDecision ? nashDecision.reasoning : null,
      recommended_scores: nashDecision ? { isolate: nashDecision.isolateScore, monitor: nashDecision.monitorScore, confidence: nashDecision.confidence } : null
    },
    by_status:byStatus, by_severity:bySeverity, by_type:byType,
    csf_function_counts, coverage_rate:coverageRate(gaps), gaps, uncovered_gaps:gaps.filter(g=>!g.covered),
    weak_entries:active.filter(k=>k.confidence_score<0.6).sort((a,b)=>a.confidence_score-b.confidence_score).slice(0,8).map(k=>{const c=users.find(u=>u.id===k.contributor_id);return{...k,contributor_name:c?c.name:'Unknown'};}),
    escalated_incidents:enrich(incidents.filter(i=>i.status==='escalated').sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,5),'reported_by'),
    major_incidents:enrich(incidents.filter(i=>i.is_major&&!['resolved','closed'].includes(i.status)).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,5),'reported_by'),
    sla_breached:incidents.filter(i=>!['resolved','closed'].includes(i.status)&&new Date()>new Date(slaDeadline(i))).map(i=>{const r=users.find(u=>u.id===i.reported_by);return{...i,reporter_name:r?r.name:'Unknown'};}),
    recent_incidents:enrich([...incidents].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,6),'reported_by'),
    top_knowledge:[...active].sort((a,b)=>b.confidence_score-a.confidence_score).slice(0,5).map(k=>{const c=users.find(u=>u.id===k.contributor_id);return{...k,contributor_name:c?c.name:'Unknown'};}),
    recent_activity:logs.slice(0,6).map(l=>{const u=users.find(u=>u.id===l.user_id);return{...l,user_name:u?u.name:'Unknown'};}),
    metrics
  });
});

router.post('/schedule-email', authenticate, requireRole('super_admin'), async (req,res) => {
  const viewers = read('users').filter(u => u.role === 'viewer' && u.email);
  if (viewers.length === 0) {
    return res.status(404).json({ error: 'No viewer recipients configured.' });
  }

  const metrics = gameTheory.calculateResilienceMetrics();
  const stsReport = socioTechnical.generateResiliencyReport();
  const reportData = { metrics, stsReport };

  try {
    const pdfBuffer = await email.createResilienceReportPdf(reportData);
    const html = email.buildResilienceReportHtml(reportData);

    await Promise.all(viewers.map(user => email.sendSystemEmail({
      to: user.email,
      subject: 'KALRO Resilience Report',
      html,
      station_id: user.station_id || 'HQ',
      attachments: [
        {
          filename: 'KALRO-Resilience-Report.pdf',
          content: pdfBuffer
        }
      ]
    })));

    res.json({ success: true, delivered: viewers.length });
  } catch (err) {
    console.error('Failed to send scheduled resilience report', err);
    res.status(500).json({ error: 'Failed to send scheduled resilience report' });
  }
});

router.get('/download', authenticate, requireRole('super_admin'), async (req, res) => {
  try {
    const metrics = gameTheory.calculateResilienceMetrics();
    const stsReport = socioTechnical.generateResiliencyReport();
    const reportData = { metrics, stsReport };
    const pdfBuffer = await email.createResilienceReportPdf(reportData);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="KALRO-Resilience-Report.pdf"');
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('[Reports] Failed to generate PDF download', err);
    res.status(500).json({ error: 'Failed to generate report PDF' });
  }
});

router.get('/summary', authenticate, requireRole('super_admin'), (req,res) => {
  const incidents=read('incidents'),knowledge=read('knowledge'),users=read('users'),logs=read('audit_logs');
  const active=knowledge.filter(k=>k.status==='active');
  const avgConf=active.length?(active.reduce((s,k)=>s+k.confidence_score,0)/active.length).toFixed(2):0;
  res.json({ total_incidents:incidents.length, open_incidents:incidents.filter(i=>['open','investigating','escalated'].includes(i.status)).length,
    resolved_incidents:incidents.filter(i=>i.status==='resolved').length, total_knowledge:knowledge.length,
    active_knowledge:active.length, avg_confidence:parseFloat(avgConf), total_users:users.length, total_audit_events:logs.length });
});

router.get('/audit', authenticate, requireRole('super_admin'), (req,res) => {
  const users=read('users');
  res.json(read('audit_logs').map(l=>{const u=users.find(u=>u.id===l.user_id);return{...l,user_name:u?u.name:'Unknown',user_role:u?u.role:null};}));
});

router.get('/gaps', authenticate, (req,res) => {
  const gaps=computeGaps(read('incidents'),read('knowledge'));
  res.json({ coverage_rate:coverageRate(gaps), gaps });
});

module.exports = router;
