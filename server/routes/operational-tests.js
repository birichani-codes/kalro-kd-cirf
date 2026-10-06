const express = require('express');
const { randomUUID } = require('crypto');
const { read, write } = require('../store');
const { authenticate } = require('../middleware/auth');
const { requireMinRole } = require('../middleware/rbac');
const { recordEvent, getEventsForTest } = require('../services/incidentEvents');
const { calculateTestKPIs, aggregateKPIs } = require('../services/kpiService');
const { createOperationalTestReportPdf } = require('../services/operationalReportPdf');
const { logAction } = require('./audit');
const router = express.Router();

const nowIso = () => new Date().toISOString();
const cleanArray = value => Array.isArray(value) ? value.map(v => String(v).trim()).filter(Boolean) : [];
const confidenceScore = level => ({ low:0.6, medium:0.75, high:0.9 }[level] || 0.75);

const validMeetUrl = value => {
  if (!value) return true;
  try {
    const u = new URL(String(value));
    return u.protocol === 'https:' && (u.hostname === 'meet.google.com' || u.hostname.endsWith('.meet.google.com'));
  } catch (_) { return false; }
};

function resolveTeamMembers(ids=[]) {
  const users = read('users');
  const wanted = new Set(cleanArray(ids));
  return users.filter(u => wanted.has(u.id)).map(({password, ...u}) => u);
}

function notifyTeamMembers({ members=[], title, message, incidentId, stationId, type='collaboration', createdBy='SYSTEM', actionUrl=null }) {
  if (!members.length) return;
  const notifications = read('notifications');
  const at = nowIso();
  members.forEach(member => notifications.push({
    id:'ntf'+randomUUID().slice(0,10), title, message, type,
    recipient_id:member.id, recipient_station_id:member.station_id || stationId || null,
    severity:type==='escalation'?'high':'info', related_incident_id:incidentId || null,
    action_url:actionUrl || (incidentId?`/incidents/${incidentId}`:'/operational-testing'), read:false, created_at:at, created_by:createdBy
  }));
  write('notifications', notifications);
}

function uniqueStrings(values=[]) {
  const out=[]; const seen=new Set();
  for (const value of values || []) { const v=String(value||'').trim(); if (v && !seen.has(v)) { seen.add(v); out.push(v); } }
  return out;
}

function selectedKnowledgeIds(test) {
  const ids = uniqueStrings(test?.selected_knowledge_ids || []);
  if (ids.length) return ids;
  return test?.selected_knowledge_id ? [test.selected_knowledge_id] : [];
}

function mergeKnowledgePlans(entries=[]) {
  const merged={ containment_actions:[], recovery_actions:[], success_criteria:[], escalation_conditions:[], verification_checks:[], sources:{containment:{},recovery:{}} };
  for (const entry of entries) {
    const plan=responsePlanFromKnowledge(entry);
    for (const action of plan.containment_actions || []) {
      if (!merged.containment_actions.includes(action)) merged.containment_actions.push(action);
      merged.sources.containment[action]=uniqueStrings([...(merged.sources.containment[action]||[]),entry.id]);
    }
    for (const action of plan.recovery_actions || []) {
      if (!merged.recovery_actions.includes(action)) merged.recovery_actions.push(action);
      merged.sources.recovery[action]=uniqueStrings([...(merged.sources.recovery[action]||[]),entry.id]);
    }
    for (const key of ['success_criteria','escalation_conditions','verification_checks']) merged[key]=uniqueStrings([...(merged[key]||[]),...(plan[key]||[])]);
  }
  return merged;
}

function responsePlanFromKnowledge(entry) {
  if (!entry) return { containment_actions:[], recovery_actions:[], success_criteria:[], escalation_conditions:[] };
  const structured = entry.structured_response || entry.defensive_routine?.structured_response || {};
  const numbered = String(entry.content||'').split(/\r?\n/).map(x=>x.trim()).filter(x=>/^\d+[.)]\s+/.test(x)).map(x=>x.replace(/^\d+[.)]\s+/,''));
  return {
    containment_actions: cleanArray(structured.containment_actions).length ? cleanArray(structured.containment_actions) : numbered.slice(0, Math.min(5, numbered.length)),
    recovery_actions: cleanArray(structured.recovery_actions).length ? cleanArray(structured.recovery_actions) : numbered.slice(5),
    success_criteria: cleanArray(structured.success_criteria),
    escalation_conditions: cleanArray(structured.escalation_conditions),
    verification_checks: cleanArray(structured.verification_checks)
  };
}

function alertContext(test) {
  const scenario = test?.scenario_id ? scenarioById(test.scenario_id) : test?.scenario_snapshot;
  const alert = scenario?.alert || null;
  if (!alert) return null;
  return { ...alert, alert_id:`ALT-${String(test.id||'TEST').toUpperCase()}`, phishing_email:scenario?.phishing_email || null, affected_user:scenario?.affected_user || null };
}
const SCENARIO_FILE = 'operational_scenarios';
const validSeverity = value => ['low','medium','high','critical'].includes(String(value||'').toLowerCase());

function scenarioById(id) {
  return read(SCENARIO_FILE).find(s => s.id === id) || null;
}

function allowedTestsForUser(user, completedOnly=false) {
  let tests = read('operational_tests');
  if (completedOnly) tests = tests.filter(t => t.status === 'completed');
  if (user.role !== 'super_admin') tests = tests.filter(t => t.station_id === user.station_id || t.participant_id === user.id || t.created_by === user.id);
  return tests;
}

function dataQuality(test, kpis) {
  const checks = [
    ['Incident injected', Boolean(kpis?.milestones?.incidentOccurred)],
    ['Incident linked/detected', Boolean(test.incident_id && kpis?.milestones?.detected)],
    ['Structured classification', Boolean(test.classification?.category && kpis?.milestones?.classified)],
    ['Containment evidence', Boolean(test.containment?.outcome === 'successful' && String(test.containment?.evidence||'').trim())],
    ['Recovery evidence', Boolean(test.recovery?.outcome === 'successful' && String(test.recovery?.evidence||'').trim())],
    ['Lesson captured', Boolean((test.captured_knowledge_ids||[]).length)]
  ];
  const passed = checks.filter(([,ok])=>ok).length;
  return { passed, total:checks.length, completion_percent:Number((passed/checks.length*100).toFixed(1)), checks:checks.map(([label,ok])=>({label,ok})) };
}

function getTest(id) {
  return read('operational_tests').find(t => t.id === id) || null;
}

function linkedIncident(test) {
  if (!test?.incident_id) return null;
  return read('incidents').find(i => i.id === test.incident_id) || null;
}

function saveTestMutation(id, mutate) {
  const tests = read('operational_tests');
  const idx = tests.findIndex(t => t.id === id);
  if (idx < 0) return null;
  mutate(tests[idx]);
  tests[idx].updated_at = nowIso();
  write('operational_tests', tests);
  return tests[idx];
}

router.get('/', authenticate, (req,res) => {
  let tests = read('operational_tests');
  if (req.user.role !== 'super_admin') tests = tests.filter(t => t.station_id === req.user.station_id || t.participant_id === req.user.id || t.created_by === req.user.id);
  const enriched = tests.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).map(t => ({ ...t, kpis: calculateTestKPIs(t.id) }));
  res.json(enriched);
});

router.get('/summary', authenticate, (req,res) => {
  let tests = read('operational_tests').filter(t => t.status === 'completed');
  if (req.user.role !== 'super_admin') tests = tests.filter(t => t.station_id === req.user.station_id || t.participant_id === req.user.id || t.created_by === req.user.id);
  res.json(aggregateKPIs(tests));
});

router.get('/scenarios/library', authenticate, (req,res) => {
  res.json(read(SCENARIO_FILE));
});

