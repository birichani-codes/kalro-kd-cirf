const express = require('express');
const { v4: uuid } = require('uuid');
const { read, write } = require('../store');
const { authenticate } = require('../middleware/auth');
const { requireMinRole } = require('../middleware/rbac');
const { logAction } = require('./audit');
const gameTheory = require('../logic/game-theory');
const sosioTechnical = require('../logic/socio-technical');
const defensiveRoutines = require('../logic/defensive-routines');
const email = require('../logic/email');
const siemSync = require('../services/siemSync');
const { recordEvent } = require('../services/incidentEvents');
const router = express.Router();

const SLA_HOURS = { critical:2, high:4, medium:8, low:24 };

function computeSlaDeadline(severity, created_at) {
  const h = SLA_HOURS[severity] || 8;
  return new Date(new Date(created_at).getTime() + h*60*60*1000).toISOString();
}

function normalizeWatchers(incident, users) {
  return (incident.watchers || []).map(w => {
    const entry = typeof w === 'string' ? { user_id: w } : w;
    const user = entry.user_id ? users.find(u => u.id === entry.user_id) : users.find(u => u.email === entry.email);
    return {
      user_id: entry.user_id || user?.id || null,
      email: entry.email || user?.email || null,
      user_name: user?.name || entry.name || 'Unknown',
      role: entry.role || user?.role || 'stakeholder'
    };
  });
}

function enrichIncident(inc, users, knowledge, incidents) {
  const r = users.find(u => u.id===inc.reported_by);
  const a = users.find(u => u.id===inc.assigned_to);
  const related = knowledge ? knowledge.filter(k =>
    k.status==='active' && (
      k.incident_id===inc.id ||
      k.tags.some(t => inc.type && (inc.type.toLowerCase().includes(t.toLowerCase()) || t.toLowerCase().includes(inc.type.toLowerCase())))
    )
  ) : undefined;
  const sla_deadline = inc.sla_deadline || computeSlaDeadline(inc.severity, inc.created_at);
  const sla_breached = !['resolved','closed'].includes(inc.status) && new Date() > new Date(sla_deadline);
  const sla_minutes_remaining = Math.round((new Date(sla_deadline)-new Date())/60000);
  const linked_incidents = (inc.linked_incidents || []).map(linkId => {
    const linked = incidents?.find(i => i.id === linkId);
    return linked ? { id: linked.id, title: linked.title, status: linked.status, severity: linked.severity } : { id: linkId };
  });
  return {
    ...inc,
    site: inc.station_id || 'Headquarters',
    sla_deadline,
    sla_breached,
    sla_minutes_remaining,
    reporter_name:r?r.name:'Unknown',
    assignee_name:a?a.name:'Unassigned',
    comments: inc.comments || [],
    briefing: inc.briefing || {
      room_id: `kalro-incident-${inc.id}`,
      room_url: `https://meet.jit.si/kalro-incident-${inc.id}`,
      active: false,
      started_at: null,
      ended_at: null,
      agenda: '',
      decisions: []
    },
    linked_incidents,
    watchers: normalizeWatchers(inc, users),
    ...(related!==undefined?{related_knowledge:related}:{})
  };
}

router.get('/', authenticate, (req,res) => {
  const { status, severity, type, is_major, station_id, scope } = req.query;
  const users = read('users'); const knowledge = read('knowledge');
  let f = read('incidents');
  if (status)   f = f.filter(i => i.status===status);
  if (severity) f = f.filter(i => i.severity===severity);
  if (type)     f = f.filter(i => i.type===type);
  if (is_major) f = f.filter(i => i.is_major===true);
  if (station_id) f = f.filter(i => i.station_id===station_id);
  if (scope==='local' && req.user.station_id) f = f.filter(i => i.station_id===req.user.station_id);
  res.json(f.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).map(i=>enrichIncident(i,users,knowledge)));
});

router.get('/stats', authenticate, (req,res) => {
  const incidents = read('incidents');
  const stats = { total:incidents.length, by_status:{}, by_severity:{}, by_type:{}, major_count:0, sla_breached:0 };
  const now = new Date();
  incidents.forEach(i => {
    stats.by_status[i.status]     = (stats.by_status[i.status]||0)+1;
    stats.by_severity[i.severity] = (stats.by_severity[i.severity]||0)+1;
    stats.by_type[i.type]         = (stats.by_type[i.type]||0)+1;
    if (i.is_major) stats.major_count++;
    const sla = i.sla_deadline || computeSlaDeadline(i.severity, i.created_at);
    if (!['resolved','closed'].includes(i.status) && now > new Date(sla)) stats.sla_breached++;
  });
  res.json(stats);
});

