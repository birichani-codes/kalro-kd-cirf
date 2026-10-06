/**
 * Defensive Routines Engine
 * Turns institutional knowledge into controlled, reusable incident-response procedures.
 */

const { randomUUID } = require('crypto');
const { read, write } = require('../store');

const LIFECYCLE = ['draft', 'reviewed', 'approved', 'active', 'superseded', 'archived'];
const clamp = (n, min = 0, max = 1) => Math.min(max, Math.max(min, Number(n)));
const now = () => new Date().toISOString();
const asArray = v => Array.isArray(v) ? v : (v === undefined || v === null || v === '' ? [] : [v]);
const norm = v => String(v || '').trim().toLowerCase();

function parseStepsFromContent(content = '') {
  const lines = String(content).split('\n');
  const steps = [];
  lines.forEach(line => {
    const trimmed = line.trim();
    if (/^\d+[.)]\s+|^[-•]\s+/.test(trimmed)) {
      steps.push(trimmed.replace(/^\d+[.)]\s+|^[-•]\s+/, '').trim());
    }
  });
  return steps.slice(0, 12);
}

function normalizeSteps(steps, content = '') {
  let source = asArray(steps);
  if (!source.length) source = parseStepsFromContent(content);
  return source.map((step, index) => {
    if (typeof step === 'string') {
      return {
        id: `step-${index + 1}`,
        order: index + 1,
        action: step,
        required: true,
        owner_role: 'analyst',
        evidence_required: false,
        evidence_hint: '',
        success_criteria: ''
      };
    }
    return {
      id: step.id || `step-${index + 1}`,
      order: Number(step.order || index + 1),
      action: step.action || step.description || `Step ${index + 1}`,
      required: step.required !== false,
      owner_role: step.owner_role || 'analyst',
      evidence_required: Boolean(step.evidence_required),
      evidence_hint: step.evidence_hint || '',
      success_criteria: step.success_criteria || ''
    };
  }).sort((a, b) => a.order - b.order);
}

function normalizeRoutine(raw = {}, content = '') {
  const metrics = raw.metrics || {};
  const lifecycle = raw.lifecycle_status || (raw.enabled === false ? 'archived' : 'active');
  const completed = Number(metrics.completed_count ?? raw.times_applied ?? 0);
  const successful = Number(metrics.successful_count ?? Math.round((raw.success_rate ?? 0.5) * completed));
  const failed = Number(metrics.failed_count ?? Math.max(0, completed - successful));
  const accepted = Number(metrics.accepted_count ?? raw.times_applied ?? completed);
  const recommended = Number(metrics.recommended_count ?? accepted);
  const rejected = Number(metrics.rejected_count ?? 0);
  const partial = Number(metrics.partial_count ?? 0);
  const computedSuccess = completed ? successful / completed : Number(raw.success_rate ?? 0.5);

  return {
    enabled: raw.enabled !== false,
    lifecycle_status: LIFECYCLE.includes(lifecycle) ? lifecycle : 'draft',
    routine_version: String(raw.routine_version || '1.0'),
    category: raw.category || 'response-checklist',
    primary_goal: raw.primary_goal || '',
    payoff_weight: clamp(raw.payoff_weight ?? 0.5),
    payoff_rating: raw.payoff_rating ?? null,
    nist_function: raw.nist_function || 'RS',
    associated_scripts: asArray(raw.associated_scripts),
    institutional_enablers: asArray(raw.institutional_enablers),
    socio_technical_focus: raw.socio_technical_focus || 'both',
    success_rate: clamp(computedSuccess),
    times_applied: accepted,
    avg_resolution_time: raw.avg_resolution_time || '0h',
    avg_completion_seconds: Number(raw.avg_completion_seconds || 0),
    applicable_severities: asArray(raw.applicable_severities).length ? asArray(raw.applicable_severities).map(norm) : ['critical', 'high', 'medium', 'low'],
    applicable_incident_types: asArray(raw.applicable_incident_types),
    trigger_conditions: asArray(raw.trigger_conditions),
    required_roles: asArray(raw.required_roles).length ? asArray(raw.required_roles) : ['analyst', 'super_admin'],
    prerequisites: asArray(raw.prerequisites),
    steps: normalizeSteps(raw.steps, content),
    evidence_requirements: asArray(raw.evidence_requirements),
    expected_outcome: raw.expected_outcome || '',
    failure_conditions: asArray(raw.failure_conditions),
    escalation_conditions: asArray(raw.escalation_conditions),
    rollback_instructions: asArray(raw.rollback_instructions),
    application_risks: asArray(raw.application_risks),
    estimated_cost: raw.estimated_cost ?? null,
    estimated_time_to_resolve: raw.estimated_time_to_resolve ?? null,
    estimated_time_minutes: raw.estimated_time_minutes === null || raw.estimated_time_minutes === undefined || raw.estimated_time_minutes === '' ? null : Number(raw.estimated_time_minutes),
    routine_signature: asArray(raw.routine_signature),
    reviewed_by: raw.reviewed_by || null,
    reviewed_at: raw.reviewed_at || null,
    approved_by: raw.approved_by || null,
    approved_at: raw.approved_at || null,
    activated_by: raw.activated_by || null,
    activated_at: raw.activated_at || null,
    review_interval_days: Number(raw.review_interval_days || 180),
    next_review_at: raw.next_review_at || null,
    review_count: Number(raw.review_count || 0),
    review_history: asArray(raw.review_history),
    lifecycle_history: asArray(raw.lifecycle_history),
    metrics: {
      recommended_count: recommended,
      accepted_count: accepted,
      completed_count: completed,
      successful_count: successful,
      failed_count: failed,
      partial_count: partial,
      rejected_count: rejected,
      acceptance_rate: recommended ? accepted / recommended : null,
      completion_rate: accepted ? completed / accepted : null,
      success_rate: completed ? successful / completed : clamp(raw.success_rate ?? 0.5)
    }
  };
}