router.get('/analytics/trends', authenticate, (req,res) => {
  const tests = allowedTestsForUser(req.user, true).sort((a,b)=>new Date(a.completed_at||a.updated_at)-new Date(b.completed_at||b.updated_at));
  const rows = tests.map(t => {
    const k = calculateTestKPIs(t.id) || {};
    return {
      id:t.id, scenario_id:t.scenario_id||null, scenario_name:t.scenario_name, test_mode:t.test_mode||'kd_cirf',
      participant_label:t.participant_label, participant_role:t.participant_role, station_id:t.station_id, completed_at:t.completed_at,
      mttd_minutes:k.mttd_minutes, mtta_minutes:k.mtta_minutes, classification_minutes:k.classification_minutes,
      mttc_minutes:k.mttc_minutes, mttr_minutes:k.mttr_minutes, knowledge_retrieval_minutes:k.knowledge_retrieval_minutes,
      knowledge_utilization_rate:k.knowledge_utilization_rate, knowledge_reuse_success_rate:k.knowledge_reuse_success_rate,
      facilitator_interventions:k.facilitator_interventions, critical_omissions:k.critical_omissions
    };
  });
  res.json({ rows, aggregate:aggregateKPIs(tests) });
});

router.get('/comparison', authenticate, (req,res) => {
  const tests = allowedTestsForUser(req.user, true);
  const group = req.query.group ? String(req.query.group) : null;
  const scoped = group ? tests.filter(t => (t.comparison_group||t.scenario_id||t.scenario_name) === group) : tests;
  const baselineTests = scoped.filter(t => (t.test_mode||'kd_cirf') === 'baseline');
  const kdTests = scoped.filter(t => (t.test_mode||'kd_cirf') === 'kd_cirf');
  const baseline = aggregateKPIs(baselineTests);
  const kd_cirf = aggregateKPIs(kdTests);
  const lowerBetter = ['mttd_minutes','mtta_minutes','classification_minutes','mttc_minutes','mttr_minutes','knowledge_retrieval_minutes','facilitator_interventions','critical_omissions'];
  const higherBetter = ['knowledge_utilization_rate','recommendation_acceptance_rate','knowledge_reuse_success_rate'];
  const differences = {};
  [...lowerBetter,...higherBetter].forEach(key => {
    const b = baseline.summary?.[key]?.mean;
    const k = kd_cirf.summary?.[key]?.mean;
    if (typeof b !== 'number' || typeof k !== 'number') return differences[key] = { baseline:b??null, kd_cirf:k??null, change:null };
    let change = null;
    if (b !== 0) change = Number((((lowerBetter.includes(key) ? b-k : k-b) / Math.abs(b))*100).toFixed(1));
    differences[key] = { baseline:b, kd_cirf:k, change };
  });
  res.json({ group, baseline, kd_cirf, differences });
});

router.post('/', authenticate, requireMinRole('analyst'), (req,res) => {
  const { scenario_name, scenario_type, scenario_id, test_mode, comparison_group, participant_id, participant_label, participant_role, station_id, notes } = req.body;
  if (!scenario_name) return res.status(400).json({ error:'scenario_name is required' });
  const availableStations = read('stations').filter(s=>s.active!==false).map(s=>s.name);
  const selectedStation = station_id || req.user.station_id || 'Headquarters';
  if (!availableStations.includes(selectedStation)) return res.status(400).json({ error:'Select a valid KALRO station' });
  const now = nowIso();
  const test = {
    id: 'tt' + randomUUID().slice(0,8),
    scenario_name,
    scenario_type: scenario_type || 'tabletop',
    scenario_id: scenario_id || null,
    test_mode: test_mode === 'baseline' ? 'baseline' : 'kd_cirf',
    comparison_group: comparison_group || scenario_id || scenario_name,
    scenario_snapshot: scenario_id ? scenarioById(scenario_id) : null,
    participant_id: participant_id || req.user.id,
    participant_label: participant_label || req.user.name || req.user.id,
    participant_role: participant_role || req.user.role,
    station_id: selectedStation,
    status: 'draft',
    incident_id: null,
    notes: notes || '',
    observer_scores: {},
    escalation: null,
    collaborations: [],
    classification: {},
    selected_knowledge_id: null,
    selected_knowledge_ids: [],
    knowledge_selection: null,
    knowledge_selections: [],
    knowledge_selection_confirmed_at: null,
    knowledge_selection_confirmed_by: null,
    combined_response_plan: null,
    knowledge_application: null,
    knowledge_applications: [],
    knowledge_search_result: null,
    pir_id: null,
    containment: { status:'not_started', planned_actions:[], completed_actions:[], action_records:[], verification_checks:[], notes:'', evidence:'', started_at:null, confirmed_at:null, outcome:null },
    recovery: { status:'not_started', actions:[], action_records:[], notes:'', evidence:'', confirmed_at:null, outcome:null },
    captured_knowledge_ids: [],
    created_by: req.user.id,
    created_at: now,
    updated_at: now,
    started_at: null,
    completed_at: null
  };
  const tests = read('operational_tests'); tests.push(test); write('operational_tests', tests);
  res.status(201).json(test);
});

router.get('/:id/export.csv', authenticate, (req,res) => {
  const test = getTest(req.params.id);
  if (!test) return res.status(404).json({ error:'Operational test not found' });
  const k = calculateTestKPIs(test.id) || {};
  const containment = test.containment || {};
  const recovery = test.recovery || {};
  const rows = [
    ['Test ID', test.id], ['Scenario', test.scenario_name], ['Scenario ID', test.scenario_id], ['Test Mode', test.test_mode||'kd_cirf'], ['Comparison Group', test.comparison_group], ['Participant', test.participant_label],
    ['Role', test.participant_role], ['Station', test.station_id], ['Status', test.status],
    ['Classification Category', test.classification?.category], ['Classification Severity', test.classification?.severity], ['Classification Confidence', test.classification?.confidence], ['Classification Impact', test.classification?.impact],
    ['MTTD (minutes)', k.mttd_minutes], ['MTTA (minutes)', k.mtta_minutes], ['Classification Time (minutes)', k.classification_minutes], ['MTTC (minutes)', k.mttc_minutes],
    ['MTTR (minutes)', k.mttr_minutes], ['Knowledge Retrieval (minutes)', k.knowledge_retrieval_minutes], ['Knowledge Search Duration (minutes)', k.knowledge_search_minutes], ['Knowledge Selection Duration (minutes)', k.knowledge_selection_minutes],
    ['Selected Knowledge IDs', selectedKnowledgeIds(test).join(' | ')], ['Selected Knowledge Titles', (test.knowledge_selections||[]).map(x=>x.title).join(' | ')], ['Knowledge Set Confirmed At', test.knowledge_selection_confirmed_at], ['Knowledge Application Outcome', test.knowledge_application?.outcome],
    ['Escalation (minutes)', k.escalation_minutes], ['Collaboration (minutes)', k.collaboration_minutes], ['Collaborations', (test.collaborations||[]).length],
    ['Latest Collaboration Team', (test.collaborations||[]).slice(-1)[0]?.team_members?.map(m=>m.name).join(' | ')], ['Latest Collaboration Meet', (test.collaborations||[]).slice(-1)[0]?.meeting_url],
    ['Escalated To', test.escalation?.escalated_to], ['Escalation Team', test.escalation?.team_members?.map(m=>m.name).join(' | ')], ['Escalation Meet', test.escalation?.meeting_url],
    ['Containment Outcome', containment.outcome], ['Containment Planned Actions', (containment.planned_actions||[]).join(' | ')],
    ['Containment Completed Actions', (containment.completed_actions||[]).join(' | ')], ['Containment Evidence', containment.evidence],
    ['Recovery Outcome', recovery.outcome], ['Recovery Actions', (recovery.actions||[]).join(' | ')], ['Recovery Evidence', recovery.evidence],
    ['Knowledge Accessed', k.knowledge_accessed], ['Knowledge Items Accessed', k.knowledge_items_accessed],
    ['Knowledge Applied', k.knowledge_used], ['Knowledge Items Applied', k.knowledge_items_used],
    ['Knowledge Utilization Rate (%)', k.knowledge_utilization_rate],
    ['Successful Knowledge Reuses', k.successful_knowledge_reuses],
    ['Recommendation Acceptance Rate (%)', k.recommendation_acceptance_rate],
    ['Knowledge Reuse Success Rate (%)', k.knowledge_reuse_success_rate],
    ['Captured Knowledge Entries', (test.captured_knowledge_ids||[]).length],
    ['Decision Accuracy (%)', k.decision_accuracy], ['Classification Accuracy (%)', k.classification_accuracy],
    ['Escalation Accuracy (%)', k.escalation_accuracy], ['Collaboration Score (%)', k.collaboration_score],
    ['Role Adherence (%)', k.role_adherence], ['Assistance Prompts', k.facilitator_interventions],
    ['Critical Omissions', k.critical_omissions], ['Data Quality (%)', dataQuality(test,k).completion_percent]
  ];
  const esc = v => `"${String(v ?? '').replace(/"/g,'""')}"`;
  const events = getEventsForTest(test.id);
  let csv = 'Metric,Value\n' + rows.map(r=>r.map(esc).join(',')).join('\n');
  csv += '\n\nEvent Time,Event Type,Source,Actor,Details\n' + events.map(e=>[e.timestamp,e.event_type,e.source,e.actor_id,JSON.stringify(e.details||{})].map(esc).join(',')).join('\n');
  res.setHeader('Content-Type','text/csv; charset=utf-8');
  res.setHeader('Content-Disposition',`attachment; filename="${test.id}-operational-test.csv"`);
  res.send(csv);
});