router.get('/stream', authenticate, (req,res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  const incidents = read('incidents').sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 50);
  res.write(`data: ${JSON.stringify({ type: 'initial', data: incidents })}\n\n`);
  siemSync.registerStream(res);
  const pingInterval = setInterval(() => { try { res.write(`:ping\n\n`); } catch(err) { clearInterval(pingInterval); } }, 30000);
  req.on('close', () => { clearInterval(pingInterval); });
});

router.get('/:id', authenticate, (req,res) => {
  const incidents = read('incidents');
  const inc = incidents.find(i => i.id===req.params.id);
  if (!inc) return res.status(404).json({ error:'Incident not found' });
  res.json(enrichIncident(inc, read('users'), read('knowledge'), incidents));
});

router.post('/', authenticate, requireMinRole('analyst'), (req,res) => {
  const { title, type, severity, description, entities, is_major, station_id, operational_test_id, detection_source, impacted_service } = req.body;
  if (!title||!type||!severity) return res.status(400).json({ error:'title, type, severity required' });
  const validStations = read('stations').filter(s=>s.active!==false).map(s=>s.name);
  const chosenStation = station_id || req.user.station_id || 'Headquarters';
  if (!validStations.includes(chosenStation)) return res.status(400).json({ error:'Select a valid KALRO station' });
  const incidents = read('incidents');
  const created_at = new Date().toISOString();
  const id = 'inc' + uuid().slice(0,8);
  const newInc = {
    id, title, type, severity, status:'open',
    is_major: is_major||false, description:description||'', entities:entities||{},
    reported_by:req.user.id, assigned_to:null,
    station_id: chosenStation,
    detection_source: detection_source || 'User / analyst report',
    impacted_service: impacted_service || '',
    operational_test_id: operational_test_id || null,
    sla_deadline: computeSlaDeadline(severity, created_at),
    briefing: {
      room_id: `kalro-incident-${id}`,
      room_url: `https://meet.jit.si/kalro-incident-${id}`,
      active: false,
      started_at: null,
      ended_at: null,
      agenda: '',
      decisions: []
    },
    created_at, updated_at:created_at
  };
  incidents.push(newInc); write('incidents', incidents);
  if (operational_test_id) {
    const tests = read('operational_tests');
    const ti = tests.findIndex(t => t.id === operational_test_id);
    if (ti >= 0) { tests[ti].incident_id = id; tests[ti].updated_at = created_at; write('operational_tests', tests); }
    recordEvent({ operationalTestId:operational_test_id, incidentId:id, eventType:'DETECTED', actorId:req.user.id, actorRole:req.user.role, source:'incident-create', timestamp:created_at });
    recordEvent({ operationalTestId:operational_test_id, incidentId:id, eventType:'ALERT_CREATED', actorId:'SYSTEM', source:'incident-create', timestamp:created_at });
  }
  logAction({ userId:req.user.id, action:'CREATE_INCIDENT', targetType:'incident', targetId:newInc.id, metadata:{ title, severity, is_major:newInc.is_major, station_id:newInc.station_id } });
  
  // Trigger notifications for incident alert
  const users = read('users');
  const notifs = read('notifications');
  const stationAnalysts = users.filter(u => 
    u.station_id === newInc.station_id && 
    (u.role === 'analyst' || u.role === 'super_admin')
  );
  stationAnalysts.forEach(analyst => {
    const notification = {
      id: Date.now().toString() + Math.random(),
      title: `🚨 New Incident at ${newInc.station_id}`,
      message: `${newInc.title} - ${newInc.description?.substring(0, 100)}...`,
      type: 'incident_alert',
      recipient_id: analyst.id,
      recipient_station_id: newInc.station_id,
      severity: severity,
      related_incident_id: newInc.id,
      action_url: `/incidents/${newInc.id}`,
      read: false,
      created_at: created_at,
      created_by: 'SYSTEM'
    };
    notifs.push(notification);
  });
  if (severity === 'critical' || is_major) {
    const superAdmins = users.filter(u => u.role === 'super_admin');
    superAdmins.forEach(admin => {
      const notification = {
        id: Date.now().toString() + Math.random(),
        title: `⚠️ ESCALATION: Critical Incident at ${newInc.station_id}`,
        message: `${newInc.title} - Severity: ${severity}`,
        type: 'escalation',
        recipient_id: admin.id,
        severity: 'critical',
        related_incident_id: newInc.id,
        action_url: `/incidents/${newInc.id}`,
        read: false,
        created_at: created_at,
        created_by: 'SYSTEM'
      };
      notifs.push(notification);
    });
  }

  write('notifications', notifs);

  if (newInc.is_major || newInc.severity === 'critical') {
    const payoffMatrix = gameTheory.calculatePayoffMatrix(newInc);
    const nashEquilibrium = gameTheory.calculateNashEquilibrium(payoffMatrix, newInc);
    const suggestedRoutines = defensiveRoutines.suggestRoutines(newInc) || { top_recommendations: [] };
    const routine = (suggestedRoutines.top_recommendations || [])[0];

    const incidentAnalysts = users.filter(u =>
      u.station_id === newInc.station_id && u.role === 'analyst'
    );

    incidentAnalysts.forEach(async analyst => {
      try {
        await email.sendSystemEmail({
          to: analyst.email,
          subject: `KALRO Major Incident Alert: ${newInc.title}`,
          html: email.buildMajorIncidentEmail(newInc, nashEquilibrium, routine),
          station_id: newInc.station_id
        });
      } catch (err) {
        console.error('Failed to send incident email', err);
      }
    });
  }
  
  res.status(201).json(newInc);
});