function isRoutineAvailableForIncident(incident, entry) {
  if (!entry.station_id || entry.global_routine) return true;
  if (!incident.station_id) return true;
  return entry.station_id === incident.station_id;
}

function getEntry(knowledgeId) {
  const knowledge = read('knowledge');
  const index = knowledge.findIndex(k => k.id === knowledgeId);
  if (index < 0) throw new Error('Knowledge entry not found');
  knowledge[index].defensive_routine = normalizeRoutine(knowledge[index].defensive_routine, knowledge[index].content);
  return { knowledge, index, entry: knowledge[index] };
}

function linkKnowledgeToRoutine(knowledgeId, routine, actor = {}) {
  const { knowledge, index, entry } = getEntry(knowledgeId);
  const existing = entry.defensive_routine || {};
  const merged = normalizeRoutine({ ...existing, ...routine }, entry.content);
  if (!existing.lifecycle_history?.length && !routine.lifecycle_status) {
    merged.lifecycle_status = existing.lifecycle_status || 'draft';
  }
  merged.lifecycle_history = [
    ...(existing.lifecycle_history || []),
    { at: now(), action: existing.enabled !== undefined ? 'definition_updated' : 'routine_created', by: actor.id || null, comment: routine.change_note || '' }
  ];
  entry.defensive_routine = merged;
  entry.knowledge_type = 'defensive-routine';
  knowledge[index] = entry;
  write('knowledge', knowledge);
  return entry;
}

function updateRoutineDefinition(knowledgeId, patch = {}, actor = {}) {
  const { knowledge, index, entry } = getEntry(knowledgeId);
  if (patch.title !== undefined) entry.title = patch.title;
  if (patch.content !== undefined) entry.content = patch.content;
  if (patch.tags !== undefined) entry.tags = asArray(patch.tags);
  if (patch.station_id !== undefined) entry.station_id = patch.station_id;
  const existing = entry.defensive_routine || {};
  const updated = normalizeRoutine({ ...existing, ...patch }, entry.content);
  updated.lifecycle_history = [
    ...(existing.lifecycle_history || []),
    { at: now(), action: 'definition_updated', by: actor.id || null, comment: patch.change_note || '' }
  ];
  entry.defensive_routine = updated;
  entry.knowledge_type = 'defensive-routine';
  knowledge[index] = entry;
  write('knowledge', knowledge);
  return entry;
}