router.get('/:id/report.pdf', authenticate, async (req,res) => {
  try {
    const test = getTest(req.params.id);
    if (!test) return res.status(404).json({ error:'Operational test not found' });
    const incident = linkedIncident(test);
    const kpis = calculateTestKPIs(test.id) || {};
    const selectedIds = selectedKnowledgeIds(test);
    const selectedKnowledge = read('knowledge').filter(k=>selectedIds.includes(k.id));
    const capturedKnowledge = read('knowledge').filter(k=>(test.captured_knowledge_ids||[]).includes(k.id));
    const events = getEventsForTest(test.id);
    const pdf = await createOperationalTestReportPdf({ test, incident, kpis, selectedKnowledge, capturedKnowledge, events });
    res.setHeader('Content-Type','application/pdf');
    res.setHeader('Content-Disposition',`attachment; filename="${test.id}-operational-test-report.pdf"`);
    res.setHeader('Content-Length',pdf.length);
    res.send(pdf);
  } catch (err) {
    console.error('[Operational Testing] PDF report generation failed', err);
    res.status(500).json({ error:'Failed to generate operational test PDF report' });
  }
});

router.get('/:id', authenticate, (req,res) => {
  const test = getTest(req.params.id);
  if (!test) return res.status(404).json({ error:'Operational test not found' });
  const incident = linkedIncident(test);
  const knowledge = read('knowledge').filter(k => (test.captured_knowledge_ids||[]).includes(k.id));
  const kpis = calculateTestKPIs(test.id);
  const pir = test.pir_id ? read('pirs').find(p=>p.id===test.pir_id) || null : read('pirs').find(p=>p.operational_test_id===test.id || p.incident_id===test.incident_id) || null;
  const selectedIds = selectedKnowledgeIds(test);
  const selectedKnowledgeItems = read('knowledge').filter(k=>selectedIds.includes(k.id)).map(k=>({ ...k, response_plan:responsePlanFromKnowledge(k) }));
  const selectedKnowledge = selectedKnowledgeItems[0] || null;
  const combinedPlan = test.combined_response_plan || (selectedKnowledgeItems.length ? mergeKnowledgePlans(selectedKnowledgeItems) : null);
  res.json({ ...test, selected_knowledge_ids:selectedIds, scenario_definition:test.scenario_id ? scenarioById(test.scenario_id) : test.scenario_snapshot || null, alert_context:alertContext(test), linked_incident:incident ? { id:incident.id, title:incident.title, type:incident.type, severity:incident.severity, status:incident.status, station_id:incident.station_id||'', detection_source:incident.detection_source||'', impacted_service:incident.impacted_service||'', description:incident.description||'', entities:incident.entities||{}, classification:incident.classification||null } : null, selected_knowledge:selectedKnowledge, selected_knowledge_items:selectedKnowledgeItems, combined_response_plan:combinedPlan, captured_knowledge:knowledge, pir, events:getEventsForTest(test.id), kpis, data_quality:dataQuality(test,kpis) });
});

router.post('/:id/start', authenticate, requireMinRole('analyst'), (req,res) => {
  const tests = read('operational_tests');
  const idx = tests.findIndex(t => t.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error:'Operational test not found' });
  const now = nowIso();
  tests[idx].status = 'active';
  tests[idx].started_at = tests[idx].started_at || now;
  tests[idx].updated_at = now;
  write('operational_tests', tests);
  recordEvent({ operationalTestId:tests[idx].id, incidentId:tests[idx].incident_id, eventType:'OPERATIONAL_TEST_STARTED', actorId:req.user.id, actorRole:req.user.role, source:'operational-testing', timestamp:tests[idx].started_at, details:{ scenario:tests[idx].scenario_name } });
  res.json({ ...tests[idx], kpis:calculateTestKPIs(tests[idx].id) });
});

router.post('/:id/link-incident', authenticate, requireMinRole('analyst'), (req,res) => {
  const { incident_id } = req.body;
  const tests = read('operational_tests');
  const idx = tests.findIndex(t => t.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error:'Operational test not found' });
  const incidents = read('incidents');
  const ii = incidents.findIndex(i => i.id === incident_id);
  if (ii < 0) return res.status(404).json({ error:'Incident not found' });
  tests[idx].incident_id = incident_id;
  tests[idx].updated_at = nowIso();
  incidents[ii].operational_test_id = tests[idx].id;
  incidents[ii].updated_at = nowIso();
  write('operational_tests', tests); write('incidents', incidents);
  recordEvent({ operationalTestId:tests[idx].id, incidentId:incident_id, eventType:'DETECTED', actorId:req.user.id, actorRole:req.user.role, source:'incident-link', timestamp:incidents[ii].created_at });
  recordEvent({ operationalTestId:tests[idx].id, incidentId:incident_id, eventType:'ALERT_CREATED', actorId:'SYSTEM', source:'incident-link', timestamp:incidents[ii].created_at });
  res.json({ ...tests[idx], kpis:calculateTestKPIs(tests[idx].id) });
});

router.post('/:id/events', authenticate, requireMinRole('analyst'), (req,res) => {
  const { event_type, incident_id, details } = req.body;
  const test = getTest(req.params.id);
  if (!test) return res.status(404).json({ error:'Operational test not found' });
  if (!event_type) return res.status(400).json({ error:'event_type is required' });
  const event = recordEvent({ operationalTestId:test.id, incidentId:incident_id || test.incident_id, eventType:event_type, actorId:req.user.id, actorRole:req.user.role, source:'operational-workflow', details:details || {} });
  res.status(201).json({ event, kpis:calculateTestKPIs(test.id) });
});