router.put('/:id', authenticate, requireMinRole('analyst'), (req,res) => {
  const incidents = read('incidents');
  const idx = incidents.findIndex(i => i.id===req.params.id);
  if (idx===-1) return res.status(404).json({ error:'Not found' });
  const previousStatus = incidents[idx].status;
  ['title','status','severity','description','assigned_to','entities','type','is_major'].forEach(f => {
    if (req.body[f]!==undefined) incidents[idx][f]=req.body[f];
  });
  // recalculate SLA if severity changed
  if (req.body.severity) incidents[idx].sla_deadline = computeSlaDeadline(req.body.severity, incidents[idx].created_at);
  incidents[idx].updated_at = new Date().toISOString();
  write('incidents', incidents);
  if (req.body.status && req.body.status !== previousStatus && incidents[idx].operational_test_id) {
    const STATUS_EVENT_MAP = { investigating:'ALERT_ACKNOWLEDGED', escalated:'ESCALATED', resolved:'RECOVERY_CONFIRMED', closed:'INCIDENT_CLOSED' };
    const eventType = STATUS_EVENT_MAP[req.body.status];
    if (eventType) recordEvent({ operationalTestId:incidents[idx].operational_test_id, incidentId:incidents[idx].id, eventType, actorId:req.user.id, actorRole:req.user.role, source:'incident-status', details:{ from:previousStatus, to:req.body.status } });
  }
  logAction({ userId:req.user.id, action:'UPDATE_INCIDENT', targetType:'incident', targetId:req.params.id, metadata:{ status:incidents[idx].status } });
  res.json(incidents[idx]);
});

router.get('/:id/comments', authenticate, (req, res) => {
  const incident = read('incidents').find(i => i.id === req.params.id);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });
  res.json(incident.comments || []);
});

router.post('/:id/comments', authenticate, (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: 'message is required' });

  const incidents = read('incidents');
  const idx = incidents.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Incident not found' });

  const comment = {
    id: 'c' + uuid().slice(0, 8),
    user_id: req.user.id,
    user_name: req.user.name || 'Unknown',
    role: req.user.role,
    message: message.trim(),
    created_at: new Date().toISOString()
  };

  incidents[idx].comments = incidents[idx].comments || [];
  incidents[idx].comments.unshift(comment);
  incidents[idx].updated_at = new Date().toISOString();
  write('incidents', incidents);

  logAction({
    userId: req.user.id,
    action: 'ADD_INCIDENT_COMMENT',
    targetType: 'incident',
    targetId: req.params.id,
    metadata: { comment_id: comment.id }
  });

  const users = read('users');
  const notifications = read('notifications');
  const recipients = new Set();
  const incident = incidents[idx];
  if (incident.assigned_to && incident.assigned_to !== req.user.id) recipients.add(incident.assigned_to);
  (incident.watchers || []).forEach(w => {
    const id = typeof w === 'string' ? w : w.user_id;
    if (id && id !== req.user.id) recipients.add(id);
  });

  recipients.forEach(recipientId => {
    const notification = {
      id: Date.now().toString() + Math.random(),
      title: `Update on Incident ${incident.id}`,
      message: `${req.user.name || 'A collaborator'} added a war room comment.`,
      type: 'incident_comment',
      recipient_id: recipientId,
      severity: 'normal',
      related_incident_id: incident.id,
      action_url: `/incidents/${incident.id}`,
      read: false,
      created_at: new Date().toISOString(),
      created_by: 'SYSTEM'
    };
    notifications.push(notification);
  });
  write('notifications', notifications);

  res.status(201).json(comment);
});

