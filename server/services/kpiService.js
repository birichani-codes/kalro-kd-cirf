const { read } = require('../store');
const { getEventsForTest } = require('./incidentEvents');

const firstEvent = (events, type) => events.find(e => e.event_type === type) || null;
const first = (events, type) => firstEvent(events, type)?.timestamp || null;
const diffMs = (start, end) => start && end ? Math.max(0, new Date(end) - new Date(start)) : null;
const mins = ms => ms === null ? null : Number((ms / 60000).toFixed(2));
const secs = ms => ms === null ? null : Math.round(ms / 1000);

const eventKnowledgeKey = (event, fallbackPrefix) =>
  event?.details?.knowledge_id || event?.details?.routine_id || `${fallbackPrefix}:${event?.id || event?.timestamp}`;

function diagnostic(status, message, missing = []) {
  return { status, message, missing };
}

function buildDiagnostics(m) {
  return {
    mttd: !m.incidentOccurred
      ? diagnostic('missing', 'MTTD unavailable: inject the incident to create the INCIDENT_OCCURRED timestamp.', ['INCIDENT_OCCURRED'])
      : !m.detected
        ? diagnostic('waiting', 'MTTD is waiting for the incident detection timestamp.', ['DETECTED'])
        : diagnostic('ready', 'MTTD calculated from incident occurrence to detection.'),
    mtta: !m.alert
      ? diagnostic('missing', 'MTTA unavailable: no alert/detection timestamp exists.', ['ALERT_CREATED'])
      : !m.ack
        ? diagnostic('waiting', 'MTTA is waiting for alert acknowledgement.', ['ALERT_ACKNOWLEDGED'])
        : diagnostic('ready', 'MTTA calculated from alert creation to acknowledgement.'),
    classification: !m.detected
      ? diagnostic('missing', 'Classification time requires a detection timestamp.', ['DETECTED'])
      : !m.classified
        ? diagnostic('waiting', 'Classification time is waiting for structured incident classification.', ['INCIDENT_CLASSIFIED'])
        : diagnostic('ready', 'Classification time calculated from detection to classification.'),
    mttc: !m.detected
      ? diagnostic('missing', 'MTTC requires a detection timestamp.', ['DETECTED'])
      : !m.containment
        ? diagnostic('waiting', 'MTTC remains open until containment is confirmed successful.', ['CONTAINMENT_CONFIRMED'])
        : diagnostic('ready', 'MTTC calculated from detection to successful containment.'),
    mttr: !m.detected
      ? diagnostic('missing', 'MTTR requires a detection timestamp.', ['DETECTED'])
      : !m.closed
        ? diagnostic('waiting', 'MTTR is waiting for the incident to be closed.', ['INCIDENT_CLOSED'])
        : diagnostic('ready', 'MTTR calculated from detection to incident closure.'),
    knowledge_retrieval: !m.searchStart
      ? diagnostic('not_started', 'Knowledge retrieval time has not started. Use Start knowledge search.', ['KNOWLEDGE_SEARCH_STARTED'])
      : m.knowledgeNotFound
        ? diagnostic('optional', 'Knowledge search completed without a suitable match. Retrieval time is not applicable; escalation is expected.', [])
        : !m.knowledgeFound
          ? diagnostic('waiting', 'Knowledge retrieval timer is running until relevant knowledge is selected.', ['KNOWLEDGE_ACCESSED'])
          : diagnostic('ready', 'Knowledge retrieval time calculated from search start to selected relevant knowledge.'),
    escalation: !m.escalated
      ? diagnostic('optional', 'No escalation timestamp recorded. This can remain blank if escalation was not required.', ['ESCALATED'])
      : diagnostic('ready', 'Escalation time calculated from detection to escalation.'),
    collaboration: !m.collaboration
      ? diagnostic('optional', 'No collaboration start recorded. This can remain blank when collaboration is not required.', ['COLLABORATION_STARTED'])
      : diagnostic('ready', 'Collaboration time calculated from detection to collaboration start.'),
    recovery: !m.recovery
      ? diagnostic('waiting', 'Recovery time is waiting for successful recovery confirmation.', ['RECOVERY_CONFIRMED'])
      : diagnostic('ready', 'Recovery time calculated from detection to successful recovery.'),
    knowledge_capture: !m.closed
      ? diagnostic('waiting', 'Knowledge capture time starts after incident closure.', ['INCIDENT_CLOSED'])
      : !m.knowledgeCaptured
        ? diagnostic('waiting', 'Capture a lesson to complete the institutional learning loop.', ['KNOWLEDGE_CREATED'])
        : diagnostic('ready', 'Knowledge capture time calculated from incident closure to lesson capture.')
  };
}

