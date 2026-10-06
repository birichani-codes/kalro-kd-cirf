import os

files = {}

# ── SERVER ───────────────────────────────────────────────────────────────────

files["server/store.js"] = r"""const fs = require('fs');
const path = require('path');
const DATA_DIR = path.join(__dirname, 'data');
const read = (file) => {
  const fp = path.join(DATA_DIR, `${file}.json`);
  if (!fs.existsSync(fp)) return [];
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
};
const write = (file, data) => {
  fs.writeFileSync(path.join(DATA_DIR, `${file}.json`), JSON.stringify(data, null, 2));
};
module.exports = { read, write };
"""

files["server/index.js"] = r"""require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const incidentRoutes = require('./routes/incidents');
const knowledgeRoutes = require('./routes/knowledge');
const searchRoutes = require('./routes/search');
const reportsRoutes = require('./routes/reports');
const { router: auditRoutes } = require('./routes/audit');

const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/audit', auditRoutes);
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
app.use((err, req, res, next) => { console.error(err.stack); res.status(500).json({ error: 'Internal server error' }); });
app.listen(PORT, () => console.log(`KALRO IKF API running on http://localhost:${PORT}`));
"""

files["server/middleware/auth.js"] = r"""const jwt = require('jsonwebtoken');
const { read } = require('../store');
const JWT_SECRET = process.env.JWT_SECRET || 'kalro-ikf-secret-2024';
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer '))
    return res.status(401).json({ error: 'No token provided' });
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const users = read('users');
    const user = users.find(u => u.id === decoded.id);
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};
module.exports = { authenticate, JWT_SECRET };
"""

files["server/middleware/rbac.js"] = r"""const ROLE_HIERARCHY = { super_admin: 4, analyst: 3, viewer: 2, system: 1 };
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions' });
  next();
};
const requireMinRole = (minRole) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });
  if ((ROLE_HIERARCHY[req.user.role] || 0) < (ROLE_HIERARCHY[minRole] || 0))
    return res.status(403).json({ error: 'Insufficient permissions' });
  next();
};
module.exports = { requireRole, requireMinRole };
"""

files["server/routes/audit.js"] = r"""const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { read, write } = require('../store');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const router = express.Router();

const logAction = ({ userId, action, targetType = null, targetId = null, metadata = {} }) => {
  const logs = read('audit_logs');
  logs.unshift({
    id: `log${uuidv4().slice(0, 8)}`,
    user_id: userId, action,
    target_type: targetType, target_id: targetId,
    metadata, created_at: new Date().toISOString()
  });
  write('audit_logs', logs);
};

router.get('/', authenticate, requireRole('super_admin'), (req, res) => {
  const logs = read('audit_logs');
  const users = read('users');
  const enriched = logs.map(log => {
    const user = users.find(u => u.id === log.user_id);
    return { ...log, user_name: user ? user.name : 'Unknown', user_role: user ? user.role : null };
  });
  res.json(enriched);
});

module.exports = { router, logAction };
"""