function transitionRoutineLifecycle(knowledgeId, targetStatus, actor = {}, comment = '') {
  if (!LIFECYCLE.includes(targetStatus)) throw new Error('Invalid routine lifecycle status');
  const { knowledge, index, entry } = getEntry(knowledgeId);
  const r = entry.defensive_routine;
  const previous = r.lifecycle_status;
  const allowed = {
    draft:['reviewed','archived'],
    reviewed:['draft','approved','archived'],
    approved:['reviewed','active','archived'],
    active:['superseded','archived'],
    superseded:['archived'],
    archived:['draft']
  };
  if (targetStatus !== previous && !(allowed[previous] || []).includes(targetStatus)) {
    throw new Error(`Invalid lifecycle transition: ${previous} -> ${targetStatus}`);
  }
  r.lifecycle_status = targetStatus;
  r.lifecycle_history.push({ at: now(), from: previous, to: targetStatus, by: actor.id || null, comment });
  if (targetStatus === 'reviewed') {
    r.reviewed_by = actor.id || null;
    r.reviewed_at = now();
  }
  if (targetStatus === 'approved') {
    r.approved_by = actor.id || null;
    r.approved_at = now();
  }
  if (targetStatus === 'active') {
    r.enabled = true;
    r.activated_by = actor.id || null;
    r.activated_at = now();
    if (!r.next_review_at) r.next_review_at = new Date(Date.now() + r.review_interval_days * 86400000).toISOString();
    entry.status = 'active';
  }
  if (['superseded', 'archived'].includes(targetStatus)) {
    r.enabled = false;
    if (targetStatus === 'superseded') entry.status = 'superseded';
  }
  knowledge[index] = entry;
  write('knowledge', knowledge);
  return entry;
}

function createRoutineVersion(knowledgeId, changes = {}, actor = {}) {
  const knowledge = read('knowledge');
  const oldIndex = knowledge.findIndex(k => k.id === knowledgeId);
  if (oldIndex < 0) throw new Error('Routine not found');
  const old = knowledge[oldIndex];
  if (!old.defensive_routine) throw new Error('Knowledge entry is not a defensive routine');
  const oldRoutine = normalizeRoutine(old.defensive_routine, old.content);
  const oldVersion = parseFloat(oldRoutine.routine_version) || 1;
  const newVersion = changes.routine_version || (Math.floor(oldVersion) + 1).toFixed(1);
  const newId = 'k' + randomUUID().slice(0, 8);
  const newEntry = {
    ...old,
    id: newId,
    title: changes.title || old.title,
    content: changes.content || old.content,
    tags: changes.tags || old.tags,
    contributor_id: actor.id || old.contributor_id,
    confidence_score: changes.confidence_score ?? old.confidence_score,
    version: Number(old.version || 1) + 1,
    superseded_by: null,
    status: 'active',
    use_count: 0,
    last_used_at: null,
    created_at: now(),
    defensive_routine: normalizeRoutine({
      ...oldRoutine,
      ...changes,
      routine_version: newVersion,
      lifecycle_status: 'draft',
      enabled: true,
      reviewed_by: null,
      reviewed_at: null,
      approved_by: null,
      approved_at: null,
      activated_by: null,
      activated_at: null,
      lifecycle_history: [{ at: now(), action: 'new_version_created', by: actor.id || null, from_knowledge_id: old.id }]
    }, changes.content || old.content)
  };
  old.superseded_by = newId;
  old.status = 'superseded';
  old.defensive_routine = oldRoutine;
  old.defensive_routine.lifecycle_status = 'superseded';
  old.defensive_routine.enabled = false;
  old.defensive_routine.lifecycle_history.push({ at: now(), action: 'superseded', by: actor.id || null, superseded_by: newId });
  knowledge[oldIndex] = old;
  knowledge.push(newEntry);
  write('knowledge', knowledge);
  return newEntry;
}

function textIncludesCondition(text, condition) {
  const c = norm(condition);
  if (!c) return false;
  return text.includes(c) || c.split(/\s+/).filter(w => w.length > 3).some(w => text.includes(w));
}