router.post('/:id/link', authenticate, requireMinRole('analyst'), (req, res) => {
  const { target_incident_id } = req.body;
  if (!target_incident_id) return res.status(400).json({ error: 'target_incident_id is required' });
  if (target_incident_id === req.params.id) return res.status(400).json({ error: 'Cannot link incident to itself' });

  const incidents = read('incidents');
  const sourceIdx = incidents.findIndex(i => i.id === req.params.id);
  const targetIdx = incidents.findIndex(i => i.id === target_incident_id);
  if (sourceIdx === -1 || targetIdx === -1) return res.status(404).json({ error: 'Incident not found' });

  incidents[sourceIdx].linked_incidents = incidents[sourceIdx].linked_incidents || [];
  incidents[targetIdx].linked_incidents = incidents[targetIdx].linked_incidents || [];
  if (!incidents[sourceIdx].linked_incidents.includes(target_incident_id)) {
    incidents[sourceIdx].linked_incidents.push(target_incident_id);
  }
  if (!incidents[targetIdx].linked_incidents.includes(req.params.id)) {
    incidents[targetIdx].linked_incidents.push(req.params.id);
  }
  incidents[sourceIdx].updated_at = new Date().toISOString();
  incidents[targetIdx].updated_at = new Date().toISOString();
  write('incidents', incidents);

  logAction({
    userId: req.user.id,
    action: 'LINK_INCIDENT',
    targetType: 'incident',
    targetId: req.params.id,
    metadata: { linked_incident_id: target_incident_id }
  });

  res.json({ success: true, linked_incidents: incidents[sourceIdx].linked_incidents });
});

router.get('/:id/activity', authenticate, (req, res) => {
  const incident = read('incidents').find(i => i.id === req.params.id);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });

  const logs = read('audit_logs').filter(l => l.target_id === req.params.id || l.metadata?.incident_id === req.params.id);
  const users = read('users');
  const enriched = logs.map(l => ({
    ...l,
    user_name: users.find(u => u.id === l.user_id)?.name || 'Unknown'
  })).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));

  res.json(enriched);
});

router.post('/:id/watchers', authenticate, requireMinRole('analyst'), (req, res) => {
  const { email, user_id } = req.body;
  if (!email && !user_id) return res.status(400).json({ error: 'email or user_id is required' });

  const users = read('users');
  const incidents = read('incidents');
  const idx = incidents.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Incident not found' });

  const watcher = user_id ? users.find(u => u.id === user_id) : users.find(u => u.email === email);
  if (!watcher) return res.status(404).json({ error: 'User not found' });

  incidents[idx].watchers = incidents[idx].watchers || [];
  if (!incidents[idx].watchers.some(w => (typeof w === 'string' ? w === watcher.id : w.user_id === watcher.id))) {
    incidents[idx].watchers.push({ user_id: watcher.id, email: watcher.email, role: watcher.role, name: watcher.name });
  }
  incidents[idx].updated_at = new Date().toISOString();
  write('incidents', incidents);

  logAction({
    userId: req.user.id,
    action: 'ADD_INCIDENT_WATCHER',
    targetType: 'incident',
    targetId: req.params.id,
    metadata: { watcher_id: watcher.id }
  });

  const notifications = read('notifications');
  notifications.push({
    id: Date.now().toString() + Math.random(),
    title: `You are now watching incident ${incidents[idx].id}`,
    message: `${req.user.name || 'A collaborator'} added you as a watcher on incident ${incidents[idx].title}.`,
    type: 'incident_watch',
    recipient_id: watcher.id,
    severity: 'normal',
    related_incident_id: incidents[idx].id,
    action_url: `/incidents/${incidents[idx].id}`,
    read: false,
    created_at: new Date().toISOString(),
    created_by: 'SYSTEM'
  });
  write('notifications', notifications);

  res.json({ success: true, watcher: { user_id: watcher.id, user_name: watcher.name, email: watcher.email, role: watcher.role } });
});