files["server/routes/auth.js"] = r"""const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { read, write } = require('../store');
const { authenticate, JWT_SECRET } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAction } = require('./audit');
const router = express.Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const users = read('users');
  const user = users.find(u => u.email === email);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
  logAction({ userId: user.id, action: 'LOGIN', metadata: { email } });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, department: user.department } });
});

router.get('/me', authenticate, (req, res) => {
  const users = read('users');
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { password, ...safe } = user;
  res.json(safe);
});

router.get('/users', authenticate, requireRole('super_admin'), (req, res) => {
  res.json(read('users').map(({ password, ...u }) => u));
});

router.post('/users', authenticate, requireRole('super_admin'), async (req, res) => {
  const { name, email, password, role, department } = req.body;
  if (!name || !email || !password || !role) return res.status(400).json({ error: 'name, email, password, role required' });
  const users = read('users');
  if (users.find(u => u.email === email)) return res.status(409).json({ error: 'Email already exists' });
  const hashed = await bcrypt.hash(password, 10);
  const newUser = { id: `u${uuidv4().slice(0, 8)}`, name, email, password: hashed, role, department: department || '', created_at: new Date().toISOString() };
  users.push(newUser);
  write('users', users);
  logAction({ userId: req.user.id, action: 'CREATE_USER', targetType: 'user', targetId: newUser.id, metadata: { name, role } });
  const { password: _, ...safe } = newUser;
  res.status(201).json(safe);
});

router.put('/users/:id', authenticate, requireRole('super_admin'), async (req, res) => {
  const users = read('users');
  const idx = users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'User not found' });
  const { name, role, department } = req.body;
  if (name) users[idx].name = name;
  if (role) users[idx].role = role;
  if (department !== undefined) users[idx].department = department;
  write('users', users);
  logAction({ userId: req.user.id, action: 'UPDATE_USER', targetType: 'user', targetId: req.params.id });
  const { password, ...safe } = users[idx];
  res.json(safe);
});

router.delete('/users/:id', authenticate, requireRole('super_admin'), (req, res) => {
  let users = read('users');
  if (!users.find(u => u.id === req.params.id)) return res.status(404).json({ error: 'User not found' });
  users = users.filter(u => u.id !== req.params.id);
  write('users', users);
  logAction({ userId: req.user.id, action: 'DELETE_USER', targetType: 'user', targetId: req.params.id });
  res.json({ success: true });
});

module.exports = router;
"""

files["server/routes/incidents.js"] = r"""const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { read, write } = require('../store');
const { authenticate } = require('../middleware/auth');
const { requireMinRole } = require('../middleware/rbac');
const { logAction } = require('./audit');
const router = express.Router();

router.get('/', authenticate, (req, res) => {
  const incidents = read('incidents');
  const users = read('users');
  const { status, severity, type } = req.query;
  let filtered = incidents;
  if (status) filtered = filtered.filter(i => i.status === status);
  if (severity) filtered = filtered.filter(i => i.severity === severity);
  if (type) filtered = filtered.filter(i => i.type === type);
  const enriched = filtered.map(inc => {
    const reporter = users.find(u => u.id === inc.reported_by);
    const assignee = users.find(u => u.id === inc.assigned_to);
    return { ...inc, reporter_name: reporter ? reporter.name : 'Unknown', assignee_name: assignee ? assignee.name : 'Unassigned' };
  });
  res.json(enriched.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
});

router.get('/stats', authenticate, (req, res) => {
  const incidents = read('incidents');
  const stats = { total: incidents.length, by_status: {}, by_severity: {}, by_type: {} };
  incidents.forEach(i => {
    stats.by_status[i.status] = (stats.by_status[i.status] || 0) + 1;
    stats.by_severity[i.severity] = (stats.by_severity[i.severity] || 0) + 1;
    stats.by_type[i.type] = (stats.by_type[i.type] || 0) + 1;
  });
  res.json(stats);
});

router.get('/:id', authenticate, (req, res) => {
  const incidents = read('incidents');
  const users = read('users');
  const knowledge = read('knowledge');
  const inc = incidents.find(i => i.id === req.params.id);
  if (!inc) return res.status(404).json({ error: 'Incident not found' });
  const reporter = users.find(u => u.id === inc.reported_by);
  const assignee = users.find(u => u.id === inc.assigned_to);
  const related = knowledge.filter(k =>
    k.status === 'active' && (k.incident_id === inc.id || k.tags.some(tag => inc.type && inc.type.toLowerCase().includes(tag.toLowerCase())))
  );
  res.json({ ...inc, reporter_name: reporter ? reporter.name : 'Unknown', assignee_name: assignee ? assignee.name : 'Unassigned', related_knowledge: related });
});

router.post('/', authenticate, requireMinRole('analyst'), (req, res) => {
  const { title, type, severity, description, entities } = req.body;
  if (!title || !type || !severity) return res.status(400).json({ error: 'title, type, severity required' });
  const incidents = read('incidents');
  const newInc = { id: `inc${uuidv4().slice(0, 8)}`, title, type, severity, status: 'open', description: description || '', entities: entities || {}, reported_by: req.user.id, assigned_to: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  incidents.push(newInc);
  write('incidents', incidents);
  logAction({ userId: req.user.id, action: 'CREATE_INCIDENT', targetType: 'incident', targetId: newInc.id, metadata: { title, severity } });
  res.status(201).json(newInc);
});

router.put('/:id', authenticate, requireMinRole('analyst'), (req, res) => {
  const incidents = read('incidents');
  const idx = incidents.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Incident not found' });
  const allowed = ['title', 'status', 'severity', 'description', 'assigned_to', 'entities', 'type'];
  allowed.forEach(f => { if (req.body[f] !== undefined) incidents[idx][f] = req.body[f]; });
  incidents[idx].updated_at = new Date().toISOString();
  write('incidents', incidents);
  logAction({ userId: req.user.id, action: 'UPDATE_INCIDENT', targetType: 'incident', targetId: req.params.id, metadata: { status: incidents[idx].status } });
  res.json(incidents[idx]);
});

router.delete('/:id', authenticate, requireMinRole('super_admin'), (req, res) => {
  let incidents = read('incidents');
  if (!incidents.find(i => i.id === req.params.id)) return res.status(404).json({ error: 'Not found' });
  incidents = incidents.filter(i => i.id !== req.params.id);
  write('incidents', incidents);
  logAction({ userId: req.user.id, action: 'DELETE_INCIDENT', targetType: 'incident', targetId: req.params.id });
  res.json({ success: true });
});

module.exports = router;
"""