function suggestRoutines(incident, context = {}) {
  const knowledge = read('knowledge');
  const candidates = [];
  const incidentText = norm(`${incident.title || ''} ${incident.type || ''} ${incident.description || ''} ${JSON.stringify(incident.entities || {})}`);
  const incidentType = norm(incident.type);
  const incidentSeverity = norm(incident.severity);

  knowledge.forEach(k => {
    if (!k.defensive_routine) return;
    const r = normalizeRoutine(k.defensive_routine, k.content);
    if (!r.enabled || r.lifecycle_status !== 'active' || k.status === 'superseded') return;
    if (!isRoutineAvailableForIncident(incident, k)) return;

    const typeMatch = !r.applicable_incident_types.length || r.applicable_incident_types.some(t => {
      const nt = norm(t);
      return nt === incidentType || incidentType.includes(nt) || nt.includes(incidentType);
    });
    const severityMatch = !r.applicable_severities.length || r.applicable_severities.includes(incidentSeverity);
    const tags = asArray(k.tags);
    const tagMatch = tags.some(tag => incidentText.includes(norm(tag)));
    const triggerHits = r.trigger_conditions.filter(c => textIncludesCondition(incidentText, c));
    const triggerScore = r.trigger_conditions.length ? triggerHits.length / r.trigger_conditions.length : (typeMatch || tagMatch ? 1 : 0.5);
    const roleEligible = !r.required_roles.length || r.required_roles.includes(context.actorRole) || context.actorRole === 'super_admin';
    const reviewDue = Boolean(r.next_review_at && new Date(r.next_review_at) < new Date());

    if (!(typeMatch || tagMatch || triggerHits.length) || !severityMatch) return;

    const confidenceScore = clamp((r.success_rate * 0.65) + ((k.confidence_score || 0.5) * 0.35));
    const usageScore = Math.min(r.metrics.completed_count / 10, 1);
    const matchScore = clamp(
      (typeMatch ? 0.25 : 0) +
      (tagMatch ? 0.10 : 0) +
      (triggerScore * 0.20) +
      (confidenceScore * 0.25) +
      (usageScore * 0.10) +
      (roleEligible ? 0.10 : 0) -
      (reviewDue ? 0.08 : 0)
    );
    const payoffRating = clamp((confidenceScore * 0.6) + (r.payoff_weight * 0.3) + (usageScore * 0.1));
    const matchReasons = [];
    if (typeMatch) matchReasons.push('incident type');
    if (tagMatch) matchReasons.push('knowledge tags');
    if (triggerHits.length) matchReasons.push(`${triggerHits.length} trigger condition${triggerHits.length === 1 ? '' : 's'}`);
    if (severityMatch) matchReasons.push('severity');

    candidates.push({
      knowledge_id: k.id,
      title: k.title,
      content_preview: `${String(k.content || '').substring(0, 220)}${String(k.content || '').length > 220 ? '...' : ''}`,
      match_score: matchScore,
      match_reasons: matchReasons,
      matched_triggers: triggerHits,
      role_eligible: roleEligible,
      review_due: reviewDue,
      payoff_rating: Number(payoffRating.toFixed(2)),
      defensive_routine: r,
      confidence_score: k.confidence_score || 0.5,
      contributor_name: getContributorName(k.contributor_id),
      last_used: k.last_used_at,
      use_count: k.use_count || 0,
      tags
    });
  });

  candidates.sort((a, b) => b.match_score - a.match_score);
  return {
    incident_id: incident.id,
    total_candidates: candidates.length,
    top_recommendations: candidates.slice(0, 5),
    all_recommendations: candidates
  };
}

function recordRoutineRecommendation(knowledgeId, incidentId) {
  const { knowledge, index, entry } = getEntry(knowledgeId);
  const incidents = read('incidents');
  const incIndex = incidents.findIndex(i => i.id === incidentId);
  if (incIndex < 0) throw new Error('Incident not found');
  const incident = incidents[incIndex];
  incident.recommended_defensive_routines = incident.recommended_defensive_routines || [];
  const already = incident.recommended_defensive_routines.some(x => (typeof x === 'string' ? x : x.knowledge_id) === knowledgeId);
  if (!already) {
    incident.recommended_defensive_routines.push({ knowledge_id: knowledgeId, recommended_at: now() });
    entry.defensive_routine.metrics.recommended_count += 1;
    recomputeMetrics(entry.defensive_routine);
    knowledge[index] = entry;
    incidents[incIndex] = incident;
    write('knowledge', knowledge);
    write('incidents', incidents);
  }
  return !already;
}

function rejectRoutineRecommendation(knowledgeId, incidentId, actor = {}, reason = '') {
  const { knowledge, index, entry } = getEntry(knowledgeId);
  const incidents = read('incidents');
  const incIndex = incidents.findIndex(i => i.id === incidentId);
  if (incIndex < 0) throw new Error('Incident not found');
  const incident = incidents[incIndex];
  incident.rejected_defensive_routines = incident.rejected_defensive_routines || [];
  const already = incident.rejected_defensive_routines.some(x => x.knowledge_id === knowledgeId);
  if (!already) {
    incident.rejected_defensive_routines.push({ knowledge_id: knowledgeId, rejected_at: now(), rejected_by: actor.id || null, reason });
    entry.defensive_routine.metrics.rejected_count += 1;
    recomputeMetrics(entry.defensive_routine);
    knowledge[index] = entry;
    incidents[incIndex] = incident;
    write('knowledge', knowledge);
    write('incidents', incidents);
  }
  return entry;
}