router.post('/:id/invite', authenticate, requireMinRole('analyst'), async (req, res) => {
  const { user_ids } = req.body;
  if (!Array.isArray(user_ids) || user_ids.length === 0) return res.status(400).json({ error: 'user_ids array required' });

  const users = read('users');
  const incidents = read('incidents');
  const idx = incidents.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Incident not found' });

  const invitedUsers = user_ids.map(id => users.find(u => u.id === id)).filter(Boolean);
  if (invitedUsers.length === 0) return res.status(400).json({ error: 'No valid users found' });

  const incident = incidents[idx];
  incident.briefing = incident.briefing || {};
  incident.briefing.room_id = incident.briefing.room_id || `kalro-incident-${incident.id}`;
  incident.briefing.room_url = `https://meet.jit.si/${incident.briefing.room_id}`;
  const roomId = incident.briefing.room_id;

  // Send emails
  for (const user of invitedUsers) {
    await email.sendSystemEmail({
      to: user.email,
      subject: `KALRO Incident Collaboration: ${incident.title}`,
      html: `
        <h2>KALRO Incident War Room Invitation</h2>
        <p>You have been invited to collaborate on incident <strong>${incident.id}</strong>: <em>${incident.title}</em></p>
        <p><strong>Severity:</strong> ${incident.severity} | <strong>Status:</strong> ${incident.status}</p>
        <p><strong>Description:</strong> ${incident.description}</p>
        <p><a href="https://meet.jit.si/${roomId}" style="background:#4CAF50;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">Join Video Briefing</a></p>
        <p><a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/incidents/${incident.id}">View Incident Details</a></p>
        <p>This is a major incident requiring immediate attention. Please join the video briefing to discuss response strategies.</p>
        <hr>
        <p><small>KALRO Integrated Knowledge Framework - Automated Notification</small></p>
      `,
      station_id: incident.station_id || 'Hub'
    });

    // Also add as watcher if not already
    incident.watchers = incident.watchers || [];
    if (!incident.watchers.some(w => (typeof w === 'string' ? w === user.id : w.user_id === user.id))) {
      incident.watchers.push({ user_id: user.id, email: user.email, role: user.role, name: user.name });
    }

    // Send notification
    const notifications = read('notifications');
    notifications.push({
      id: Date.now().toString() + Math.random(),
      title: `Invited to incident collaboration: ${incident.title}`,
      message: `${req.user.name || 'A team member'} invited you to collaborate on incident ${incident.id}. Join the video briefing if this is a major incident.`,
      type: 'incident_invite',
      recipient_id: user.id,
      severity: incident.is_major ? 'high' : 'normal',
      related_incident_id: incident.id,
      action_url: `/incidents/${incident.id}`,
      read: false,
      created_at: new Date().toISOString(),
      created_by: req.user.id
    });
    write('notifications', notifications);
  }

  incident.updated_at = new Date().toISOString();
  write('incidents', incidents);

  logAction({
    userId: req.user.id,
    action: 'INVITE_USERS_TO_INCIDENT',
    targetType: 'incident',
    targetId: req.params.id,
    metadata: { invited_count: invitedUsers.length, user_ids }
  });

  res.json({ success: true, invited: invitedUsers.length });
});

router.put('/:id/briefing', authenticate, requireMinRole('analyst'), (req, res) => {
  const { active, agenda } = req.body;
  const incidents = read('incidents');
  const idx = incidents.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Incident not found' });

  const incident = incidents[idx];
  incident.briefing = incident.briefing || {};
  incident.briefing.room_id = incident.briefing.room_id || `kalro-incident-${incident.id}`;
  incident.briefing.room_url = `https://meet.jit.si/${incident.briefing.room_id}`;
  if (agenda !== undefined) incident.briefing.agenda = agenda;
  if (active === true) {
    incident.briefing.active = true;
    incident.briefing.started_at = incident.briefing.started_at || new Date().toISOString();
    incident.briefing.ended_at = null;
  }
  if (active === false) {
    incident.briefing.active = false;
    incident.briefing.ended_at = new Date().toISOString();
  }
  incident.updated_at = new Date().toISOString();
  write('incidents', incidents);
  if (active === true && incident.operational_test_id) {
    recordEvent({ operationalTestId:incident.operational_test_id, incidentId:incident.id, eventType:'COLLABORATION_STARTED', actorId:req.user.id, actorRole:req.user.role, source:'briefing' });
  }

  logAction({
    userId: req.user.id,
    action: 'UPDATE_INCIDENT_BRIEFING',
    targetType: 'incident',
    targetId: req.params.id,
    metadata: { active: incident.briefing.active, agenda: incident.briefing.agenda }
  });

  res.json(incident.briefing);
});

router.post('/:id/briefing/decisions', authenticate, requireMinRole('analyst'), (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: 'message is required' });

  const incidents = read('incidents');
  const idx = incidents.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Incident not found' });

  const incident = incidents[idx];
  incident.briefing = incident.briefing || {};
  incident.briefing.room_id = incident.briefing.room_id || `kalro-incident-${incident.id}`;
  incident.briefing.room_url = `https://meet.jit.si/${incident.briefing.room_id}`;
  incident.briefing.decisions = incident.briefing.decisions || [];

  const decision = {
    id: 'bd' + uuid().slice(0, 8),
    user_id: req.user.id,
    user_name: req.user.name || 'Unknown',
    role: req.user.role,
    message: message.trim(),
    created_at: new Date().toISOString()
  };

  incident.briefing.decisions.unshift(decision);
  incident.updated_at = new Date().toISOString();
  write('incidents', incidents);

  logAction({
    userId: req.user.id,
    action: 'ADD_BRIEFING_DECISION',
    targetType: 'incident',
    targetId: req.params.id,
    metadata: { decision_id: decision.id }
  });

  res.json(decision);
});