files["server/routes/knowledge.js"] = r"""const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { read, write } = require('../store');
const { authenticate } = require('../middleware/auth');
const { requireMinRole } = require('../middleware/rbac');
const { logAction } = require('./audit');
const router = express.Router();

router.get('/', authenticate, (req, res) => {
  const knowledge = read('knowledge');
  const users = read('users');
  const { status, tag } = req.query;
  let filtered = knowledge;
  if (status) filtered = filtered.filter(k => k.status === status);
  else filtered = filtered.filter(k => k.status !== 'superseded');
  if (tag) filtered = filtered.filter(k => k.tags.includes(tag));
  const enriched = filtered.map(k => {
    const contributor = users.find(u => u.id === k.contributor_id);
    return { ...k, contributor_name: contributor ? contributor.name : 'Unknown' };
  });
  res.json(enriched.sort((a, b) => b.confidence_score - a.confidence_score));
});

router.get('/:id', authenticate, (req, res) => {
  const knowledge = read('knowledge');
  const users = read('users');
  const annotations = read('annotations');
  const entry = knowledge.find(k => k.id === req.params.id);
  if (!entry) return res.status(404).json({ error: 'Not found' });
  const contributor = users.find(u => u.id === entry.contributor_id);
  const entryAnnotations = annotations.filter(a => a.knowledge_id === entry.id).map(a => {
    const user = users.find(u => u.id === a.user_id);
    return { ...a, user_name: user ? user.name : 'Unknown' };
  });
  const versions = knowledge.filter(k => k.id === entry.id || k.superseded_by === entry.id || entry.superseded_by === k.id);
  res.json({ ...entry, contributor_name: contributor ? contributor.name : 'Unknown', annotations: entryAnnotations, version_history: versions });
});

router.post('/', authenticate, requireMinRole('analyst'), (req, res) => {
  const { title, content, tags, incident_id } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'title and content required' });
  const knowledge = read('knowledge');
  const newEntry = { id: `k${uuidv4().slice(0, 8)}`, title, content, tags: tags || [], incident_id: incident_id || null, contributor_id: req.user.id, confidence_score: 1.0, version: 1, superseded_by: null, status: 'active', use_count: 0, last_used_at: null, created_at: new Date().toISOString() };
  knowledge.push(newEntry);
  write('knowledge', knowledge);
  logAction({ userId: req.user.id, action: 'CREATE_KNOWLEDGE', targetType: 'knowledge', targetId: newEntry.id, metadata: { title } });
  res.status(201).json(newEntry);
});

router.put('/:id', authenticate, requireMinRole('analyst'), (req, res) => {
  const knowledge = read('knowledge');
  const idx = knowledge.findIndex(k => k.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const old = knowledge[idx];
  const { title, content, tags, status } = req.body;
  if (req.body.new_version) {
    const newEntry = { id: `k${uuidv4().slice(0, 8)}`, title: title || old.title, content: content || old.content, tags: tags || old.tags, incident_id: old.incident_id, contributor_id: req.user.id, confidence_score: 1.0, version: old.version + 1, superseded_by: null, status: 'active', use_count: 0, last_used_at: null, created_at: new Date().toISOString() };
    knowledge[idx].superseded_by = newEntry.id;
    knowledge[idx].status = 'superseded';
    knowledge.push(newEntry);
    write('knowledge', knowledge);
    logAction({ userId: req.user.id, action: 'VERSION_KNOWLEDGE', targetType: 'knowledge', targetId: newEntry.id, metadata: { supersedes: old.id } });
    return res.status(201).json(newEntry);
  }
  if (title) knowledge[idx].title = title;
  if (content) knowledge[idx].content = content;
  if (tags) knowledge[idx].tags = tags;
  if (status) knowledge[idx].status = status;
  write('knowledge', knowledge);
  logAction({ userId: req.user.id, action: 'UPDATE_KNOWLEDGE', targetType: 'knowledge', targetId: req.params.id });
  res.json(knowledge[idx]);
});

router.post('/:id/use', authenticate, (req, res) => {
  const knowledge = read('knowledge');
  const idx = knowledge.findIndex(k => k.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  knowledge[idx].use_count += 1;
  knowledge[idx].last_used_at = new Date().toISOString();
  knowledge[idx].confidence_score = Math.min(1.0, knowledge[idx].confidence_score + 0.02);
  write('knowledge', knowledge);
  logAction({ userId: req.user.id, action: 'USE_KNOWLEDGE', targetType: 'knowledge', targetId: req.params.id });
  res.json({ success: true, use_count: knowledge[idx].use_count });
});

router.post('/:id/annotate', authenticate, requireMinRole('analyst'), (req, res) => {
  const { note } = req.body;
  if (!note) return res.status(400).json({ error: 'note required' });
  const knowledge = read('knowledge');
  if (!knowledge.find(k => k.id === req.params.id)) return res.status(404).json({ error: 'Not found' });
  const annotations = read('annotations');
  const newAnnotation = { id: `a${uuidv4().slice(0, 8)}`, knowledge_id: req.params.id, user_id: req.user.id, note, created_at: new Date().toISOString() };
  annotations.push(newAnnotation);
  write('annotations', annotations);
  logAction({ userId: req.user.id, action: 'ANNOTATE_KNOWLEDGE', targetType: 'knowledge', targetId: req.params.id });
  const users = read('users');
  const user = users.find(u => u.id === req.user.id);
  res.status(201).json({ ...newAnnotation, user_name: user ? user.name : 'Unknown' });
});

module.exports = router;
"""

