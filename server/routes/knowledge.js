const express = require('express');
const { v4: uuid } = require('uuid');
const { read, write } = require('../store');
const { authenticate } = require('../middleware/auth');
const { requireMinRole } = require('../middleware/rbac');
const { logAction } = require('./audit');
const defensiveRoutines = require('../logic/defensive-routines');
const email = require('../logic/email');
const { recordEvent } = require('../services/incidentEvents');
const router = express.Router();

router.get('/', authenticate, (req,res) => {
  const { status, tag, knowledge_type, station_id, scope } = req.query;
  const users = read('users');
  let f = read('knowledge');
  if (status) f = f.filter(k => k.status===status);
  else f = f.filter(k => k.status!=='superseded');
  if (tag)            f = f.filter(k => k.tags.includes(tag));
  if (knowledge_type) f = f.filter(k => k.knowledge_type===knowledge_type);
  if (station_id) f = f.filter(k => k.station_id===station_id);
  if (scope==='local' && req.user.station_id) f = f.filter(k => k.station_id===req.user.station_id);
  res.json(f.sort((a,b)=>b.confidence_score-a.confidence_score).map(k => {
    const c=users.find(u=>u.id===k.contributor_id); return {...k, contributor_name:c?c.name:'Unknown'};
  }));
});

router.get('/:id', authenticate, (req,res) => {
  const knowledge=read('knowledge'), users=read('users'), annotations=read('annotations');
  const entry = knowledge.find(k => k.id===req.params.id);
  if (!entry) return res.status(404).json({ error:'Not found' });
  const c = users.find(u=>u.id===entry.contributor_id);
  const versions = knowledge.filter(k=>k.id===entry.id||k.superseded_by===entry.id||entry.superseded_by===k.id);
  res.json({ ...entry, contributor_name:c?c.name:'Unknown',
    annotations: annotations.filter(a=>a.knowledge_id===entry.id).map(a=>{const u=users.find(u=>u.id===a.user_id);return{...a,user_name:u?u.name:'Unknown'};}),
    version_history: versions });
});

router.post('/', authenticate, requireMinRole('analyst'), (req,res) => {
  const { title, content, tags, incident_id, knowledge_type, station_id } = req.body;
  if (!title||!content) return res.status(400).json({ error:'title and content required' });
  const knowledge = read('knowledge');
  const newEntry = { id:'k'+uuid().slice(0,8), title, content, tags:tags||[], incident_id:incident_id||null,
    knowledge_type: knowledge_type||'lessons-learned', contributor_id:req.user.id,
    station_id: station_id || req.user.station_id || '',
    confidence_score:1.0, version:1, superseded_by:null, status:'active',
    use_count:0, last_used_at:null, created_at:new Date().toISOString() };
  knowledge.push(newEntry); write('knowledge', knowledge);
  if (incident_id) {
    const incident = read('incidents').find(i => i.id === incident_id);
    if (incident?.operational_test_id) recordEvent({ operationalTestId:incident.operational_test_id, incidentId:incident_id, eventType:'KNOWLEDGE_CREATED', actorId:req.user.id, actorRole:req.user.role, source:'knowledge-capture', details:{ knowledge_id:newEntry.id } });
  }
  logAction({ userId:req.user.id, action:'CREATE_KNOWLEDGE', targetType:'knowledge', targetId:newEntry.id, metadata:{ title, knowledge_type:newEntry.knowledge_type, station_id:newEntry.station_id } });
  res.status(201).json(newEntry);
});