router.post('/:id/classification', authenticate, requireMinRole('analyst'), (req,res) => {
  const test = getTest(req.params.id);
  if (!test) return res.status(404).json({ error:'Operational test not found' });
  if (!test.incident_id) return res.status(400).json({ error:'Link an incident before classifying it' });
  const category = String(req.body.category||'').trim();
  const severity = String(req.body.severity||'').toLowerCase();
  if (!category) return res.status(400).json({ error:'Classification category is required' });
  if (!validSeverity(severity)) return res.status(400).json({ error:'severity must be low, medium, high, or critical' });
  const classification = {
    category, severity, confidence:String(req.body.confidence||'medium').toLowerCase(), affected_asset:String(req.body.affected_asset||'').trim(),
    impact:String(req.body.impact||'').trim(), suspected_cause:String(req.body.suspected_cause||'').trim(), notes:String(req.body.notes||'').trim(),
    classified_at:nowIso(), classified_by:req.user.id
  };
  const incidents = read('incidents');
  const ii = incidents.findIndex(i=>i.id===test.incident_id);
  if (ii < 0) return res.status(404).json({ error:'Linked incident not found' });
  // Keep the normalized incident type used by filters; store the richer category in classification.
  incidents[ii].severity = severity;
  incidents[ii].classification = classification;
  incidents[ii].entities = { ...(incidents[ii].entities||{}), affected_asset:classification.affected_asset || incidents[ii].entities?.affected_asset };
  incidents[ii].updated_at = classification.classified_at;
  write('incidents', incidents);
  const updated = saveTestMutation(test.id, t => { t.classification = classification; });
  recordEvent({ operationalTestId:test.id, incidentId:test.incident_id, eventType:'INCIDENT_CLASSIFIED', actorId:req.user.id, actorRole:req.user.role, source:'structured-classification', timestamp:classification.classified_at, details:classification });
  logAction({ userId:req.user.id, action:'CLASSIFY_OPERATIONAL_INCIDENT', targetType:'incident', targetId:test.incident_id, metadata:classification });
  res.json({ ...updated, classification, kpis:calculateTestKPIs(test.id) });
});

router.post('/:id/knowledge/select', authenticate, requireMinRole('analyst'), (req,res) => {
  const test = getTest(req.params.id);
  if (!test) return res.status(404).json({ error:'Operational test not found' });
  if (!test.incident_id) return res.status(400).json({ error:'Create/link the incident before selecting knowledge' });
  const knowledgeId = String(req.body.knowledge_id||'').trim();
  const entry = read('knowledge').find(k=>k.id===knowledgeId && k.status==='active');
  if (!entry) return res.status(404).json({ error:'Knowledge entry not found or inactive' });
  const selectedAt = nowIso();
  const updated = saveTestMutation(test.id, t => {
    const ids = selectedKnowledgeIds(t);
    if (!ids.includes(entry.id)) ids.push(entry.id);
    t.selected_knowledge_ids = ids;
    t.selected_knowledge_id = ids[0] || null;
    const selections = Array.isArray(t.knowledge_selections) ? t.knowledge_selections.filter(x=>x.knowledge_id!==entry.id) : [];
    selections.push({ knowledge_id:entry.id, title:entry.title, selected_at:selectedAt, selected_by:req.user.id });
    t.knowledge_selections = selections;
    t.knowledge_selection = selections[0] || null;
    t.knowledge_search_result = { status:'found', at:selectedAt, knowledge_ids:ids };
    t.knowledge_selection_confirmed_at = null;
    t.knowledge_selection_confirmed_by = null;
    t.combined_response_plan = null;
  });
  recordEvent({ operationalTestId:test.id, incidentId:test.incident_id, eventType:'KNOWLEDGE_ACCESSED', actorId:req.user.id, actorRole:req.user.role, source:'knowledge-search', timestamp:selectedAt, details:{ knowledge_id:entry.id, title:entry.title }, allowDuplicate:true });
  logAction({ userId:req.user.id, action:'ADD_OPERATIONAL_KNOWLEDGE', targetType:'knowledge', targetId:entry.id, metadata:{ operational_test_id:test.id, incident_id:test.incident_id } });
  res.json({ test:updated, knowledge:{ ...entry, response_plan:responsePlanFromKnowledge(entry) }, selected_knowledge_ids:selectedKnowledgeIds(updated), kpis:calculateTestKPIs(test.id) });
});

router.post('/:id/knowledge/remove', authenticate, requireMinRole('analyst'), (req,res) => {
  const test=getTest(req.params.id);
  if (!test) return res.status(404).json({ error:'Operational test not found' });
  const knowledgeId=String(req.body.knowledge_id||'').trim();
  const appliedIds=new Set((test.knowledge_applications||[]).map(x=>x.knowledge_id));
  if (appliedIds.has(knowledgeId)) return res.status(400).json({ error:'Applied knowledge cannot be removed from the response record' });
  const updated=saveTestMutation(test.id,t=>{
    t.selected_knowledge_ids=selectedKnowledgeIds(t).filter(id=>id!==knowledgeId);
    t.selected_knowledge_id=t.selected_knowledge_ids[0]||null;
    t.knowledge_selections=(t.knowledge_selections||[]).filter(x=>x.knowledge_id!==knowledgeId);
    t.knowledge_selection=t.knowledge_selections[0]||null;
    t.knowledge_selection_confirmed_at=null; t.knowledge_selection_confirmed_by=null; t.combined_response_plan=null;
    if (!t.selected_knowledge_ids.length) t.knowledge_search_result=null;
  });
  res.json({ ...updated, kpis:calculateTestKPIs(test.id) });
});

router.post('/:id/knowledge/confirm', authenticate, requireMinRole('analyst'), (req,res) => {
  const test=getTest(req.params.id);
  if (!test) return res.status(404).json({ error:'Operational test not found' });
  const ids=selectedKnowledgeIds(test);
  if (!ids.length) return res.status(400).json({ error:'Select at least one knowledge entry before confirming the response set' });
  const entries=read('knowledge').filter(k=>ids.includes(k.id) && k.status==='active');
  if (!entries.length) return res.status(400).json({ error:'Selected knowledge entries are unavailable' });
  const at=nowIso(); const plan=mergeKnowledgePlans(entries);
  const updated=saveTestMutation(test.id,t=>{ t.knowledge_selection_confirmed_at=at; t.knowledge_selection_confirmed_by=req.user.id; t.combined_response_plan=plan; });
  recordEvent({ operationalTestId:test.id, incidentId:test.incident_id, eventType:'KNOWLEDGE_SELECTION_CONFIRMED', actorId:req.user.id, actorRole:req.user.role, source:'knowledge-search', timestamp:at, details:{ knowledge_ids:ids, count:ids.length }, allowDuplicate:true });
  res.json({ ...updated, selected_knowledge_ids:ids, combined_response_plan:plan, kpis:calculateTestKPIs(test.id) });
});

router.post('/:id/knowledge/not-found', authenticate, requireMinRole('analyst'), (req,res) => {
  const test = getTest(req.params.id);
  if (!test) return res.status(404).json({ error:'Operational test not found' });
  if (selectedKnowledgeIds(test).length) return res.status(400).json({ error:'Remove selected knowledge before recording that no suitable knowledge was found' });
  const at = nowIso();
  const updated = saveTestMutation(test.id, t => {
    t.selected_knowledge_id = null; t.selected_knowledge_ids=[]; t.knowledge_selection = null; t.knowledge_selections=[];
    t.knowledge_search_result = { status:'not_found', at, notes:String(req.body.notes||'').trim() };
  });
  recordEvent({ operationalTestId:test.id, incidentId:test.incident_id, eventType:'KNOWLEDGE_NOT_FOUND', actorId:req.user.id, actorRole:req.user.role, source:'knowledge-search', timestamp:at, details:{ notes:String(req.body.notes||'').trim() }, allowDuplicate:true });
  res.json({ ...updated, kpis:calculateTestKPIs(test.id) });
});