files["server/routes/search.js"] = r"""const express = require('express');
const { read } = require('../store');
const { authenticate } = require('../middleware/auth');
const { logAction } = require('./audit');
const router = express.Router();

const scoreMatch = (text, query) => {
  if (!text || !query) return 0;
  const terms = query.toLowerCase().split(/\s+/);
  const content = text.toLowerCase();
  let score = 0;
  terms.forEach(term => { score += (content.match(new RegExp(term, 'g')) || []).length; });
  return score;
};

router.get('/', authenticate, (req, res) => {
  const { q, type = 'all' } = req.query;
  if (!q || q.trim().length < 2) return res.status(400).json({ error: 'Query must be at least 2 characters' });
  const users = read('users');
  const results = [];
  if (type === 'all' || type === 'knowledge') {
    read('knowledge').filter(k => k.status === 'active').forEach(k => {
      const total = scoreMatch(`${k.title} ${k.content} ${k.tags.join(' ')}`, q) + (k.tags.some(t => t.toLowerCase().includes(q.toLowerCase())) ? 5 : 0);
      if (total > 0) {
        const contributor = users.find(u => u.id === k.contributor_id);
        results.push({ ...k, result_type: 'knowledge', relevance_score: Math.min(1.0, (total / 20) * k.confidence_score), contributor_name: contributor ? contributor.name : 'Unknown' });
      }
    });
  }
  if (type === 'all' || type === 'incident') {
    read('incidents').forEach(inc => {
      const total = scoreMatch(`${inc.title} ${inc.description} ${inc.type}`, q);
      if (total > 0) {
        const reporter = users.find(u => u.id === inc.reported_by);
        results.push({ ...inc, result_type: 'incident', relevance_score: Math.min(1.0, total / 20), reporter_name: reporter ? reporter.name : 'Unknown' });
      }
    });
  }
  results.sort((a, b) => b.relevance_score - a.relevance_score);
  logAction({ userId: req.user.id, action: 'SEARCH', metadata: { query: q, results: results.length } });
  res.json({ query: q, total: results.length, results });
});

module.exports = router;
"""