function startRoutineExecution(knowledgeId, incidentId, actor = {}, notes = '') {
  const { knowledge, index, entry } = getEntry(knowledgeId);
  const r = entry.defensive_routine;
  if (!r.enabled || r.lifecycle_status !== 'active') throw new Error('Routine is not active');
  if (r.required_roles.length && !r.required_roles.includes(actor.role) && actor.role !== 'super_admin') {
    throw new Error(`Routine requires one of these roles: ${r.required_roles.join(', ')}`);
  }
  const incidents = read('incidents');
  const incIndex = incidents.findIndex(i => i.id === incidentId);
  if (incIndex < 0) throw new Error('Incident not found');
  const executions = read('routine_executions');
  const existing = executions.find(x => x.incident_id === incidentId && x.knowledge_id === knowledgeId && x.status === 'in-progress');
  if (existing) return existing;

  // Ensure the acceptance has a recommendation denominator.
  recordRoutineRecommendation(knowledgeId, incidentId);
  const incidentsRefreshed = read('incidents');
  const refreshedIncidentIndex = incidentsRefreshed.findIndex(i => i.id === incidentId);
  const refreshed = getEntry(knowledgeId);
  const routine = refreshed.entry.defensive_routine;
  const execution = {
    id: 'rex' + randomUUID().slice(0, 8),
    incident_id: incidentId,
    knowledge_id: knowledgeId,
    routine_title: entry.title,
    routine_version: routine.routine_version,
    status: 'in-progress',
    outcome: null,
    accepted_at: now(),
    accepted_by: actor.id || null,
    accepted_by_role: actor.role || null,
    notes,
    completed_at: null,
    completion_summary: '',
    steps: routine.steps.map(s => ({ ...s, completed: false, completed_at: null, completed_by: null, evidence: '', notes: '' }))
  };
  executions.push(execution);
  write('routine_executions', executions);

  const knowledge2 = read('knowledge');
  const kidx = knowledge2.findIndex(k => k.id === knowledgeId);
  knowledge2[kidx].defensive_routine = normalizeRoutine(knowledge2[kidx].defensive_routine, knowledge2[kidx].content);
  knowledge2[kidx].defensive_routine.metrics.accepted_count += 1;
  knowledge2[kidx].defensive_routine.times_applied = knowledge2[kidx].defensive_routine.metrics.accepted_count;
  knowledge2[kidx].use_count = (knowledge2[kidx].use_count || 0) + 1;
  knowledge2[kidx].last_used_at = now();
  recomputeMetrics(knowledge2[kidx].defensive_routine);
  write('knowledge', knowledge2);

  const incident = incidentsRefreshed[refreshedIncidentIndex];
  incident.used_knowledge_ids = incident.used_knowledge_ids || [];
  if (!incident.used_knowledge_ids.includes(knowledgeId)) incident.used_knowledge_ids.push(knowledgeId);
  incident.applied_defensive_routines = incident.applied_defensive_routines || [];
  incident.applied_defensive_routines.push({ knowledge_id: knowledgeId, title: entry.title, execution_id: execution.id, applied_at: execution.accepted_at, outcome: 'in-progress' });
  incidentsRefreshed[refreshedIncidentIndex] = incident;
  write('incidents', incidentsRefreshed);
  return execution;
}

function updateRoutineStep(executionId, stepId, actor = {}, update = {}) {
  const executions = read('routine_executions');
  const eidx = executions.findIndex(x => x.id === executionId);
  if (eidx < 0) throw new Error('Routine execution not found');
  const execution = executions[eidx];
  if (execution.status !== 'in-progress') throw new Error('Routine execution is already completed');
  const sidx = execution.steps.findIndex(s => s.id === stepId);
  if (sidx < 0) throw new Error('Routine step not found');
  const step = execution.steps[sidx];
  const completed = update.completed !== undefined ? Boolean(update.completed) : step.completed;
  const evidence = update.evidence !== undefined ? String(update.evidence || '') : step.evidence;
  if (completed && step.evidence_required && !evidence.trim()) throw new Error('Evidence is required before completing this step');
  execution.steps[sidx] = {
    ...step,
    completed,
    evidence,
    notes: update.notes !== undefined ? String(update.notes || '') : step.notes,
    completed_at: completed ? (step.completed_at || now()) : null,
    completed_by: completed ? (actor.id || null) : null
  };
  execution.updated_at = now();
  executions[eidx] = execution;
  write('routine_executions', executions);
  return execution;
}