router.post('/:id/knowledge/apply', authenticate, requireMinRole('analyst'), (req,res) => {
  const test=getTest(req.params.id);
  if (!test) return res.status(404).json({ error:'Operational test not found' });
  if (!test.incident_id) return res.status(400).json({ error:'Create/link the incident first' });
  const ids=selectedKnowledgeIds(test);
  if (!ids.length) return res.status(400).json({ error:'Select relevant knowledge before applying it' });
  if (!test.knowledge_selection_confirmed_at) return res.status(400).json({ error:'Confirm the selected knowledge set before applying it' });
  const knowledge=read('knowledge');
  const entries=knowledge.filter(k=>ids.includes(k.id) && k.status==='active');
  if (entries.length!==ids.length) return res.status(400).json({ error:'One or more selected knowledge entries are unavailable' });
  const plan=mergeKnowledgePlans(entries); const appliedAt=nowIso();
  const previousApps=Array.isArray(test.knowledge_applications)?test.knowledge_applications:[];
  const previousById=new Map(previousApps.map(x=>[x.knowledge_id,x]));
  const newlyApplied=entries.filter(e=>!previousById.has(e.id));
  const previousRecords=new Map((test.containment?.action_records||[]).map(r=>[r.action,r]));
  const containmentRecords=plan.containment_actions.map(action=>previousRecords.get(action)||{action,status:'not_started',evidence:''});
  const previousRecovery=new Map((test.recovery?.action_records||[]).map(r=>[r.action,r]));
  const recoveryRecords=plan.recovery_actions.map(action=>previousRecovery.get(action)||{action,status:'not_started',evidence:''});
  const startedAt=test.containment?.started_at||appliedAt;
  const updated=saveTestMutation(test.id,t=>{
    t.combined_response_plan=plan;
    t.knowledge_applications=entries.map(entry=>({ ...(previousById.get(entry.id)||{}), knowledge_id:entry.id, title:entry.title, applied_at:previousById.get(entry.id)?.applied_at||appliedAt, applied_by:previousById.get(entry.id)?.applied_by||req.user.id, last_outcome:previousById.get(entry.id)?.last_outcome||'in_progress' }));
    t.knowledge_application={ knowledge_ids:ids, knowledge_id:ids[0], titles:entries.map(e=>e.title), applied_at:appliedAt, applied_by:req.user.id, ...plan, outcome:'in_progress' };
    t.containment={ ...(t.containment||{}), status:'in_progress', planned_actions:plan.containment_actions, completed_actions:t.containment?.completed_actions||[], action_records:containmentRecords, verification_required:plan.verification_checks.length?plan.verification_checks:plan.success_criteria, verification_checks:t.containment?.verification_checks||[], notes:`Knowledge-guided containment from ${ids.join(', ')}`, evidence:'', started_at:startedAt, current_attempt_started_at:appliedAt, started_by:req.user.id, outcome:null, confirmed_at:null, attempts:t.containment?.attempts||[] };
    if (plan.recovery_actions.length) t.recovery={ ...(t.recovery||{}), actions:plan.recovery_actions, action_records:recoveryRecords };
  });
  for (const entry of newlyApplied) {
    const ki=knowledge.findIndex(k=>k.id===entry.id); if (ki>=0) { knowledge[ki].use_count=Number(knowledge[ki].use_count||0)+1; knowledge[ki].last_used_at=appliedAt; }
    recordEvent({ operationalTestId:test.id, incidentId:test.incident_id, eventType:'KNOWLEDGE_APPLIED', actorId:req.user.id, actorRole:req.user.role, source:'knowledge-application', timestamp:appliedAt, details:{ knowledge_id:entry.id, title:entry.title }, allowDuplicate:true });
  }
  write('knowledge',knowledge);
  recordEvent({ operationalTestId:test.id, incidentId:test.incident_id, eventType:'CONTAINMENT_STARTED', actorId:req.user.id, actorRole:req.user.role, source:'knowledge-application', timestamp:appliedAt, details:{ knowledge_ids:ids, planned_actions:plan.containment_actions }, allowDuplicate:true });
  logAction({ userId:req.user.id, action:'APPLY_OPERATIONAL_KNOWLEDGE_SET', targetType:'operational_test', targetId:test.id, metadata:{ knowledge_ids:ids, incident_id:test.incident_id } });
  res.json({ ...updated, selected_knowledge_items:entries.map(e=>({...e,response_plan:responsePlanFromKnowledge(e)})), combined_response_plan:plan, kpis:calculateTestKPIs(test.id) });
});

router.post('/:id/collaborate', authenticate, requireMinRole('analyst'), (req,res) => {
  const test=getTest(req.params.id);
  if (!test) return res.status(404).json({ error:'Operational test not found' });
  if (!test.incident_id) return res.status(400).json({ error:'No incident linked to this test' });
  const collaborateWith=String(req.body.collaborate_with||'').trim();
  const reason=String(req.body.reason||'').trim();
  const meetingUrl=String(req.body.meeting_url||'').trim();
  if (!collaborateWith || !reason) return res.status(400).json({ error:'Collaboration target and reason are required' });
  if (!validMeetUrl(meetingUrl)) return res.status(400).json({ error:'Google Meet URL must use https://meet.google.com/...' });
  const members=resolveTeamMembers(req.body.team_member_ids);
  if (!members.length) return res.status(400).json({ error:'Select at least one response-team member' });
  const at=nowIso();
  const item={
    id:'col'+randomUUID().slice(0,8), collaborate_with:collaborateWith, reason,
    assistance_required:String(req.body.assistance_required||'').trim(), shared_summary:String(req.body.shared_summary||'').trim(),
    team_member_ids:members.map(m=>m.id), team_members:members.map(m=>({id:m.id,name:m.name,email:m.email,role:m.role,station_id:m.station_id||''})),
    meeting_url:meetingUrl||null, meeting_agenda:String(req.body.meeting_agenda||'').trim(), meeting_provider:meetingUrl?'Google Meet':null,
    started_at:at, started_by:req.user.id
  };
  const updated=saveTestMutation(test.id,t=>{ t.collaborations=[...(t.collaborations||[]),item]; t.collaboration=item; });
  notifyTeamMembers({ members, title:`Collaboration requested: ${test.scenario_name}`, message:`${req.user.email||req.user.id} requested support for incident ${test.incident_id}. ${reason}${meetingUrl?' Google Meet: '+meetingUrl:''}`, incidentId:test.incident_id, stationId:test.station_id, createdBy:req.user.id, actionUrl:`/operational-testing?test=${test.id}` });
  recordEvent({ operationalTestId:test.id, incidentId:test.incident_id, eventType:'COLLABORATION_STARTED', actorId:req.user.id, actorRole:req.user.role, source:'operational-workflow', timestamp:at, details:item, allowDuplicate:true });
  if (meetingUrl) recordEvent({ operationalTestId:test.id, incidentId:test.incident_id, eventType:'COLLABORATION_MEET_ATTACHED', actorId:req.user.id, actorRole:req.user.role, source:'operational-workflow', timestamp:at, details:{meeting_url:meetingUrl,team_member_ids:item.team_member_ids}, allowDuplicate:true });
  logAction({ userId:req.user.id, action:'COLLABORATE_ON_OPERATIONAL_INCIDENT', targetType:'incident', targetId:test.incident_id, metadata:item });
  res.json({ ...updated, kpis:calculateTestKPIs(test.id) });
});