files["server/routes/reports.js"] = r"""const express = require('express');
const { read } = require('../store');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const router = express.Router();

router.get('/summary', authenticate, requireRole('super_admin'), (req, res) => {
  const incidents = read('incidents');
  const knowledge = read('knowledge');
  const users = read('users');
  const logs = read('audit_logs');
  const active = knowledge.filter(k => k.status === 'active');
  const avgConf = active.length ? (active.reduce((s, k) => s + k.confidence_score, 0) / active.length).toFixed(2) : 0;
  res.json({
    total_incidents: incidents.length,
    open_incidents: incidents.filter(i => ['open','investigating','escalated'].includes(i.status)).length,
    resolved_incidents: incidents.filter(i => i.status === 'resolved').length,
    total_knowledge: knowledge.length,
    active_knowledge: active.length,
    avg_confidence: parseFloat(avgConf),
    total_users: users.length,
    total_audit_events: logs.length
  });
});

module.exports = router;
"""

# ── SERVER DATA ───────────────────────────────────────────────────────────────

files["server/data/users.json"] = r"""[
  {"id":"u1","name":"Alice Mwangi","email":"alice@kalro.org","password":"$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi","role":"super_admin","department":"ICT","created_at":"2024-01-10T08:00:00Z"},
  {"id":"u2","name":"Brian Otieno","email":"brian@kalro.org","password":"$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi","role":"analyst","department":"Cybersecurity","created_at":"2024-01-15T09:00:00Z"},
  {"id":"u3","name":"Carol Njoroge","email":"carol@kalro.org","password":"$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi","role":"viewer","department":"Research","created_at":"2024-02-01T10:00:00Z"},
  {"id":"u4","name":"David Kamau","email":"david@kalro.org","password":"$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi","role":"analyst","department":"Cybersecurity","created_at":"2024-02-10T11:00:00Z"}
]
"""