function recomputeMetrics(routine) {
  const m = routine.metrics;
  routine.success_rate = m.completed_count ? m.successful_count / m.completed_count : clamp(routine.success_rate ?? 0.5);
  m.acceptance_rate = m.recommended_count ? m.accepted_count / m.recommended_count : null;
  m.completion_rate = m.accepted_count ? m.completed_count / m.accepted_count : null;
  m.success_rate = m.completed_count ? m.successful_count / m.completed_count : routine.success_rate;
  routine.times_applied = m.accepted_count;
  const payoffWeight = routine.payoff_weight || 0.5;
  routine.payoff_rating = Number(((routine.success_rate * 0.7) + (payoffWeight * 0.3)).toFixed(2));
}

function completeRoutineExecution(executionId, actor = {}, completion = {}) {
  const executions = read('routine_executions');
  const eidx = executions.findIndex(x => x.id === executionId);
  if (eidx < 0) throw new Error('Routine execution not found');
  const execution = executions[eidx];
  if (execution.status === 'completed') return execution;
  const outcome = completion.outcome || 'successful';
  if (!['successful', 'partial', 'failed'].includes(outcome)) throw new Error('Outcome must be successful, partial, or failed');
  const requiredIncomplete = execution.steps.filter(s => s.required && !s.completed);
  if (outcome === 'successful' && requiredIncomplete.length) {
    throw new Error(`Complete all required steps before marking successful (${requiredIncomplete.length} remaining)`);
  }
  execution.status = 'completed';
  execution.outcome = outcome;
  execution.completed_at = now();
  execution.completed_by = actor.id || null;
  execution.completion_summary = completion.summary || '';
  execution.outcome_evidence = completion.evidence || '';
  execution.escalated = Boolean(completion.escalated);
  execution.rollback_used = Boolean(completion.rollback_used);
  executions[eidx] = execution;
  write('routine_executions', executions);

  const knowledge = read('knowledge');
  const kidx = knowledge.findIndex(k => k.id === execution.knowledge_id);
  if (kidx >= 0) {
    const r = normalizeRoutine(knowledge[kidx].defensive_routine, knowledge[kidx].content);
    r.metrics.completed_count += 1;
    if (outcome === 'successful') r.metrics.successful_count += 1;
    else if (outcome === 'partial') r.metrics.partial_count += 1;
    else r.metrics.failed_count += 1;
    const durationSeconds = Math.max(0, Math.round((new Date(execution.completed_at) - new Date(execution.accepted_at)) / 1000));
    const previousCompleted = Math.max(0, r.metrics.completed_count - 1);
    r.avg_completion_seconds = previousCompleted
      ? Math.round(((r.avg_completion_seconds || 0) * previousCompleted + durationSeconds) / r.metrics.completed_count)
      : durationSeconds;
    recomputeMetrics(r);
    knowledge[kidx].defensive_routine = r;
    knowledge[kidx].confidence_score = clamp((knowledge[kidx].confidence_score || 0.5) + (outcome === 'successful' ? 0.04 : outcome === 'failed' ? -0.03 : 0));
    write('knowledge', knowledge);
  }

  const incidents = read('incidents');
  const iidx = incidents.findIndex(i => i.id === execution.incident_id);
  if (iidx >= 0) {
    const applications = incidents[iidx].applied_defensive_routines || [];
    const app = applications.find(a => a.execution_id === execution.id);
    if (app) {
      app.outcome = outcome;
      app.completed_at = execution.completed_at;
      app.summary = execution.completion_summary;
    }
    incidents[iidx].applied_defensive_routines = applications;
    write('incidents', incidents);
  }
  return execution;
}

function getRoutineExecutionsForIncident(incidentId) {
  return read('routine_executions').filter(x => x.incident_id === incidentId).sort((a, b) => new Date(b.accepted_at) - new Date(a.accepted_at));
}

