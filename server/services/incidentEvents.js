const { randomUUID } = require('crypto');
const { read, write } = require('../store');

const MILESTONE_TYPES = new Set([
  'EXERCISE_STARTED','INCIDENT_OCCURRED','DETECTED','ALERT_CREATED','ALERT_ACKNOWLEDGED','INCIDENT_CLASSIFIED',
  'KNOWLEDGE_SEARCH_STARTED','KNOWLEDGE_ACCESSED','KNOWLEDGE_NOT_FOUND','KNOWLEDGE_APPLIED','KNOWLEDGE_REUSE_SUCCESS','KNOWLEDGE_REUSE_PARTIAL','KNOWLEDGE_REUSE_FAILED',
  'ROUTINE_RECOMMENDED','ESCALATED','COLLABORATION_STARTED','CONTAINMENT_STARTED',
  'CONTAINMENT_CONFIRMED','CONTAINMENT_PARTIAL','CONTAINMENT_FAILED','RECOVERY_CONFIRMED','RECOVERY_PARTIAL','RECOVERY_FAILED',
  'INCIDENT_CLOSED','KNOWLEDGE_CREATED','KNOWLEDGE_UPDATED','FACILITATOR_INJECT_RELEASED','PIR_GENERATED'
]);

function findTestForIncident(incidentId) {
  if (!incidentId) return null;
  const incident = read('incidents').find(i => i.id === incidentId);
  if (incident?.operational_test_id) {
    return read('operational_tests').find(t => t.id === incident.operational_test_id) || null;
  }
  return read('operational_tests').find(t => t.incident_id === incidentId && t.status !== 'cancelled') || null;
}

function recordEvent({ operationalTestId, incidentId, eventType, actorId = 'SYSTEM', actorRole = 'system', source = 'system', details = {}, timestamp, allowDuplicate = false }) {
  if (!eventType) throw new Error('eventType is required');
  const test = operationalTestId
    ? read('operational_tests').find(t => t.id === operationalTestId)
    : findTestForIncident(incidentId);
  const testId = test?.id || operationalTestId || null;
  if (!testId) return null;

  const events = read('incident_events');
  if (!allowDuplicate && MILESTONE_TYPES.has(eventType)) {
    const existing = events.find(e => e.operational_test_id === testId && e.incident_id === (incidentId || test?.incident_id || null) && e.event_type === eventType);
    if (existing) return existing;
  }

  const event = {
    id: 'evt' + randomUUID().slice(0, 8),
    operational_test_id: testId,
    incident_id: incidentId || test?.incident_id || null,
    event_type: eventType,
    actor_id: actorId,
    actor_role: actorRole,
    source,
    details,
    timestamp: timestamp || new Date().toISOString()
  };
  events.push(event);
  write('incident_events', events);
  return event;
}

function getEventsForTest(testId) {
  return read('incident_events')
    .filter(e => e.operational_test_id === testId)
    .sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
}

module.exports = { recordEvent, getEventsForTest, findTestForIncident };