files["server/data/incidents.json"] = r"""[
  {"id":"inc1","title":"Phishing Email Campaign Targeting Staff","type":"phishing","severity":"high","status":"resolved","description":"Multiple staff members received spoofed emails impersonating KALRO IT support requesting password resets. 3 users clicked the malicious link before the campaign was detected.","entities":{"ips":["196.201.214.55","41.89.64.12"],"emails":["itsupport-fake@kalro-help.com"]},"reported_by":"u2","assigned_to":"u2","created_at":"2024-03-05T09:15:00Z","updated_at":"2024-03-05T16:40:00Z"},
  {"id":"inc2","title":"Ransomware Detected on Research Workstation","type":"ransomware","severity":"critical","status":"resolved","description":"A ransomware variant was detected on a research workstation in the Crop Sciences lab. Files in the shared drive were partially encrypted before isolation. Identified as LockBit 3.0.","entities":{"ips":["10.0.2.45"],"file_hashes":["d41d8cd98f00b204e9800998ecf8427e"],"hostnames":["ws-cropscience-04"]},"reported_by":"u4","assigned_to":"u2","created_at":"2024-04-12T14:22:00Z","updated_at":"2024-04-13T10:00:00Z"},
  {"id":"inc3","title":"Unauthorized Access to HR Database","type":"unauthorized_access","severity":"critical","status":"investigating","description":"Anomalous login activity detected on the HR database server outside business hours. Multiple failed attempts followed by a successful login from an unrecognized IP.","entities":{"ips":["102.68.45.201"],"users":["hr_admin"],"systems":["hr-db-server-01"]},"reported_by":"u2","assigned_to":"u4","created_at":"2024-06-18T02:10:00Z","updated_at":"2024-06-18T09:30:00Z"},
  {"id":"inc4","title":"DDoS Attack on Public Web Portal","type":"ddos","severity":"high","status":"resolved","description":"KALRO public-facing web portal experienced a volumetric DDoS attack resulting in 4 hours of downtime. Traffic peaked at 12Gbps.","entities":{"ips":["various"],"systems":["web-portal-01","web-portal-02"]},"reported_by":"u4","assigned_to":"u2","created_at":"2024-07-03T11:00:00Z","updated_at":"2024-07-03T15:30:00Z"},
  {"id":"inc5","title":"Suspicious PowerShell Scripts Executed","type":"malware","severity":"medium","status":"escalated","description":"EDR alerts flagged obfuscated PowerShell scripts running on 2 admin workstations. Scripts attempted to download a payload from an external C2 server.","entities":{"ips":["185.220.101.32"],"hostnames":["admin-ws-01","admin-ws-02"]},"reported_by":"u2","assigned_to":"u2","created_at":"2024-08-20T13:45:00Z","updated_at":"2024-08-20T14:00:00Z"},
  {"id":"inc6","title":"Data Exfiltration Attempt via USB","type":"data_exfiltration","severity":"medium","status":"open","description":"DLP system flagged a large file transfer to a USB device on a researcher workstation. Files included restricted genomics research data.","entities":{"users":["researcher07@kalro.org"],"hostnames":["ws-genomics-02"]},"reported_by":"u4","assigned_to":null,"created_at":"2024-09-10T16:20:00Z","updated_at":"2024-09-10T16:20:00Z"}
]
"""