router.post('/:id/escalate', authenticate, requireMinRole('analyst'), (req,res) => {
  const test = getTest(req.params.id);
  if (!test) return res.status(404).json({ error:'Operational test not found' });
  if (!test.incident_id) return res.status(400).json({ error:'No incident linked to this test' });
  const reason = String(req.body.reason||'').trim();
  const meetingUrl=String(req.body.meeting_url||'').trim();
  if (!reason) return res.status(400).json({ error:'Escalation reason is required' });
  if (!validMeetUrl(meetingUrl)) return res.status(400).json({ error:'Google Meet URL must use https://meet.google.com/...' });
  const members=resolveTeamMembers(req.body.team_member_ids);
  if (!members.length) return res.status(400).json({ error:'Select at least one escalation-team member' });
  const escalatedAt = nowIso();
  const escalation = {
    reason,
    escalated_to:String(req.body.escalated_to||'ICT Security Lead').trim(),
    priority:String(req.body.priority||'high').trim(),
    assistance_required:String(req.body.assistance_required||'').trim(),
    shared_summary:String(req.body.shared_summary||'').trim(),
    team_member_ids:members.map(m=>m.id), team_members:members.map(m=>({id:m.id,name:m.name,email:m.email,role:m.role,station_id:m.station_id||''})),
    meeting_url:meetingUrl||null, meeting_agenda:String(req.body.meeting_agenda||'').trim(), meeting_provider:meetingUrl?'Google Meet':null,
    escalated_at:escalatedAt,
    escalated_by:req.user.id
  };
  const updated = saveTestMutation(test.id, t=>{ t.escalation = escalation; });
  const incidents = read('incidents');
  const ii=incidents.findIndex(i=>i.id===test.incident_id);
  if(ii>=0){ incidents[ii].status='escalated'; incidents[ii].updated_at=escalatedAt; write('incidents',incidents); }
  notifyTeamMembers({ members, title:`Escalated incident: ${test.scenario_name}`, message:`Incident ${test.incident_id} was escalated (${escalation.priority}). ${reason}${meetingUrl?' Google Meet: '+meetingUrl:''}`, incidentId:test.incident_id, stationId:test.station_id, type:'escalation', createdBy:req.user.id, actionUrl:`/operational-testing?test=${test.id}` });
  recordEvent({ operationalTestId:test.id, incidentId:test.incident_id, eventType:'ESCALATED', actorId:req.user.id, actorRole:req.user.role, source:'operational-workflow', timestamp:escalatedAt, details:escalation });
  if (meetingUrl) recordEvent({ operationalTestId:test.id, incidentId:test.incident_id, eventType:'ESCALATION_MEET_ATTACHED', actorId:req.user.id, actorRole:req.user.role, source:'operational-workflow', timestamp:escalatedAt, details:{meeting_url:meetingUrl,team_member_ids:escalation.team_member_ids} });
  logAction({ userId:req.user.id, action:'ESCALATE_OPERATIONAL_INCIDENT', targetType:'incident', targetId:test.incident_id, metadata:escalation });
  res.json({ ...updated, kpis:calculateTestKPIs(test.id) });
});

router.post('/:id/close-incident', authenticate, requireMinRole('analyst'), (req,res) => {
  const test = getTest(req.params.id);
  if (!test) return res.status(404).json({ error:'Operational test not found' });
  if (!test.incident_id) return res.status(400).json({ error:'No incident linked to this test' });
  if (test.recovery?.outcome !== 'successful') return res.status(400).json({ error:'Confirm successful recovery before closing the incident' });
  const incidents = read('incidents');
  const ii = incidents.findIndex(i=>i.id===test.incident_id);
  if (ii < 0) return res.status(404).json({ error:'Linked incident not found' });
  const at = nowIso();
  incidents[ii].status = 'closed';
  incidents[ii].closed_at = at;
  incidents[ii].updated_at = at;
  write('incidents', incidents);
  recordEvent({ operationalTestId:test.id, incidentId:test.incident_id, eventType:'INCIDENT_CLOSED', actorId:req.user.id, actorRole:req.user.role, source:'operational-workflow', timestamp:at, details:{ resolution:String(req.body.resolution||'').trim() } });
  logAction({ userId:req.user.id, action:'CLOSE_OPERATIONAL_INCIDENT', targetType:'incident', targetId:test.incident_id, metadata:{ operational_test_id:test.id } });
  res.json({ incident:incidents[ii], kpis:calculateTestKPIs(test.id) });
});

// Structured containment workflow. A failed or partial attempt is retained as evidence,
// but MTTC only ends when a successful containment is confirmed.
router.post('/:id/containment/start', authenticate, requireMinRole('analyst'), (req,res) => {
  const test = getTest(req.params.id);
  if (!test) return res.status(404).json({ error:'Operational test not found' });
  if (!test.incident_id) return res.status(400).json({ error:'Link an incident before starting containment' });
  const planned = cleanArray(req.body.planned_actions);
  if (!planned.length) return res.status(400).json({ error:'Select at least one containment action' });
  const attemptStartedAt = nowIso();
  const startedAt = test.containment?.started_at || attemptStartedAt;
  const updated = saveTestMutation(test.id, t => {
    t.containment = {
      ...(t.containment||{}), status:'in_progress', planned_actions:planned,
      completed_actions:t.containment?.completed_actions||[], notes:req.body.notes||'', evidence:t.containment?.evidence||'',
      started_at:startedAt, current_attempt_started_at:attemptStartedAt, started_by:req.user.id, outcome:null, confirmed_at:null, attempts:t.containment?.attempts||[]
    };
  });
  recordEvent({ operationalTestId:test.id, incidentId:test.incident_id, eventType:'CONTAINMENT_STARTED', actorId:req.user.id, actorRole:req.user.role, source:'containment-workflow', timestamp:attemptStartedAt, details:{ planned_actions:planned, notes:req.body.notes||'', attempt_number:(test.containment?.attempts||[]).length+1 }, allowDuplicate:true });
  logAction({ userId:req.user.id, action:'START_CONTAINMENT', targetType:'operational_test', targetId:test.id, metadata:{ incident_id:test.incident_id, planned_actions:planned } });
  res.json({ ...updated, kpis:calculateTestKPIs(test.id) });
});