// Compatibility endpoint for previous UI: start + complete immediately.
function recordRoutineApplication(knowledgeId, incidentId, outcome = {}, actor = {}) {
  const execution = startRoutineExecution(knowledgeId, incidentId, actor, outcome.notes || '');
  if (execution.status === 'completed') return getEntry(knowledgeId).entry;
  const executions = read('routine_executions');
  const idx = executions.findIndex(x => x.id === execution.id);
  // Older one-click behavior marks all required steps complete without claiming evidence.
  executions[idx].steps = executions[idx].steps.map(s => ({ ...s, completed: true, completed_at: now(), completed_by: actor.id || null }));
  write('routine_executions', executions);
  completeRoutineExecution(execution.id, actor, { outcome: outcome.success === false ? 'failed' : 'successful', summary: outcome.summary || 'Legacy one-click application' });
  return getEntry(knowledgeId).entry;
}

function reviewRoutineEffectiveness(incidentId, knowledgeId, review = {}) {
  const incidents = read('incidents');
  const incident = incidents.find(i => i.id === incidentId);
  if (!incident) throw new Error('Incident not found');
  if (incident.status !== 'closed') throw new Error('Incident must be closed before review');
  const { knowledge, index, entry } = getEntry(knowledgeId);
  const r = entry.defensive_routine;
  const rating = clamp(review.rating ?? 0.5);
  r.review_count += 1;
  r.last_reviewed_at = now();
  r.reviewed_at = r.last_reviewed_at;
  r.reviewed_by = review.reviewed_by || null;
  r.next_review_at = new Date(Date.now() + r.review_interval_days * 86400000).toISOString();
  r.review_history.push({
    review_id: 'rev' + randomUUID().slice(0, 8),
    incident_id: incidentId,
    reviewed_at: r.last_reviewed_at,
    reviewed_by: review.reviewed_by || null,
    rating,
    comments: review.comments || ''
  });
  // Review rating nudges confidence rather than fabricating a new success event.
  entry.confidence_score = clamp(((entry.confidence_score || 0.5) * 0.85) + (rating * 0.15));
  knowledge[index] = entry;
  write('knowledge', knowledge);
  return entry;
}

function getRoutineMetrics(station_id) {
  const knowledge = read('knowledge');
  let routines = knowledge.filter(k => k.defensive_routine).map(k => ({ ...k, defensive_routine: normalizeRoutine(k.defensive_routine, k.content) }));
  if (station_id) routines = routines.filter(r => r.global_routine || r.station_id === station_id);
  const active = routines.filter(r => r.defensive_routine.enabled && r.defensive_routine.lifecycle_status === 'active');
  const sum = key => active.reduce((s, r) => s + Number(r.defensive_routine.metrics[key] || 0), 0);
  const completed = sum('completed_count');
  const recommended = sum('recommended_count');
  const accepted = sum('accepted_count');
  const successful = sum('successful_count');
  const nowDate = new Date();
  return {
    total_routines: routines.length,
    active_routines: active.length,
    draft_routines: routines.filter(r => r.defensive_routine.lifecycle_status === 'draft').length,
    review_due: active.filter(r => r.defensive_routine.next_review_at && new Date(r.defensive_routine.next_review_at) < nowDate).length,
    highly_effective: active.filter(r => r.defensive_routine.success_rate >= 0.85 && r.defensive_routine.metrics.completed_count > 0).length,
    moderately_effective: active.filter(r => r.defensive_routine.success_rate >= 0.6 && r.defensive_routine.success_rate < 0.85 && r.defensive_routine.metrics.completed_count > 0).length,
    needs_improvement: active.filter(r => r.defensive_routine.success_rate < 0.6 && r.defensive_routine.metrics.completed_count > 0).length,
    avg_success_rate: completed ? Number((successful / completed * 100).toFixed(1)) : 0,
    acceptance_rate: recommended ? Number((accepted / recommended * 100).toFixed(1)) : null,
    completion_rate: accepted ? Number((completed / accepted * 100).toFixed(1)) : null,
    total_recommended: recommended,
    total_accepted: accepted,
    total_completed: completed,
    total_successful: successful,
    avg_payoff_weight: active.length ? Number((active.reduce((s, r) => s + r.defensive_routine.payoff_weight, 0) / active.length).toFixed(2)) : 0,
    avg_payoff_rating: active.length ? Number((active.reduce((s, r) => s + (r.defensive_routine.payoff_rating || 0), 0) / active.length).toFixed(2)) : 0,
    most_applied: [...active].sort((a, b) => b.defensive_routine.metrics.accepted_count - a.defensive_routine.metrics.accepted_count).slice(0, 5).map(r => ({
      id: r.id, title: r.title, times_applied: r.defensive_routine.metrics.accepted_count, success_rate: `${(r.defensive_routine.success_rate * 100).toFixed(1)}%`
    })),
    highest_success: [...active].filter(r => r.defensive_routine.metrics.completed_count >= 1).sort((a, b) => b.defensive_routine.success_rate - a.defensive_routine.success_rate).slice(0, 5).map(r => ({
      id: r.id, title: r.title, success_rate: `${(r.defensive_routine.success_rate * 100).toFixed(1)}%`, times_applied: r.defensive_routine.metrics.accepted_count
    }))
  };
}