files["server/data/knowledge.json"] = r"""[
  {"id":"k1","title":"Phishing Response Playbook — Credential Harvesting","content":"When a phishing campaign is detected:\n1. Immediately block the sending domain at the email gateway.\n2. Search mail logs for all recipients of the campaign.\n3. Force password resets for any users who clicked the link.\n4. Check authentication logs for successful logins from suspicious IPs within 30 minutes of click events.\n5. Send an all-staff awareness alert within 2 hours.\n6. Report phishing domain to KE-CIRT and submit to PhishTank.\n\nLessons learned from KALRO incident (March 2024): Users are more likely to fall for emails that spoof internal IT support during system upgrade periods.","tags":["phishing","email","credential-theft","awareness"],"incident_id":"inc1","contributor_id":"u2","confidence_score":0.92,"version":2,"superseded_by":null,"status":"active","use_count":4,"last_used_at":"2024-08-15T10:00:00Z","created_at":"2024-03-06T08:00:00Z"},
  {"id":"k2","title":"Ransomware Containment and Recovery Procedure","content":"Immediate containment steps:\n1. Isolate the infected machine from the network immediately.\n2. Do NOT shut down the machine — volatile memory may contain decryption keys.\n3. Identify the ransomware variant using ID Ransomware.\n4. Check if the variant has a known decryptor at NoMoreRansom.org before paying.\n5. Identify the blast radius: check shared drives for encrypted files.\n6. Restore affected files from the most recent clean backup.\n7. Reimage the infected machine before reconnecting.\n\nKALRO note: Research data backups are on the NAS at \\\\backup-nas-01\\research. Snapshots every 6 hours.","tags":["ransomware","containment","recovery","backup","LockBit"],"incident_id":"inc2","contributor_id":"u4","confidence_score":0.95,"version":1,"superseded_by":null,"status":"active","use_count":2,"last_used_at":"2024-07-20T14:00:00Z","created_at":"2024-04-14T09:00:00Z"},
  {"id":"k3","title":"DDoS Mitigation — Upstream Filtering Activation","content":"KALRO ISP (Safaricom Business) provides upstream DDoS filtering as part of the enterprise SLA.\n\n1. Call Safaricom NOC (24/7 line — get current number from ICT manager).\n2. Provide account number and describe the attack type and volume.\n3. Request upstream null-routing or scrubbing center activation.\n4. Typical activation time: 15-30 minutes.\n5. Monitor traffic at the border router during mitigation.\n\nAlternatively: if Cloudflare is configured on the domain, enable Under Attack Mode in the Cloudflare dashboard.","tags":["ddos","network","mitigation","isp","cloudflare"],"incident_id":"inc4","contributor_id":"u2","confidence_score":0.88,"version":1,"superseded_by":null,"status":"active","use_count":1,"last_used_at":"2024-07-03T15:00:00Z","created_at":"2024-07-04T08:00:00Z"},
  {"id":"k4","title":"Compromised Credentials — Database Access Investigation","content":"When unauthorized database access is suspected:\n1. Immediately lock the compromised account.\n2. Pull the last 30 days of authentication logs for the account.\n3. Check for data exfiltration: review SELECT queries on sensitive tables.\n4. Check if the same credentials are used on other systems.\n5. Interview the account owner.\n6. Preserve logs before any remediation.\n7. If insider threat is suspected, escalate to HR and legal before confronting the user.\n\nKALRO HR database: Audit logs at /var/log/mysql/audit.log on hr-db-server-01. Retention 90 days.","tags":["unauthorized-access","database","credentials","insider-threat","investigation"],"incident_id":"inc3","contributor_id":"u2","confidence_score":0.85,"version":1,"superseded_by":null,"status":"active","use_count":1,"last_used_at":"2024-06-19T10:00:00Z","created_at":"2024-06-19T08:00:00Z"},
  {"id":"k5","title":"PowerShell Obfuscation Detection and Response","content":"Obfuscated PowerShell indicators:\n- Base64-encoded command strings in process arguments\n- Use of Invoke-Expression (IEX) or & operator\n- Download cradles: (New-Object Net.WebClient).DownloadString(...)\n\nResponse steps:\n1. Collect the full PowerShell transcript from the affected machine.\n2. Decode base64 payload using: [System.Text.Encoding]::Unicode.GetString([System.Convert]::FromBase64String('<string>'))\n3. Submit decoded payload to VirusTotal.\n4. Block the C2 IP at the firewall immediately.\n5. Review lateral movement: check for new scheduled tasks and registry run keys.\n\nPreventive: Enable PowerShell Constrained Language Mode on non-admin workstations.","tags":["powershell","malware","living-off-the-land","endpoint","C2"],"incident_id":"inc5","contributor_id":"u2","confidence_score":0.78,"version":1,"superseded_by":null,"status":"active","use_count":0,"last_used_at":null,"created_at":"2024-08-21T09:00:00Z"},
  {"id":"k6","title":"Old Phishing Response Guide (v1 — Superseded)","content":"Block the domain and reset passwords. Notify staff.","tags":["phishing","email"],"incident_id":"inc1","contributor_id":"u2","confidence_score":0.2,"version":1,"superseded_by":"k1","status":"superseded","use_count":3,"last_used_at":"2024-03-10T09:00:00Z","created_at":"2024-03-05T17:00:00Z"}
]
"""

files["server/data/annotations.json"] = r"""[
  {"id":"a1","knowledge_id":"k1","user_id":"u4","note":"Used this during the August PowerShell incident — the step about checking auth logs within 30 min of click events was particularly useful.","created_at":"2024-08-15T10:30:00Z"},
  {"id":"a2","knowledge_id":"k2","user_id":"u2","note":"Confirmed: NoMoreRansom had no decryptor for LockBit 3.0 as of April 2024. We restored from backup successfully.","created_at":"2024-04-13T11:00:00Z"},
  {"id":"a3","knowledge_id":"k4","user_id":"u4","note":"HR escalation was sensitive — legal needed to be looped in before any action. Make sure this step is not skipped.","created_at":"2024-06-19T14:00:00Z"}
]
"""