function calculateTestKPIs(testId) {
  const test = read('operational_tests').find(t => t.id === testId);
  if (!test) return null;
  const events = getEventsForTest(testId);

  const exerciseStarted = first(events, 'EXERCISE_STARTED') || test.started_at;
  const incidentOccurred = first(events, 'INCIDENT_OCCURRED') || first(events, 'EVENT_OCCURRED');
  const detected = first(events, 'DETECTED');
  const alert = first(events, 'ALERT_CREATED') || detected;
  const ack = first(events, 'ALERT_ACKNOWLEDGED');
  const classified = first(events, 'INCIDENT_CLASSIFIED');
  const searchStart = first(events, 'KNOWLEDGE_SEARCH_STARTED');
  const knowledgeFound = first(events, 'KNOWLEDGE_ACCESSED');
  const knowledgeNotFound = first(events, 'KNOWLEDGE_NOT_FOUND');
  const knowledgeSelectionConfirmed = first(events, 'KNOWLEDGE_SELECTION_CONFIRMED');
  const escalated = first(events, 'ESCALATED');
  const collaboration = first(events, 'COLLABORATION_STARTED');
  const containmentStart = first(events, 'CONTAINMENT_STARTED');
  const containment = first(events, 'CONTAINMENT_CONFIRMED');
  const recovery = first(events, 'RECOVERY_CONFIRMED');
  const closed = first(events, 'INCIDENT_CLOSED');
  const knowledgeCaptured = first(events, 'KNOWLEDGE_CREATED') || first(events, 'KNOWLEDGE_UPDATED');

  const accessEvents = events.filter(e => e.event_type === 'KNOWLEDGE_ACCESSED');
  const appliedEvents = events.filter(e => ['KNOWLEDGE_APPLIED','ROUTINE_ACCEPTED','KNOWLEDGE_USED'].includes(e.event_type));
  const successEvents = events.filter(e => e.event_type === 'KNOWLEDGE_REUSE_SUCCESS');
  const recommendationEvents = events.filter(e => e.event_type === 'ROUTINE_RECOMMENDED');
  const routineAcceptances = events.filter(e => e.event_type === 'ROUTINE_ACCEPTED');
  const injectEvents = events.filter(e => e.event_type === 'FACILITATOR_INJECT_RELEASED');

  const accessedKeys = new Set(accessEvents.map((e,i) => eventKnowledgeKey(e, `access-${i}`)));
  const appliedKeys = new Set(appliedEvents.map((e,i) => eventKnowledgeKey(e, `apply-${i}`)));
  const successfulKeys = new Set([
    ...successEvents.map((e,i) => eventKnowledgeKey(e, `success-${i}`)),
    ...appliedEvents.filter(e => e.details?.success === true).map((e,i) => eventKnowledgeKey(e, `apply-success-${i}`))
  ]);

  const recommendationCount = recommendationEvents.reduce((sum, e) => {
    const n = Number(e.details?.count);
    return sum + (Number.isFinite(n) && n > 0 ? n : 1);
  }, 0);
  const acceptedRoutineKeys = new Set(routineAcceptances.map((e,i) => eventKnowledgeKey(e, `routine-${i}`)));

  const durations = {
    mttd_ms: diffMs(incidentOccurred, detected),
    mtta_ms: diffMs(alert, ack),
    classification_ms: diffMs(detected, classified),
    knowledge_retrieval_ms: diffMs(searchStart, knowledgeFound),
    knowledge_search_ms: diffMs(searchStart, knowledgeFound || knowledgeNotFound),
    knowledge_selection_ms: diffMs(searchStart, knowledgeSelectionConfirmed),
    escalation_ms: diffMs(detected, escalated),
    collaboration_ms: diffMs(detected, collaboration),
    mttc_ms: diffMs(detected, containment),
    containment_action_ms: diffMs(containmentStart, containment),
    recovery_ms: diffMs(detected, recovery),
    mttr_ms: diffMs(detected, closed),
    knowledge_capture_ms: diffMs(closed, knowledgeCaptured)
  };

  const result = {};
  Object.entries(durations).forEach(([k,v]) => {
    result[k] = v;
    result[k.replace('_ms','_minutes')] = mins(v);
    result[k.replace('_ms','_seconds')] = secs(v);
  });

  const appliedCount = appliedKeys.size;
  const accessedCount = accessedKeys.size;
  const successCount = [...successfulKeys].filter(k => appliedKeys.has(k) || k.startsWith('success-')).length;
  const milestones = { exerciseStarted, incidentOccurred, detected, alert, ack, classified, searchStart, knowledgeFound, knowledgeNotFound, knowledgeSelectionConfirmed, escalated, collaboration, containmentStart, containment, recovery, closed, knowledgeCaptured };

  return {
    test_id: testId,
    incident_id: test.incident_id || null,
    milestones,
    diagnostics: buildDiagnostics(milestones),
    ...result,
    knowledge_accessed: accessedCount > 0,
    knowledge_items_accessed: accessedCount,
    knowledge_used: appliedCount > 0,
    knowledge_items_used: appliedCount,
    successful_knowledge_reuses: successCount,
    knowledge_utilization_rate: accessedCount ? Number((Math.min(appliedCount, accessedCount) / accessedCount * 100).toFixed(1)) : null,
    recommendation_count: recommendationCount,
    recommendations_accepted: acceptedRoutineKeys.size,
    recommendation_acceptance_rate: recommendationCount ? Number((Math.min(acceptedRoutineKeys.size, recommendationCount) / recommendationCount * 100).toFixed(1)) : null,
    knowledge_reuse_success_rate: appliedCount ? Number((Math.min(successCount, appliedCount) / appliedCount * 100).toFixed(1)) : null,
    facilitator_injects_released: injectEvents.length,
    facilitator_interventions: Number(test.observer_scores?.facilitator_interventions || 0),
    decision_accuracy: test.observer_scores?.decision_accuracy ?? null,
    classification_accuracy: test.observer_scores?.classification_accuracy ?? null,
    escalation_accuracy: test.observer_scores?.escalation_accuracy ?? null,
    collaboration_score: test.observer_scores?.collaboration_score ?? null,
    role_adherence: test.observer_scores?.role_adherence ?? null,
    critical_omissions: Number(test.observer_scores?.critical_omissions || 0),
    event_count: events.length
  };
}