router.put('/:id', authenticate, requireMinRole('analyst'), (req,res) => {
  const knowledge = read('knowledge');
  const idx = knowledge.findIndex(k => k.id===req.params.id);
  if (idx===-1) return res.status(404).json({ error:'Not found' });
  const old = knowledge[idx];
  if (req.body.new_version) {
    const newEntry = { id:'k'+uuid().slice(0,8), title:req.body.title||old.title, content:req.body.content||old.content,
      tags:req.body.tags||old.tags, incident_id:old.incident_id, knowledge_type:old.knowledge_type,
      contributor_id:req.user.id, confidence_score:1.0, version:old.version+1,
      superseded_by:null, status:'active', use_count:0, last_used_at:null, created_at:new Date().toISOString() };
    knowledge[idx].superseded_by=newEntry.id; knowledge[idx].status='superseded';
    knowledge.push(newEntry); write('knowledge', knowledge);
    return res.status(201).json(newEntry);
  }
  ['title','content','tags','status','knowledge_type'].forEach(f => { if (req.body[f]!==undefined) knowledge[idx][f]=req.body[f]; });
  write('knowledge', knowledge);
  logAction({ userId:req.user.id, action:'UPDATE_KNOWLEDGE', targetType:'knowledge', targetId:req.params.id });
  res.json(knowledge[idx]);
});

router.post('/:id/use', authenticate, (req,res) => {
  const { incident_id, operational_test_id } = req.body || {};
  const knowledge = read('knowledge');
  const idx = knowledge.findIndex(k => k.id===req.params.id);
  if (idx===-1) return res.status(404).json({ error:'Not found' });
  knowledge[idx].use_count+=1; knowledge[idx].last_used_at=new Date().toISOString();
  knowledge[idx].confidence_score=Math.min(1.0, knowledge[idx].confidence_score+0.02);
  write('knowledge', knowledge);
  const incident = incident_id ? read('incidents').find(i => i.id === incident_id) : null;
  const testId = operational_test_id || incident?.operational_test_id;
  if (testId) {
    // Access/retrieval is captured when the analyst finds the item. Explicitly marking
    // it as used records application, keeping Knowledge Retrieval and Utilization distinct.
    recordEvent({ operationalTestId:testId, incidentId:incident_id || incident?.id, eventType:'KNOWLEDGE_APPLIED', actorId:req.user.id, actorRole:req.user.role, source:'knowledge-use', details:{ knowledge_id:req.params.id }, allowDuplicate:true });
  }
  logAction({ userId:req.user.id, action:'USE_KNOWLEDGE', targetType:'knowledge', targetId:req.params.id });
  res.json({ success:true, use_count:knowledge[idx].use_count });
});

router.post('/:id/annotate', authenticate, requireMinRole('analyst'), (req,res) => {
  const { note } = req.body;
  if (!note) return res.status(400).json({ error:'note required' });
  const knowledge = read('knowledge');
  if (!knowledge.find(k=>k.id===req.params.id)) return res.status(404).json({ error:'Not found' });
  const annotations = read('annotations');
  const newA = { id:'a'+uuid().slice(0,8), knowledge_id:req.params.id, user_id:req.user.id, note, created_at:new Date().toISOString() };
  annotations.push(newA); write('annotations', annotations);
  logAction({ userId:req.user.id, action:'ANNOTATE_KNOWLEDGE', targetType:'knowledge', targetId:req.params.id });
  const u = read('users').find(u=>u.id===req.user.id);
  res.status(201).json({ ...newA, user_name:u?u.name:'Unknown' });
});

router.post('/:id/push-to-hub', authenticate, requireMinRole('analyst'), (req,res) => {
  const knowledge = read('knowledge');
  const idx = knowledge.findIndex(k => k.id===req.params.id);
  if (idx===-1) return res.status(404).json({ error:'Knowledge entry not found' });
  knowledge[idx].sync_status = 'pending';
  knowledge[idx].source_station = knowledge[idx].station_id || req.user.station_id || 'Local Site';
  knowledge[idx].pushed_at = new Date().toISOString();
  write('knowledge', knowledge);
  logAction({ userId:req.user.id, action:'PUSH_ROUTINE_TO_HUB', targetType:'knowledge', targetId:req.params.id, metadata:{ station_id:knowledge[idx].station_id } });
  res.json({ success:true, entry:knowledge[idx] });
});