router.delete('/:id', authenticate, requireMinRole('super_admin'), (req,res) => {
  let incidents = read('incidents');
  if (!incidents.find(i => i.id===req.params.id)) return res.status(404).json({ error:'Not found' });
  write('incidents', incidents.filter(i => i.id!==req.params.id));
  logAction({ userId:req.user.id, action:'DELETE_INCIDENT', targetType:'incident', targetId:req.params.id });
  res.json({ success:true });
});

// ─── NEW: SOCIO-TECHNICAL ANALYSIS ────────────────────────────────────────

router.post('/:id/tag-socio-technical', authenticate, requireMinRole('analyst'), (req,res) => {
  const { technical_factors, social_factors } = req.body;
  if (!technical_factors || !social_factors) {
    return res.status(400).json({ error: 'technical_factors and social_factors required' });
  }

  try {
    const stsAnalysis = sosioTechnical.analyzeIncident(
      read('incidents').find(i => i.id === req.params.id),
      { technical_factors, social_factors }
    );
    
    const incident = sosioTechnical.tagIncidentSTS(req.params.id, stsAnalysis);
    
    logAction({
      userId: req.user.id,
      action: 'TAG_INCIDENT_STS',
      targetType: 'incident',
      targetId: req.params.id,
      metadata: { root_cause_type: stsAnalysis.root_cause_type, sts_risk_score: stsAnalysis.sts_risk_score }
    });

    const superAdmins = read('users').filter(u => u.role === 'super_admin');
    superAdmins.forEach(async admin => {
      try {
        await email.sendSystemEmail({
          to: admin.email,
          subject: `KALRO STS Alert: ${incident.title}`,
          html: email.buildSocioTechnicalGapEmail(incident, stsAnalysis),
          station_id: incident.station_id
        });
      } catch (err) {
        console.error('Failed to send STS gap email', err);
      }
    });

    res.json(incident);
  } catch(err) {
    res.status(404).json({ error: err.message });
  }
});

// ─── NEW: GAME THEORY ANALYSIS ────────────────────────────────────────────