function metricStats(vals) {
  const sorted = [...vals].sort((a,b)=>a-b);
  if (!sorted.length) return { mean:null, median:null, min:null, max:null, std_dev:null, count:0 };
  const mean = sorted.reduce((a,b)=>a+b,0)/sorted.length;
  const mid = Math.floor(sorted.length/2);
  const median = sorted.length%2 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2;
  const variance = sorted.reduce((sum,v)=>sum + Math.pow(v-mean,2),0)/sorted.length;
  return {
    mean:Number(mean.toFixed(2)), median:Number(median.toFixed(2)), min:sorted[0], max:sorted[sorted.length-1],
    std_dev:Number(Math.sqrt(variance).toFixed(2)), count:sorted.length
  };
}

function aggregateKPIs(tests) {
  const rows = tests.map(t => ({ ...calculateTestKPIs(t.id), test_mode:t.test_mode || 'kd_cirf', scenario_id:t.scenario_id || null, scenario_name:t.scenario_name, completed_at:t.completed_at })).filter(Boolean);
  const metricKeys = [
    'mttd_minutes','mtta_minutes','classification_minutes','mttc_minutes','mttr_minutes','knowledge_retrieval_minutes','knowledge_selection_minutes',
    'escalation_minutes','collaboration_minutes','knowledge_utilization_rate',
    'recommendation_acceptance_rate','knowledge_reuse_success_rate','facilitator_interventions','critical_omissions'
  ];
  const summary = {};
  metricKeys.forEach(key => summary[key] = metricStats(rows.map(r => r[key]).filter(v => typeof v === 'number' && Number.isFinite(v))));
  return { tests: rows.length, summary, rows };
}

module.exports = { calculateTestKPIs, aggregateKPIs, metricStats };