router.post('/:id/approve', authenticate, requireMinRole('super_admin'), (req,res) => {
  const knowledge = read('knowledge');
  const idx = knowledge.findIndex(k => k.id===req.params.id);
  if (idx===-1) return res.status(404).json({ error:'Knowledge entry not found' });
  knowledge[idx].sync_status = 'approved';
  knowledge[idx].approved_by = req.user.id;
  knowledge[idx].approved_at = new Date().toISOString();
  knowledge[idx].global_routine = true;
  write('knowledge', knowledge);
  logAction({ userId:req.user.id, action:'APPROVE_GLOBAL_ROUTINE', targetType:'knowledge', targetId:req.params.id, metadata:{ station_id:knowledge[idx].station_id } });
  
  // Trigger knowledge alerts for analysts at different stations
  const users = read('users');
  const notifs = read('notifications');
  const entry = knowledge[idx];
  const stationAnalysts = users.filter(u => 
    u.station_id && 
    u.station_id !== entry.station_id && 
    (u.role === 'analyst' || u.role === 'super_admin')
  );
  stationAnalysts.forEach(analyst => {
    const notification = {
      id: Date.now().toString() + Math.random(),
      title: `💡 Knowledge Shared from ${entry.station_id}`,
      message: `New defensive routine: ${entry.title}`,
      type: 'knowledge_alert',
      recipient_id: analyst.id,
      recipient_station_id: analyst.station_id,
      severity: 'normal',
      related_knowledge_id: entry.id,
      action_url: `/knowledge/${entry.id}`,
      read: false,
      created_at: new Date().toISOString(),
      created_by: 'SYSTEM'
    };
    notifs.push(notification);
  });
  write('notifications', notifs);

  const knowledgeAnalysts = read('users').filter(u => u.role === 'analyst');
  knowledgeAnalysts.forEach(async analyst => {
    try {
      await email.sendSystemEmail({
        to: analyst.email,
        subject: `KALRO Knowledge Update: New Institutional Memory Asset Approved`,
        html: email.buildRoutineApprovalEmail(entry, req.user),
        station_id: entry.station_id || 'HQ'
      });
    } catch (err) {
      console.error('Failed to send knowledge approval email', err);
    }
  });
  
  res.json({ success:true, entry:knowledge[idx] });
});

router.get('/sync/pending', authenticate, requireMinRole('super_admin'), (req,res) => {
  const knowledge = read('knowledge');
  const pending = knowledge.filter(k => k.sync_status==='pending');
  res.json(pending);
});

router.get('/sync/global-routines', authenticate, (req,res) => {
  const knowledge = read('knowledge');
  const global = knowledge.filter(k => k.global_routine && k.status==='active');
  res.json(global);
});

// ─── NEW: DEFENSIVE ROUTINES ──────────────────────────────────────────────