function createResponseChecklist(incidentId) {
  const incident = read('incidents').find(i => i.id === incidentId);
  if (!incident) throw new Error('Incident not found');
  const suggestions = suggestRoutines(incident);
  return {
    id: 'chk' + randomUUID().slice(0, 8),
    incident_id: incidentId,
    status: 'in-progress',
    created_at: now(),
    items: suggestions.top_recommendations.flatMap((routine, ridx) => routine.defensive_routine.steps.map(step => ({
      id: `${routine.knowledge_id}:${step.id}`,
      routine_id: routine.knowledge_id,
      routine_title: routine.title,
      priority: ridx === 0 ? 'critical' : ridx < 2 ? 'high' : 'medium',
      description: step.action,
      required: step.required,
      evidence_required: step.evidence_required,
      success_criteria: step.success_criteria,
      completed: false,
      completed_at: null,
      completed_by: null,
      notes: null
    })))
  };
}

function getContributorName(userId) {
  const user = (read('users') || []).find(u => u.id === userId);
  return user ? user.name : 'Unknown';
}

function analyzeCoverage(station_id) {
  const knowledge = read('knowledge');
  const incidents = read('incidents');
  let routines = knowledge.filter(k => k.defensive_routine).map(k => ({ ...k, defensive_routine: normalizeRoutine(k.defensive_routine, k.content) }))
    .filter(k => k.defensive_routine.enabled && k.defensive_routine.lifecycle_status === 'active');
  if (station_id) routines = routines.filter(r => r.global_routine || r.station_id === station_id);
  const incidentsByType = {};
  incidents.forEach(inc => { (incidentsByType[inc.type] ||= []).push(inc); });
  const coverage = {};
  Object.entries(incidentsByType).forEach(([type, incs]) => {
    const covered = routines.filter(r => r.defensive_routine.applicable_incident_types.some(t => norm(t) === norm(type) || norm(type).includes(norm(t))) || r.tags?.some(tag => norm(type).includes(norm(tag)))).length;
    coverage[type] = {
      total_incidents: incs.length,
      covered_by_routines: covered > 0 ? 'Yes' : 'No',
      available_routines: covered,
      coverage_percentage: routines.length ? Math.round((covered / routines.length) * 100) : 0
    };
  });
  const nistFunctionCounts = routines.reduce((counts, r) => {
    const fn = r.defensive_routine.nist_function || 'RS';
    counts[fn] = (counts[fn] || 0) + 1;
    return counts;
  }, {});
  return {
    total_routines: routines.length,
    incident_types_covered: Object.keys(coverage).filter(t => coverage[t].covered_by_routines === 'Yes').length,
    coverage_by_type: coverage,
    nist_function_counts: nistFunctionCounts,
    gaps: Object.entries(coverage).filter(([, data]) => data.covered_by_routines === 'No').map(([type]) => `${type} - Consider creating a defensive routine`)
  };
}

module.exports = {
  LIFECYCLE,
  normalizeRoutine,
  linkKnowledgeToRoutine,
  updateRoutineDefinition,
  transitionRoutineLifecycle,
  createRoutineVersion,
  suggestRoutines,
  recordRoutineRecommendation,
  rejectRoutineRecommendation,
  startRoutineExecution,
  updateRoutineStep,
  completeRoutineExecution,
  getRoutineExecutionsForIncident,
  recordRoutineApplication,
  reviewRoutineEffectiveness,
  getRoutineMetrics,
  createResponseChecklist,
  analyzeCoverage
};