files["server/data/audit_logs.json"] = r"""[
  {"id":"log1","user_id":"u2","action":"LOGIN","target_type":null,"target_id":null,"metadata":{"ip":"10.0.1.5"},"created_at":"2024-09-10T08:00:00Z"},
  {"id":"log2","user_id":"u2","action":"CREATE_INCIDENT","target_type":"incident","target_id":"inc5","metadata":{"title":"Suspicious PowerShell Scripts Executed"},"created_at":"2024-08-20T13:45:00Z"},
  {"id":"log3","user_id":"u4","action":"CREATE_KNOWLEDGE","target_type":"knowledge","target_id":"k2","metadata":{"title":"Ransomware Containment and Recovery Procedure"},"created_at":"2024-04-14T09:00:00Z"},
  {"id":"log4","user_id":"u2","action":"SEARCH","target_type":null,"target_id":null,"metadata":{"query":"ransomware recovery"},"created_at":"2024-07-20T14:00:00Z"},
  {"id":"log5","user_id":"u1","action":"CREATE_USER","target_type":"user","target_id":"u4","metadata":{"name":"David Kamau","role":"analyst"},"created_at":"2024-02-10T11:00:00Z"}
]
"""

# ── CLIENT ────────────────────────────────────────────────────────────────────

files["client/src/main.jsx"] = r"""import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
)
"""

files["client/src/api/axios.js"] = r"""import axios from 'axios'
const api = axios.create({ baseURL: '/api' })
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})
api.interceptors.response.use(res => res, err => {
  if (err.response?.status === 401) {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    window.location.href = '/login'
  }
  return Promise.reject(err)
})
export default api
"""

files["client/src/context/AuthContext.jsx"] = r"""import { createContext, useContext, useState } from 'react'
import api from '../api/axios'
const AuthContext = createContext(null)
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')) } catch { return null }
  })
  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password })
    localStorage.setItem('token', res.data.token)
    localStorage.setItem('user', JSON.stringify(res.data.user))
    setUser(res.data.user)
    return res.data.user
  }
  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
  }
  const isAdmin = user?.role === 'super_admin'
  const isAnalyst = user?.role === 'analyst' || user?.role === 'super_admin'
  return <AuthContext.Provider value={{ user, login, logout, isAdmin, isAnalyst }}>{children}</AuthContext.Provider>
}
export const useAuth = () => useContext(AuthContext)
"""

# Write all files
for path, content in files.items():
    os.makedirs(os.path.dirname(path) if os.path.dirname(path) else '.', exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content.lstrip('\n'))
    print(f"✓ {path}")

print("\nAll files written successfully.")

# These are appended separately due to size
large_files = {}

large_files["client/src/App.jsx"] = """import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Incidents from './pages/Incidents'
import IncidentDetail from './pages/IncidentDetail'
import Knowledge from './pages/Knowledge'
import KnowledgeDetail from './pages/KnowledgeDetail'
import Search from './pages/Search'
import Reports from './pages/Reports'
import Users from './pages/Users'

const Protected = ({ children, adminOnly = false }) => {
  const { user, isAdmin } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Protected><Layout /></Protected>}>
            <Route index element={<Dashboard />} />
            <Route path="incidents" element={<Incidents />} />
            <Route path="incidents/:id" element={<IncidentDetail />} />
            <Route path="knowledge" element={<Knowledge />} />
            <Route path="knowledge/:id" element={<KnowledgeDetail />} />
            <Route path="search" element={<Search />} />
            <Route path="reports" element={<Protected adminOnly><Reports /></Protected>} />
            <Route path="users" element={<Protected adminOnly><Users /></Protected>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
"""

import os
for path, content in large_files.items():
    os.makedirs(os.path.dirname(path) if os.path.dirname(path) else '.', exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"✓ {path}")