router.post('/:id/calculate-game-theory', authenticate, requireMinRole('analyst'), (req,res) => {
  const incidents = read('incidents');
  const incident = incidents.find(i => i.id === req.params.id);
  
  if (!incident) return res.status(404).json({ error: 'Incident not found' });

  try {
    const payoffMatrix = gameTheory.calculatePayoffMatrix(incident, req.body.config);
    const nashEquilibrium = gameTheory.calculateNashEquilibrium(payoffMatrix, incident);
    
    const decision = gameTheory.recordStrategicDecision(
      req.params.id,
      { ...nashEquilibrium, payoffMatrix },
      req.user.id
    );

    logAction({
      userId: req.user.id,
      action: 'CALCULATE_GAME_THEORY',
      targetType: 'incident',
      targetId: req.params.id,
      metadata: { recommendation: nashEquilibrium.recommendedAction, confidence: nashEquilibrium.confidence }
    });

    res.json({
      payoff_matrix: payoffMatrix,
      nash_equilibrium: nashEquilibrium,
      strategic_decision: decision
    });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── NEW: GET STRATEGIC DECISIONS ────────────────────────────────────────

router.get('/:id/strategic-decisions', authenticate, (req,res) => {
  const incident = read('incidents').find(i => i.id === req.params.id);
  
  if (!incident) return res.status(404).json({ error: 'Incident not found' });

  const decisions = incident.strategic_decisions || [];
  const users = read('users');

  const enriched = decisions.map(d => ({
    ...d,
    user_name: users.find(u => u.id === d.user_id)?.name || 'Unknown'
  }));

  res.json(enriched);
});

// ─── DEFENSIVE ROUTINES ──────────────────────────────────────────────────

router.get('/:id/defensive-routines', authenticate, (req,res) => {
  const incident = read('incidents').find(i => i.id === req.params.id);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });

  let suggestions = defensiveRoutines.suggestRoutines(incident, { actorRole:req.user.role });
  const newlyRecommended = [];
  (suggestions.top_recommendations || []).forEach(r => {
    try {
      if (defensiveRoutines.recordRoutineRecommendation(r.knowledge_id, incident.id)) newlyRecommended.push(r.knowledge_id);
    } catch (_) {}
  });
  if (newlyRecommended.length) suggestions = defensiveRoutines.suggestRoutines(incident, { actorRole:req.user.role });
  if (incident.operational_test_id && newlyRecommended.length) {
    recordEvent({
      operationalTestId:incident.operational_test_id,
      incidentId:incident.id,
      eventType:'ROUTINE_RECOMMENDED',
      actorId:'SYSTEM', actorRole:'system', source:'defensive-routine-engine',
      details:{ count:newlyRecommended.length, knowledge_ids:newlyRecommended },
      allowDuplicate:true
    });
  }
  res.json(suggestions);
});

router.get('/:id/routine-executions', authenticate, (req,res) => {
  const incident = read('incidents').find(i => i.id === req.params.id);
  if (!incident) return res.status(404).json({ error:'Incident not found' });
  res.json(defensiveRoutines.getRoutineExecutionsForIncident(incident.id));
});

router.post('/:id/routine-executions/:knowledgeId/start', authenticate, requireMinRole('analyst'), (req,res) => {
  const incident = read('incidents').find(i => i.id === req.params.id);
  if (!incident) return res.status(404).json({ error:'Incident not found' });
  try {
    const execution = defensiveRoutines.startRoutineExecution(
      req.params.knowledgeId,
      incident.id,
      { id:req.user.id, role:req.user.role },
      req.body?.notes || ''
    );
    if (incident.operational_test_id) {
      recordEvent({ operationalTestId:incident.operational_test_id, incidentId:incident.id, eventType:'ROUTINE_ACCEPTED', actorId:req.user.id, actorRole:req.user.role, source:'defensive-routine', details:{ knowledge_id:req.params.knowledgeId, execution_id:execution.id }, allowDuplicate:true });
      recordEvent({ operationalTestId:incident.operational_test_id, incidentId:incident.id, eventType:'KNOWLEDGE_APPLIED', actorId:req.user.id, actorRole:req.user.role, source:'defensive-routine', details:{ knowledge_id:req.params.knowledgeId, execution_id:execution.id }, allowDuplicate:true });
    }
    logAction({ userId:req.user.id, action:'START_DEFENSIVE_ROUTINE', targetType:'knowledge', targetId:req.params.knowledgeId, metadata:{ incident_id:incident.id, execution_id:execution.id } });
    res.status(201).json(execution);
  } catch(err) { res.status(400).json({ error:err.message }); }
});

router.patch('/:id/routine-executions/:executionId/steps/:stepId', authenticate, requireMinRole('analyst'), (req,res) => {
  const incident = read('incidents').find(i => i.id === req.params.id);
  if (!incident) return res.status(404).json({ error:'Incident not found' });
  try {
    const execution = defensiveRoutines.updateRoutineStep(req.params.executionId, req.params.stepId, { id:req.user.id, role:req.user.role }, req.body || {});
    if (execution.incident_id !== incident.id) return res.status(400).json({ error:'Execution does not belong to this incident' });
    logAction({ userId:req.user.id, action:'UPDATE_ROUTINE_STEP', targetType:'incident', targetId:incident.id, metadata:{ execution_id:execution.id, step_id:req.params.stepId, completed:req.body?.completed } });
    res.json(execution);
  } catch(err) { res.status(400).json({ error:err.message }); }
});

router.post('/:id/routine-executions/:executionId/complete', authenticate, requireMinRole('analyst'), (req,res) => {
  const incident = read('incidents').find(i => i.id === req.params.id);
  if (!incident) return res.status(404).json({ error:'Incident not found' });
  try {
    const execution = defensiveRoutines.completeRoutineExecution(req.params.executionId, { id:req.user.id, role:req.user.role }, req.body || {});
    if (execution.incident_id !== incident.id) return res.status(400).json({ error:'Execution does not belong to this incident' });
    if (incident.operational_test_id && execution.outcome === 'successful') {
      recordEvent({ operationalTestId:incident.operational_test_id, incidentId:incident.id, eventType:'KNOWLEDGE_REUSE_SUCCESS', actorId:req.user.id, actorRole:req.user.role, source:'defensive-routine', details:{ knowledge_id:execution.knowledge_id, execution_id:execution.id }, allowDuplicate:true });
    }
    logAction({ userId:req.user.id, action:'COMPLETE_DEFENSIVE_ROUTINE', targetType:'incident', targetId:incident.id, metadata:{ execution_id:execution.id, outcome:execution.outcome } });
    res.json(execution);
  } catch(err) { res.status(400).json({ error:err.message }); }
});

// Compatibility endpoint retained for older clients.
router.post('/:id/apply-routine/:knowledgeId', authenticate, requireMinRole('analyst'), (req,res) => {
  const { outcome } = req.body || {};
  const incident = read('incidents').find(i => i.id === req.params.id);
  if (!incident) return res.status(404).json({ error:'Incident not found' });
  try {
    const entry = defensiveRoutines.recordRoutineApplication(req.params.knowledgeId, req.params.id, outcome || {}, { id:req.user.id, role:req.user.role });
    if (incident.operational_test_id) {
      recordEvent({ operationalTestId:incident.operational_test_id, incidentId:incident.id, eventType:'ROUTINE_ACCEPTED', actorId:req.user.id, actorRole:req.user.role, source:'defensive-routine', details:{ knowledge_id:req.params.knowledgeId, success: outcome?.success }, allowDuplicate:true });
      recordEvent({ operationalTestId:incident.operational_test_id, incidentId:incident.id, eventType:'KNOWLEDGE_APPLIED', actorId:req.user.id, actorRole:req.user.role, source:'defensive-routine', details:{ knowledge_id:req.params.knowledgeId, success: outcome?.success }, allowDuplicate:true });
      if (outcome?.success === true) recordEvent({ operationalTestId:incident.operational_test_id, incidentId:incident.id, eventType:'KNOWLEDGE_REUSE_SUCCESS', actorId:req.user.id, actorRole:req.user.role, source:'defensive-routine', details:{ knowledge_id:req.params.knowledgeId }, allowDuplicate:true });
    }
    logAction({ userId:req.user.id, action:'APPLY_DEFENSIVE_ROUTINE', targetType:'knowledge', targetId:req.params.knowledgeId, metadata:{ incident_id:req.params.id, success:outcome?.success } });
    res.json({ success:true, entry });
  } catch(err) { res.status(400).json({ error:err.message }); }
});

router.post('/:id/reject-routine/:knowledgeId', authenticate, requireMinRole('analyst'), (req,res) => {
  const incident = read('incidents').find(i => i.id === req.params.id);
  if (!incident) return res.status(404).json({ error:'Incident not found' });
  try {
    defensiveRoutines.rejectRoutineRecommendation(req.params.knowledgeId, incident.id, { id:req.user.id, role:req.user.role }, req.body?.reason || '');
    if (incident.operational_test_id) {
      recordEvent({ operationalTestId:incident.operational_test_id, incidentId:incident.id, eventType:'ROUTINE_REJECTED', actorId:req.user.id, actorRole:req.user.role, source:'defensive-routine', details:{ knowledge_id:req.params.knowledgeId, reason:req.body?.reason || '' }, allowDuplicate:true });
    }
    logAction({ userId:req.user.id, action:'REJECT_DEFENSIVE_ROUTINE', targetType:'knowledge', targetId:req.params.knowledgeId, metadata:{ incident_id:req.params.id, reason:req.body?.reason || '' } });
    res.json({ success:true });
  } catch(err) { res.status(400).json({ error:err.message }); }
});

router.post('/:id/review-routine/:knowledgeId', authenticate, requireMinRole('super_admin'), (req,res) => {
  const { rating, comments } = req.body;
  if (rating === undefined || rating === null) {
    return res.status(400).json({ error: 'rating is required' });
  }

  try {
    const entry = defensiveRoutines.reviewRoutineEffectiveness(
      req.params.id,
      req.params.knowledgeId,
      { rating, comments, reviewed_by: req.user.id }
    );

    const incident = read('incidents').find(i => i.id === req.params.id);
    if (incident?.is_major) {
      const alerts = read('knowledge_alerts');
      alerts.push({
        id: 'pulse' + Math.random().toString(36).slice(2, 9),
        incident_id: incident.id,
        routine_id: entry.id,
        title: `Knowledge Alert: Major incident ${incident.type} reviewed`,
        summary: `A major incident was closed and the defensive routine '${entry.title}' was reviewed by super admin ${req.user.name || req.user.id}. Share this learning across sites.`,
        source_site: incident.site || 'Headquarters',
        target_site: 'All Sites',
        severity: 'high',
        status: 'new',
        created_at: new Date().toISOString(),
        created_by: req.user.id
      });
      write('knowledge_alerts', alerts);
    }

    logAction({
      userId: req.user.id,
      action: 'REVIEW_DEFENSIVE_ROUTINE',
      targetType: 'knowledge',
      targetId: req.params.knowledgeId,
      metadata: { incident_id: req.params.id, rating }
    });

    res.json({ success: true, entry });
  } catch(err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── NEW: GET RESILIENCE METRICS ─────────────────────────────────────────

router.get('/dashboard/resilience-metrics', authenticate, (req,res) => {
  try {
    const metrics = gameTheory.calculateResilienceMetrics();
    res.json(metrics);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/sync-siem', authenticate, requireMinRole('super_admin'), async (req,res) => {
  try {
    const newIncidents = await siemSync.syncIncidents();
    res.json({ success: true, new_incidents_count: newIncidents.length });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