router.post('/:id/link-routine', authenticate, requireMinRole('analyst'), (req,res) => {
  try {
    const entry = defensiveRoutines.linkKnowledgeToRoutine(req.params.id, req.body || {}, { id:req.user.id, role:req.user.role });
    logAction({
      userId: req.user.id,
      action: 'LINK_KNOWLEDGE_ROUTINE',
      targetType: 'knowledge',
      targetId: req.params.id,
      metadata: { category: entry.defensive_routine?.category, lifecycle_status: entry.defensive_routine?.lifecycle_status }
    });
    res.json(entry);
  } catch(err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/from-pir/:pirId', authenticate, requireMinRole('super_admin'), (req,res) => {
  const pirs = read('pirs');
  const knowledge = read('knowledge');
  const incidents = read('incidents');
  const pir = pirs.find(p => p.id === req.params.pirId);
  if (!pir) return res.status(404).json({ error:'PIR not found' });
  if (pir.status === 'converted') return res.status(409).json({ error:'PIR already converted' });

  const incident = incidents.find(i => i.id === pir.incident_id);
  const newEntry = {
    id:'k'+uuid().slice(0,8),
    title: req.body.title || `Routine from PIR: ${incident ? incident.title : pir.incident_id}`,
    content: req.body.content || `${pir.root_cause || ''}\n\nWhat worked:\n${pir.what_worked || 'N/A'}\n\nWhat failed:\n${pir.what_failed || 'N/A'}`,
    tags: req.body.tags || (incident ? [incident.type, ...(incident.entities?.tags||[])] : []),
    incident_id: pir.incident_id,
    knowledge_type: 'defensive-routine',
    contributor_id: req.user.id,
    station_id: incident?.station_id || req.body.station_id || req.user.station_id || '',
    confidence_score: 0.75,
    version: 1,
    superseded_by: null,
    status: 'active',
    use_count: 0,
    last_used_at: null,
    created_at: new Date().toISOString()
  };
  newEntry.defensive_routine = defensiveRoutines.normalizeRoutine({
    ...req.body,
    lifecycle_status: req.body.lifecycle_status || 'draft',
    enabled: true,
    applicable_incident_types: req.body.applicable_incident_types || (incident ? [incident.type] : []),
    routine_signature: req.body.routine_signature || (incident ? [incident.type] : []),
    lifecycle_history: [{ at:new Date().toISOString(), action:'created_from_pir', by:req.user.id, pir_id:pir.id }]
  }, newEntry.content);

  knowledge.push(newEntry);
  pir.status = 'converted';
  write('pirs', pirs);
  write('knowledge', knowledge);
  logAction({
    userId: req.user.id,
    action: 'CONVERT_PIR_TO_ROUTINE',
    targetType: 'knowledge',
    targetId: newEntry.id,
    metadata: { pir_id: pir.id, incident_id: pir.incident_id }
  });
  res.status(201).json(newEntry);
});

router.post('/defensive-routines', authenticate, requireMinRole('analyst'), (req,res) => {
  const { title, content, tags, station_id } = req.body || {};
  if (!title || !content) return res.status(400).json({ error:'title and content required' });
  const knowledge = read('knowledge');
  const newEntry = {
    id:'k'+uuid().slice(0,8),
    title,
    content,
    tags: Array.isArray(tags) ? tags : [],
    incident_id:req.body.incident_id || null,
    knowledge_type:'defensive-routine',
    contributor_id:req.user.id,
    station_id:station_id || req.user.station_id || '',
    confidence_score:Number(req.body.confidence_score ?? 0.7),
    version:1,
    superseded_by:null,
    status:'active',
    use_count:0,
    last_used_at:null,
    created_at:new Date().toISOString(),
    defensive_routine:defensiveRoutines.normalizeRoutine({
      ...req.body,
      lifecycle_status:req.body.lifecycle_status || 'draft',
      enabled:true,
      lifecycle_history:[{ at:new Date().toISOString(), action:'routine_created', by:req.user.id }]
    }, content)
  };
  knowledge.push(newEntry);
  write('knowledge', knowledge);
  logAction({ userId:req.user.id, action:'CREATE_DEFENSIVE_ROUTINE', targetType:'knowledge', targetId:newEntry.id, metadata:{ lifecycle_status:newEntry.defensive_routine.lifecycle_status } });
  res.status(201).json(newEntry);
});

router.get('/defensive-routines/list', authenticate, (req,res) => {
  const knowledge = read('knowledge');
  const users = read('users');
  const routines = knowledge.filter(k => k.defensive_routine).map(r => {
    const routine = defensiveRoutines.normalizeRoutine(r.defensive_routine, r.content);
    const contributor = users.find(u => u.id === r.contributor_id);
    return {
      id: r.id,
      title: r.title,
      content: r.content,
      knowledge_type: r.knowledge_type,
      tags: r.tags || [],
      contributor_name: contributor?.name || 'Unknown',
      confidence_score: r.confidence_score,
      last_used_at: r.last_used_at,
      station_id: r.station_id || '',
      global_routine: Boolean(r.global_routine),
      version: r.version,
      superseded_by: r.superseded_by,
      ...routine,
      metrics: routine.metrics
    };
  });
  const status = req.query.lifecycle_status;
  const filtered = status ? routines.filter(r => r.lifecycle_status === status) : routines;
  res.json(filtered.sort((a,b) => {
    if (a.lifecycle_status === 'active' && b.lifecycle_status !== 'active') return -1;
    if (b.lifecycle_status === 'active' && a.lifecycle_status !== 'active') return 1;
    return b.success_rate - a.success_rate;
  }));
});

router.get('/defensive-routines/metrics', authenticate, (req,res) => {
  try { res.json(defensiveRoutines.getRoutineMetrics(req.query.station_id)); }
  catch(err) { res.status(500).json({ error: err.message }); }
});

router.get('/defensive-routines/coverage', authenticate, (req,res) => {
  try { res.json(defensiveRoutines.analyzeCoverage(req.query.station_id)); }
  catch(err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id/routine', authenticate, requireMinRole('analyst'), (req,res) => {
  try {
    const entry = defensiveRoutines.updateRoutineDefinition(req.params.id, req.body || {}, { id:req.user.id, role:req.user.role });
    logAction({ userId:req.user.id, action:'UPDATE_DEFENSIVE_ROUTINE', targetType:'knowledge', targetId:req.params.id, metadata:{ change_note:req.body.change_note || '' } });
    res.json(entry);
  } catch(err) { res.status(400).json({ error:err.message }); }
});

router.post('/:id/routine-lifecycle', authenticate, requireMinRole('super_admin'), (req,res) => {
  try {
    const { status, comment } = req.body || {};
    const entry = defensiveRoutines.transitionRoutineLifecycle(req.params.id, status, { id:req.user.id, role:req.user.role }, comment || '');
    logAction({ userId:req.user.id, action:'ROUTINE_LIFECYCLE_CHANGE', targetType:'knowledge', targetId:req.params.id, metadata:{ status, comment } });
    res.json(entry);
  } catch(err) { res.status(400).json({ error:err.message }); }
});

router.post('/:id/routine-version', authenticate, requireMinRole('super_admin'), (req,res) => {
  try {
    const entry = defensiveRoutines.createRoutineVersion(req.params.id, req.body || {}, { id:req.user.id, role:req.user.role });
    logAction({ userId:req.user.id, action:'CREATE_ROUTINE_VERSION', targetType:'knowledge', targetId:entry.id, metadata:{ supersedes:req.params.id } });
    res.status(201).json(entry);
  } catch(err) { res.status(400).json({ error:err.message }); }
});

router.post('/:id/peer-review', authenticate, requireMinRole('analyst'), (req,res) => {
  const { score, comments } = req.body;
  if (score === undefined || score === null) return res.status(400).json({ error:'score required' });
  const knowledge = read('knowledge');
  const idx = knowledge.findIndex(k => k.id===req.params.id);
  if (idx===-1) return res.status(404).json({ error:'Knowledge entry not found' });
  const entry = knowledge[idx];
  entry.peer_reviews = entry.peer_reviews || [];
  const review = {
    id:'pr'+uuid().slice(0,8),
    reviewer_id:req.user.id,
    score:Number(score),
    comments:comments||'',
    created_at:new Date().toISOString()
  };
  entry.peer_reviews.push(review);
  entry.status = entry.status === 'active' ? 'active' : entry.status;
  entry.validation_score = entry.peer_reviews.reduce((sum,r)=>sum+r.score,0) / entry.peer_reviews.length;
  write('knowledge', knowledge);
  logAction({ userId:req.user.id, action:'PEER_REVIEW_KNOWLEDGE', targetType:'knowledge', targetId:req.params.id, metadata:{ score:review.score } });
  res.status(201).json(review);
});

router.get('/recommendations', authenticate, (req,res) => {
  const userIncidents = read('incidents').filter(i => i.reported_by === req.user.id || i.assigned_to === req.user.id);
  const historyTypes = [...new Set(userIncidents.map(i => i.type))];
  const knowledge = read('knowledge').filter(k => k.status==='active');
  const recommendations = knowledge.map(k => {
    let score = k.confidence_score || 0.5;
    if (historyTypes.some(ht => k.tags.some(t => t.toLowerCase().includes(ht.toLowerCase())))) score += 0.2;
    if (k.defensive_routine && k.defensive_routine.success_rate) score += k.defensive_routine.success_rate * 0.2;
    if (k.peer_reviews && k.peer_reviews.length) score += Math.min(0.2, k.peer_reviews.reduce((sum,r)=>sum+r.score,0)/k.peer_reviews.length / 5);
    return { ...k, recommendation_score: Math.min(1.0, score) };
  }).sort((a,b)=>b.recommendation_score-a.recommendation_score).slice(0,15);
  res.json({ user_id:req.user.id, history_types:historyTypes, recommendations });
});

module.exports = router;