router.post('/:id/containment/confirm', authenticate, requireMinRole('analyst'), (req,res) => {
  const test = getTest(req.params.id);
  if (!test) return res.status(404).json({ error:'Operational test not found' });
  if (!test.incident_id) return res.status(400).json({ error:'No incident linked to this test' });
  if (!test.containment?.started_at) return res.status(400).json({ error:'Start containment before confirming it' });
  const outcome = String(req.body.outcome||'').toLowerCase();
  if (!['successful','partial','failed'].includes(outcome)) return res.status(400).json({ error:'outcome must be successful, partial, or failed' });
  const rawRecords = Array.isArray(req.body.action_records) ? req.body.action_records : [];
  const actionRecords = rawRecords.map(r=>({
    action:String(r.action||'').trim(),
    status:['not_started','in_progress','completed','not_applicable'].includes(String(r.status||'')) ? String(r.status) : 'not_started',
    evidence:String(r.evidence||'').trim()
  })).filter(r=>r.action);
  const completed = cleanArray(req.body.completed_actions).length ? cleanArray(req.body.completed_actions) : actionRecords.filter(r=>r.status==='completed').map(r=>r.action);
  if (!completed.length) return res.status(400).json({ error:'Complete at least one containment action' });
  if (!String(req.body.evidence||'').trim()) return res.status(400).json({ error:'Record containment verification evidence' });
  if (outcome === 'successful' && actionRecords.length && actionRecords.some(r=>!['completed','not_applicable'].includes(r.status))) {
    return res.status(400).json({ error:'Successful containment requires every planned action to be completed or marked not applicable' });
  }
  const verificationChecks = cleanArray(req.body.verification_checks);
  const verificationRequired = cleanArray(test.containment?.verification_required);
  if (outcome === 'successful' && verificationRequired.length && verificationRequired.some(v=>!verificationChecks.includes(v))) {
    return res.status(400).json({ error:'Successful containment requires all verification checks to be confirmed' });
  }
  const confirmedAt = nowIso();
  const attemptRecord={ attempt_number:(test.containment?.attempts||[]).length+1, started_at:test.containment?.current_attempt_started_at||test.containment?.started_at||null, confirmed_at:confirmedAt, outcome, completed_actions:completed, action_records:actionRecords, verification_checks:verificationChecks, evidence:String(req.body.evidence||'').trim(), notes:req.body.notes||'', knowledge_ids:selectedKnowledgeIds(test) };
  const updated = saveTestMutation(test.id, t => {
    t.containment = {
      ...(t.containment||{}), status:outcome, completed_actions:completed, action_records:actionRecords,
      verification_checks:verificationChecks, notes:req.body.notes ?? t.containment?.notes ?? '', evidence:String(req.body.evidence||'').trim(), outcome,
      confirmed_at:confirmedAt, confirmed_by:req.user.id, attempts:[...(t.containment?.attempts||[]),attemptRecord]
    };
  });
  const eventType = outcome === 'successful' ? 'CONTAINMENT_CONFIRMED' : outcome === 'partial' ? 'CONTAINMENT_PARTIAL' : 'CONTAINMENT_FAILED';
  recordEvent({ operationalTestId:test.id, incidentId:test.incident_id, eventType, actorId:req.user.id, actorRole:req.user.role, source:'containment-workflow', timestamp:confirmedAt, details:{ completed_actions:completed, action_records:actionRecords, verification_checks:verificationChecks, evidence:req.body.evidence||'', notes:req.body.notes||'', outcome }, allowDuplicate:outcome!=='successful' });
  const appliedIds=uniqueStrings([...(test.knowledge_applications||[]).map(x=>x.knowledge_id),...(test.knowledge_application?.knowledge_ids||[]),test.knowledge_application?.knowledge_id]);
  if (appliedIds.length) {
    saveTestMutation(test.id,t=>{
      t.knowledge_applications=(t.knowledge_applications||[]).map(app=>({ ...app, last_outcome:outcome, outcomes:[...(app.outcomes||[]),{ outcome, at:confirmedAt, evidence:String(req.body.evidence||'').trim() }] }));
      if (t.knowledge_application) t.knowledge_application.outcome=outcome;
    });
    const knowledgeEvent=outcome==='successful'?'KNOWLEDGE_REUSE_SUCCESS':outcome==='partial'?'KNOWLEDGE_REUSE_PARTIAL':'KNOWLEDGE_REUSE_FAILED';
    for (const knowledgeId of appliedIds) recordEvent({ operationalTestId:test.id, incidentId:test.incident_id, eventType:knowledgeEvent, actorId:req.user.id, actorRole:req.user.role, source:'knowledge-guided-containment', timestamp:confirmedAt, details:{ knowledge_id:knowledgeId, outcome, evidence:req.body.evidence||'' }, allowDuplicate:true });
  }
  logAction({ userId:req.user.id, action:'CONFIRM_CONTAINMENT', targetType:'operational_test', targetId:test.id, metadata:{ incident_id:test.incident_id, outcome, completed_actions:completed } });
  res.json({ ...getTest(test.id), kpis:calculateTestKPIs(test.id) });
});

router.post('/:id/recovery/confirm', authenticate, requireMinRole('analyst'), (req,res) => {
  const test = getTest(req.params.id);
  if (!test) return res.status(404).json({ error:'Operational test not found' });
  if (!test.incident_id) return res.status(400).json({ error:'No incident linked to this test' });
  if (test.containment?.outcome !== 'successful') return res.status(400).json({ error:'Confirm successful containment before recovery' });
  const outcome = String(req.body.outcome||'').toLowerCase();
  if (!['successful','partial','failed'].includes(outcome)) return res.status(400).json({ error:'outcome must be successful, partial, or failed' });
  const rawRecords = Array.isArray(req.body.action_records) ? req.body.action_records : [];
  const actionRecords = rawRecords.map(r=>({
    action:String(r.action||'').trim(),
    status:['not_started','in_progress','completed','not_applicable'].includes(String(r.status||'')) ? String(r.status) : 'not_started',
    evidence:String(r.evidence||'').trim()
  })).filter(r=>r.action);
  const actions = cleanArray(req.body.actions).length ? cleanArray(req.body.actions) : actionRecords.filter(r=>r.status==='completed').map(r=>r.action);
  if (!actions.length) return res.status(400).json({ error:'Complete at least one recovery action' });
  if (!String(req.body.evidence||'').trim()) return res.status(400).json({ error:'Record recovery validation evidence' });
  if (outcome === 'successful' && actionRecords.length && actionRecords.some(r=>!['completed','not_applicable'].includes(r.status))) {
    return res.status(400).json({ error:'Successful recovery requires every planned action to be completed or marked not applicable' });
  }
  const confirmedAt = nowIso();
  const updated = saveTestMutation(test.id, t => {
    t.recovery = { status:outcome, actions, action_records:actionRecords, notes:req.body.notes||'', evidence:String(req.body.evidence||'').trim(), outcome, confirmed_at:confirmedAt, confirmed_by:req.user.id };
  });
  const eventType = outcome === 'successful' ? 'RECOVERY_CONFIRMED' : outcome === 'partial' ? 'RECOVERY_PARTIAL' : 'RECOVERY_FAILED';
  recordEvent({ operationalTestId:test.id, incidentId:test.incident_id, eventType, actorId:req.user.id, actorRole:req.user.role, source:'recovery-workflow', timestamp:confirmedAt, details:{ actions, action_records:actionRecords, evidence:req.body.evidence||'', notes:req.body.notes||'', outcome }, allowDuplicate:outcome!=='successful' });
  logAction({ userId:req.user.id, action:'CONFIRM_RECOVERY', targetType:'operational_test', targetId:test.id, metadata:{ incident_id:test.incident_id, outcome, actions } });
  res.json({ ...updated, kpis:calculateTestKPIs(test.id) });
});

// Captures reusable lessons as draft institutional knowledge. Existing knowledge can be
// improved by creating a proposed draft version; the currently published entry stays intact.
router.post('/:id/lesson', authenticate, requireMinRole('analyst'), (req,res) => {
  const test=getTest(req.params.id);
  if (!test) return res.status(404).json({ error:'Operational test not found' });
  const incident=linkedIncident(test);
  if (!incident) return res.status(400).json({ error:'Link an incident before capturing a lesson' });
  const { title, what_happened, what_worked, what_failed, next_time, reusable_procedure, routine_used, confidence_level, visibility }=req.body;
  if (!title || !String(title).trim()) return res.status(400).json({ error:'Lesson title is required' });
  if (!what_happened || !String(what_happened).trim()) return res.status(400).json({ error:'Describe what happened' });
  if (!reusable_procedure || !String(reusable_procedure).trim()) return res.status(400).json({ error:'Provide a reusable procedure' });
  const mode=String(req.body.mode||'new').toLowerCase();
  const targetId=String(req.body.target_knowledge_id||'').trim();
  const tags=cleanArray(req.body.tags);
  const containmentActions=cleanArray(test.containment?.completed_actions);
  const recoveryActions=cleanArray(test.recovery?.actions);
  const selectedIds=selectedKnowledgeIds(test);
  const knowledgeReviews=Array.isArray(req.body.knowledge_reviews)?req.body.knowledge_reviews.map(r=>({knowledge_id:String(r.knowledge_id||'').trim(),assessment:String(r.assessment||'effective').trim(),notes:String(r.notes||'').trim()})).filter(r=>r.knowledge_id):[];
  const content=[`What happened:
${String(what_happened).trim()}`,`What worked:
${String(what_worked||'Not recorded').trim()}`,`What did not work / gaps:
${String(what_failed||'None recorded').trim()}`,`Containment actions:
${containmentActions.length?containmentActions.map(a=>'- '+a).join('\n'):'Not recorded'}`,`Recovery actions:
${recoveryActions.length?recoveryActions.map(a=>'- '+a).join('\n'):'Not recorded'}`,`Knowledge used:
${selectedIds.length?selectedIds.join(', '):String(routine_used||'Not recorded').trim()}`,`What should change next time:
${String(next_time||'No additional change recorded').trim()}`,`Reusable procedure:
${String(reusable_procedure).trim()}`].join('\n\n');
  const knowledge=read('knowledge');
  let previous=null;
  if (mode==='update') { previous=knowledge.find(k=>k.id===targetId); if (!previous) return res.status(404).json({ error:'Knowledge entry selected for update was not found' }); }
  const entry={
    id:'k'+randomUUID().slice(0,8), title:String(title).trim(), content, tags:tags.length?tags:(previous?.tags||[]), incident_id:incident.id, operational_test_id:test.id,
    knowledge_type:previous?.knowledge_type||'lessons-learned', contributor_id:req.user.id, station_id:test.station_id||incident.station_id||req.user.station_id||'',
    visibility:visibility==='organization'?'organization':'local', confidence_level:['low','medium','high'].includes(confidence_level)?confidence_level:'medium', confidence_score:confidenceScore(confidence_level),
    version:previous?Number(previous.version||1)+1:1, previous_version_id:previous?.id||null, proposed_update_for:previous?.id||null, superseded_by:null, status:'draft', use_count:0, last_used_at:null, created_at:nowIso(),
    structured_lesson:{ what_happened:String(what_happened).trim(), what_worked:String(what_worked||'').trim(), what_failed:String(what_failed||'').trim(), next_time:String(next_time||'').trim(), reusable_procedure:String(reusable_procedure).trim(), routine_used:String(routine_used||'').trim(), selected_knowledge_ids:selectedIds, knowledge_reviews:knowledgeReviews, containment_actions:containmentActions, containment_outcome:test.containment?.outcome||null, recovery_actions:recoveryActions, recovery_outcome:test.recovery?.outcome||null }
  };
  knowledge.push(entry); write('knowledge',knowledge);
  const updated=saveTestMutation(test.id,t=>{ t.captured_knowledge_ids=[...new Set([...(t.captured_knowledge_ids||[]),entry.id])]; t.lesson_review={ captured_at:entry.created_at, knowledge_reviews:knowledgeReviews, selected_knowledge_ids:selectedIds }; });
  const incidents=read('incidents'); const ii=incidents.findIndex(i=>i.id===incident.id);
  if (ii>=0) { incidents[ii].captured_knowledge_ids=[...new Set([...(incidents[ii].captured_knowledge_ids||[]),entry.id])]; incidents[ii].updated_at=nowIso(); write('incidents',incidents); }
  const eventType=mode==='update'?'KNOWLEDGE_UPDATED':'KNOWLEDGE_CREATED';
  recordEvent({ operationalTestId:test.id, incidentId:incident.id, eventType, actorId:req.user.id, actorRole:req.user.role, source:'lesson-capture', details:{ knowledge_id:entry.id, title:entry.title, status:'draft', proposed_update_for:entry.proposed_update_for } , allowDuplicate:true});
  logAction({ userId:req.user.id, action:mode==='update'?'PROPOSE_KNOWLEDGE_UPDATE':'CAPTURE_OPERATIONAL_LESSON', targetType:'knowledge', targetId:entry.id, metadata:{ incident_id:incident.id, operational_test_id:test.id, target_knowledge_id:targetId||null } });
  res.status(201).json({ knowledge:entry, test:{ ...updated, kpis:calculateTestKPIs(test.id) } });
});

router.post('/:id/generate-pir', authenticate, requireMinRole('analyst'), (req,res) => {
  const test = getTest(req.params.id);
  if (!test) return res.status(404).json({ error:'Operational test not found' });
  const incident = linkedIncident(test);
  if (!incident) return res.status(400).json({ error:'Link an incident before generating a post-incident review' });
  const pirs = read('pirs');
  let existing = pirs.find(p=>p.incident_id===incident.id || p.operational_test_id===test.id);
  if (existing) {
    if (!test.pir_id) saveTestMutation(test.id,t=>{t.pir_id=existing.id});
    return res.json(existing);
  }
  const events = getEventsForTest(test.id);
  const kpis = calculateTestKPIs(test.id) || {};
  const timeline = events.map(e=>`${e.timestamp} | ${e.event_type} | ${e.source}${e.details&&Object.keys(e.details).length ? ' | '+JSON.stringify(e.details) : ''}`).join('\n');
  const lesson = read('knowledge').find(k=>(test.captured_knowledge_ids||[]).includes(k.id));
  const rootCause = test.classification?.suspected_cause || 'To be validated during post-incident review';
  const whatWorked = [test.containment?.evidence && `Containment: ${test.containment.evidence}`, test.recovery?.evidence && `Recovery: ${test.recovery.evidence}`, lesson?.structured_lesson?.what_worked].filter(Boolean).join('\n') || 'To be completed during review';
  const whatFailed = lesson?.structured_lesson?.what_failed || 'To be completed during review';
  const pir = {
    id:'pir'+randomUUID().slice(0,8), incident_id:incident.id, operational_test_id:test.id, author_id:req.user.id, timeline, root_cause:rootCause,
    five_whys:[], what_worked:whatWorked, what_failed:whatFailed, action_items:[], participants:[test.participant_id].filter(Boolean), status:'draft',
    kpi_snapshot:{mttd_minutes:kpis.mttd_minutes,mtta_minutes:kpis.mtta_minutes,classification_minutes:kpis.classification_minutes,mttc_minutes:kpis.mttc_minutes,mttr_minutes:kpis.mttr_minutes,knowledge_retrieval_minutes:kpis.knowledge_retrieval_minutes,knowledge_utilization_rate:kpis.knowledge_utilization_rate},
    classification_snapshot:test.classification||{}, containment_snapshot:test.containment||{}, recovery_snapshot:test.recovery||{}, observer_snapshot:test.observer_scores||{},
    created_at:nowIso(), updated_at:nowIso()
  };
  pirs.push(pir); write('pirs',pirs);
  saveTestMutation(test.id,t=>{t.pir_id=pir.id});
  recordEvent({ operationalTestId:test.id, incidentId:incident.id, eventType:'PIR_GENERATED', actorId:req.user.id, actorRole:req.user.role, source:'operational-testing', details:{pir_id:pir.id} });
  logAction({ userId:req.user.id, action:'GENERATE_OPERATIONAL_PIR', targetType:'pir', targetId:pir.id, metadata:{incident_id:incident.id,operational_test_id:test.id} });
  res.status(201).json(pir);
});

router.put('/:id/observer-scores', authenticate, requireMinRole('analyst'), (req,res) => {
  const tests = read('operational_tests');
  const idx = tests.findIndex(t => t.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error:'Operational test not found' });
  tests[idx].observer_scores = { ...(tests[idx].observer_scores || {}), ...req.body };
  tests[idx].updated_at = nowIso();
  write('operational_tests', tests);
  res.json({ ...tests[idx], kpis:calculateTestKPIs(tests[idx].id) });
});

router.post('/:id/finish', authenticate, requireMinRole('analyst'), (req,res) => {
  const tests = read('operational_tests');
  const idx = tests.findIndex(t => t.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error:'Operational test not found' });
  const test = tests[idx];
  const incident = test.incident_id ? read('incidents').find(i=>i.id===test.incident_id) : null;
  if (!incident || incident.status !== 'closed') return res.status(400).json({ error:'Close the incident after successful recovery before finalizing the operational test' });
  if (!(test.captured_knowledge_ids||[]).length) return res.status(400).json({ error:'Capture the lesson before finalizing the operational test' });
  const now = nowIso();
  tests[idx].status = 'completed'; tests[idx].completed_at = now; tests[idx].updated_at = now;
  write('operational_tests', tests);
  recordEvent({ operationalTestId:test.id, incidentId:test.incident_id, eventType:'OPERATIONAL_TEST_FINALIZED', actorId:req.user.id, actorRole:req.user.role, source:'operational-testing', timestamp:now, details:{ outcome:'completed' } });
  res.json({ ...tests[idx], events:getEventsForTest(tests[idx].id), kpis:calculateTestKPIs(tests[idx].id) });
});

module.exports = router;
