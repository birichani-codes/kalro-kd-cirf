const fs = require('fs');
const path = require('path');

function write(filePath, content) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✓', filePath);
}

// ─── ROOT ────────────────────────────────────────────────────────────────────

write('package.json', JSON.stringify({
  name: "kalro-ikf", version: "1.0.0",
  scripts: {
    dev: "concurrently \"npm run server\" \"npm run client\"",
    server: "cd server && npm run dev",
    client: "cd client && npm run dev",
    "install:all": "cd server && npm install && cd ../client && npm install"
  },
  devDependencies: { concurrently: "^8.2.2" }
}, null, 2));

write('.gitignore', 'node_modules/\n.env\nclient/dist/\n*.log\n');

// ─── SERVER CONFIG ────────────────────────────────────────────────────────────

write('server/package.json', JSON.stringify({
  name: "kalro-ikf-server", version: "1.0.0", main: "index.js",
  scripts: { start: "node index.js", dev: "nodemon index.js" },
  dependencies: {
    bcryptjs: "^2.4.3", cors: "^2.8.5", dotenv: "^16.3.1",
    express: "^4.18.2", jsonwebtoken: "^9.0.2", uuid: "^9.0.0"
  },
  devDependencies: { nodemon: "^3.0.2" }
}, null, 2));

write('server/.env', 'PORT=3000\nJWT_SECRET=kalro-ikf-change-this-in-production-2024\n');

// ─── SERVER CORE ──────────────────────────────────────────────────────────────

write('server/store.js', `const fs = require('fs'), path = require('path');
const DATA_DIR = path.join(__dirname, 'data');
const read = (file) => { const fp = path.join(DATA_DIR, file+'.json'); if (!fs.existsSync(fp)) return []; return JSON.parse(fs.readFileSync(fp,'utf8')); };
const write = (file, data) => { fs.writeFileSync(path.join(DATA_DIR, file+'.json'), JSON.stringify(data,null,2)); };
module.exports = { read, write };
`);

write('server/index.js', `require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors()); app.use(express.json());
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/incidents', require('./routes/incidents'));
app.use('/api/knowledge', require('./routes/knowledge'));
app.use('/api/search',    require('./routes/search'));
app.use('/api/reports',   require('./routes/reports'));
app.use('/api/pir',       require('./routes/pir'));
const { router: auditRouter } = require('./routes/audit');
app.use('/api/audit', auditRouter);
app.get('/api/health', (req,res) => res.json({ status:'ok', time: new Date().toISOString() }));
app.use((err,req,res,next) => { console.error(err.stack); res.status(500).json({ error:'Internal server error' }); });
app.listen(PORT, () => console.log('KALRO IKF running on http://localhost:'+PORT));
`);

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────

write('server/middleware/auth.js', `const jwt = require('jsonwebtoken');
const { read } = require('../store');
const JWT_SECRET = process.env.JWT_SECRET || 'kalro-ikf-secret-2024';
const authenticate = (req, res, next) => {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error:'No token provided' });
  try {
    const d = jwt.verify(h.split(' ')[1], JWT_SECRET);
    const user = read('users').find(u => u.id === d.id);
    if (!user) return res.status(401).json({ error:'User not found' });
    req.user = { id:user.id, name:user.name, email:user.email, role:user.role };
    next();
  } catch(e) { res.status(401).json({ error:'Invalid or expired token' }); }
};
module.exports = { authenticate, JWT_SECRET };
`);

write('server/middleware/rbac.js', `const H = { super_admin:4, analyst:3, viewer:2, system:1 };
const requireRole = (...roles) => (req,res,next) => {
  if (!req.user) return res.status(401).json({ error:'Unauthenticated' });
  if (!roles.includes(req.user.role)) return res.status(403).json({ error:'Insufficient permissions' });
  next();
};
const requireMinRole = (min) => (req,res,next) => {
  if (!req.user) return res.status(401).json({ error:'Unauthenticated' });
  if ((H[req.user.role]||0) < (H[min]||0)) return res.status(403).json({ error:'Insufficient permissions' });
  next();
};
module.exports = { requireRole, requireMinRole };
`);

// ─── ROUTES: AUDIT ────────────────────────────────────────────────────────────

write('server/routes/audit.js', `const express = require('express');
const { v4: uuid } = require('uuid');
const { read, write } = require('../store');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const router = express.Router();

const logAction = ({ userId, action, targetType=null, targetId=null, metadata={} }) => {
  const logs = read('audit_logs');
  logs.unshift({ id:'log'+uuid().slice(0,8), user_id:userId, action, target_type:targetType, target_id:targetId, metadata, created_at:new Date().toISOString() });
  write('audit_logs', logs);
};

router.get('/', authenticate, requireRole('super_admin'), (req,res) => {
  const users = read('users');
  res.json(read('audit_logs').map(l => { const u=users.find(u=>u.id===l.user_id); return {...l, user_name:u?u.name:'Unknown', user_role:u?u.role:null}; }));
});
module.exports = { router, logAction };
`);

// ─── ROUTES: AUTH ─────────────────────────────────────────────────────────────

write('server/routes/auth.js', `const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const { read, write } = require('../store');
const { authenticate, JWT_SECRET } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAction } = require('./audit');
const router = express.Router();

router.post('/login', async (req,res) => {
  const { email, password } = req.body;
  if (!email||!password) return res.status(400).json({ error:'Email and password required' });
  const user = read('users').find(u => u.email===email);
  if (!user) return res.status(401).json({ error:'Invalid credentials' });
  if (!await bcrypt.compare(password, user.password)) return res.status(401).json({ error:'Invalid credentials' });
  const token = jwt.sign({ id:user.id, email:user.email, role:user.role }, JWT_SECRET, { expiresIn:'8h' });
  logAction({ userId:user.id, action:'LOGIN', metadata:{ email } });
  res.json({ token, user:{ id:user.id, name:user.name, email:user.email, role:user.role, department:user.department } });
});

router.get('/me', authenticate, (req,res) => {
  const user = read('users').find(u => u.id===req.user.id);
  if (!user) return res.status(404).json({ error:'Not found' });
  const { password, ...safe } = user; res.json(safe);
});

router.get('/users', authenticate, requireRole('super_admin'), (req,res) => {
  res.json(read('users').map(({ password, ...u }) => u));
});

router.post('/users', authenticate, requireRole('super_admin'), async (req,res) => {
  const { name, email, password, role, department } = req.body;
  if (!name||!email||!password||!role) return res.status(400).json({ error:'name, email, password, role required' });
  const users = read('users');
  if (users.find(u => u.email===email)) return res.status(409).json({ error:'Email already exists' });
  const newUser = { id:'u'+uuid().slice(0,8), name, email, password:await bcrypt.hash(password,10), role, department:department||'', created_at:new Date().toISOString() };
  users.push(newUser); write('users', users);
  logAction({ userId:req.user.id, action:'CREATE_USER', targetType:'user', targetId:newUser.id, metadata:{ name, role } });
  const { password:_, ...safe } = newUser; res.status(201).json(safe);
});

router.put('/users/:id', authenticate, requireRole('super_admin'), async (req,res) => {
  const users = read('users'); const idx = users.findIndex(u => u.id===req.params.id);
  if (idx===-1) return res.status(404).json({ error:'Not found' });
  const { name, role, department } = req.body;
  if (name) users[idx].name=name; if (role) users[idx].role=role; if (department!==undefined) users[idx].department=department;
  write('users', users); logAction({ userId:req.user.id, action:'UPDATE_USER', targetType:'user', targetId:req.params.id });
  const { password, ...safe } = users[idx]; res.json(safe);
});

router.delete('/users/:id', authenticate, requireRole('super_admin'), (req,res) => {
  let users = read('users');
  if (!users.find(u => u.id===req.params.id)) return res.status(404).json({ error:'Not found' });
  write('users', users.filter(u => u.id!==req.params.id));
  logAction({ userId:req.user.id, action:'DELETE_USER', targetType:'user', targetId:req.params.id });
  res.json({ success:true });
});
module.exports = router;
`);

// ─── SLA HELPER ───────────────────────────────────────────────────────────────
// S0=critical→2h, S1=high→4h, S2=medium→8h, S3=low→24h
const SLA_HOURS = { critical:2, high:4, medium:8, low:24 };

write('server/routes/incidents.js', `const express = require('express');
const { v4: uuid } = require('uuid');
const { read, write } = require('../store');
const { authenticate } = require('../middleware/auth');
const { requireMinRole } = require('../middleware/rbac');
const { logAction } = require('./audit');
const router = express.Router();

const SLA_HOURS = { critical:2, high:4, medium:8, low:24 };

function computeSlaDeadline(severity, created_at) {
  const h = SLA_HOURS[severity] || 8;
  return new Date(new Date(created_at).getTime() + h*60*60*1000).toISOString();
}

function enrichIncident(inc, users, knowledge) {
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
  return { ...inc, sla_deadline, sla_breached, sla_minutes_remaining, reporter_name:r?r.name:'Unknown', assignee_name:a?a.name:'Unassigned', ...(related!==undefined?{related_knowledge:related}:{}) };
}

router.get('/', authenticate, (req,res) => {
  const { status, severity, type, is_major } = req.query;
  const users = read('users'); const knowledge = read('knowledge');
  let f = read('incidents');
  if (status)   f = f.filter(i => i.status===status);
  if (severity) f = f.filter(i => i.severity===severity);
  if (type)     f = f.filter(i => i.type===type);
  if (is_major) f = f.filter(i => i.is_major===true);
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

router.get('/:id', authenticate, (req,res) => {
  const inc = read('incidents').find(i => i.id===req.params.id);
  if (!inc) return res.status(404).json({ error:'Incident not found' });
  res.json(enrichIncident(inc, read('users'), read('knowledge')));
});

router.post('/', authenticate, requireMinRole('analyst'), (req,res) => {
  const { title, type, severity, description, entities, is_major } = req.body;
  if (!title||!type||!severity) return res.status(400).json({ error:'title, type, severity required' });
  const incidents = read('incidents');
  const created_at = new Date().toISOString();
  const newInc = {
    id:'inc'+uuid().slice(0,8), title, type, severity, status:'open',
    is_major: is_major||false, description:description||'', entities:entities||{},
    reported_by:req.user.id, assigned_to:null,
    sla_deadline: computeSlaDeadline(severity, created_at),
    created_at, updated_at:created_at
  };
  incidents.push(newInc); write('incidents', incidents);
  logAction({ userId:req.user.id, action:'CREATE_INCIDENT', targetType:'incident', targetId:newInc.id, metadata:{ title, severity, is_major:newInc.is_major } });
  res.status(201).json(newInc);
});

router.put('/:id', authenticate, requireMinRole('analyst'), (req,res) => {
  const incidents = read('incidents');
  const idx = incidents.findIndex(i => i.id===req.params.id);
  if (idx===-1) return res.status(404).json({ error:'Not found' });
  ['title','status','severity','description','assigned_to','entities','type','is_major'].forEach(f => {
    if (req.body[f]!==undefined) incidents[idx][f]=req.body[f];
  });
  // recalculate SLA if severity changed
  if (req.body.severity) incidents[idx].sla_deadline = computeSlaDeadline(req.body.severity, incidents[idx].created_at);
  incidents[idx].updated_at = new Date().toISOString();
  write('incidents', incidents);
  logAction({ userId:req.user.id, action:'UPDATE_INCIDENT', targetType:'incident', targetId:req.params.id, metadata:{ status:incidents[idx].status } });
  res.json(incidents[idx]);
});

router.delete('/:id', authenticate, requireMinRole('super_admin'), (req,res) => {
  let incidents = read('incidents');
  if (!incidents.find(i => i.id===req.params.id)) return res.status(404).json({ error:'Not found' });
  write('incidents', incidents.filter(i => i.id!==req.params.id));
  logAction({ userId:req.user.id, action:'DELETE_INCIDENT', targetType:'incident', targetId:req.params.id });
  res.json({ success:true });
});

module.exports = router;
`);

// ─── ROUTES: KNOWLEDGE ────────────────────────────────────────────────────────

write('server/routes/knowledge.js', `const express = require('express');
const { v4: uuid } = require('uuid');
const { read, write } = require('../store');
const { authenticate } = require('../middleware/auth');
const { requireMinRole } = require('../middleware/rbac');
const { logAction } = require('./audit');
const router = express.Router();

router.get('/', authenticate, (req,res) => {
  const { status, tag, knowledge_type } = req.query;
  const users = read('users');
  let f = read('knowledge');
  if (status) f = f.filter(k => k.status===status);
  else f = f.filter(k => k.status!=='superseded');
  if (tag)            f = f.filter(k => k.tags.includes(tag));
  if (knowledge_type) f = f.filter(k => k.knowledge_type===knowledge_type);
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
  const { title, content, tags, incident_id, knowledge_type } = req.body;
  if (!title||!content) return res.status(400).json({ error:'title and content required' });
  const knowledge = read('knowledge');
  const newEntry = { id:'k'+uuid().slice(0,8), title, content, tags:tags||[], incident_id:incident_id||null,
    knowledge_type: knowledge_type||'lessons-learned', contributor_id:req.user.id,
    confidence_score:1.0, version:1, superseded_by:null, status:'active',
    use_count:0, last_used_at:null, created_at:new Date().toISOString() };
  knowledge.push(newEntry); write('knowledge', knowledge);
  logAction({ userId:req.user.id, action:'CREATE_KNOWLEDGE', targetType:'knowledge', targetId:newEntry.id, metadata:{ title, knowledge_type:newEntry.knowledge_type } });
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
  const knowledge = read('knowledge');
  const idx = knowledge.findIndex(k => k.id===req.params.id);
  if (idx===-1) return res.status(404).json({ error:'Not found' });
  knowledge[idx].use_count+=1; knowledge[idx].last_used_at=new Date().toISOString();
  knowledge[idx].confidence_score=Math.min(1.0, knowledge[idx].confidence_score+0.02);
  write('knowledge', knowledge);
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

module.exports = router;
`);

// ─── ROUTES: SEARCH ───────────────────────────────────────────────────────────

write('server/routes/search.js', `const express = require('express');
const { read } = require('../store');
const { authenticate } = require('../middleware/auth');
const { logAction } = require('./audit');
const router = express.Router();

const score = (text, q) => {
  if (!text||!q) return 0;
  const c = text.toLowerCase();
  return q.toLowerCase().split(/\\s+/).reduce((s,t)=>s+(c.match(new RegExp(t,'g'))||[]).length,0);
};

router.get('/', authenticate, (req,res) => {
  const { q, type='all' } = req.query;
  if (!q||q.trim().length<2) return res.status(400).json({ error:'Query must be at least 2 characters' });
  const users=read('users'), results=[];
  if (type==='all'||type==='knowledge') {
    read('knowledge').filter(k=>k.status==='active').forEach(k => {
      const total = score(k.title+' '+k.content+' '+k.tags.join(' '), q) + (k.tags.some(t=>t.toLowerCase().includes(q.toLowerCase()))?5:0);
      if (total>0) { const c=users.find(u=>u.id===k.contributor_id);
        results.push({...k,result_type:'knowledge',relevance_score:Math.min(1.0,(total/20)*k.confidence_score),contributor_name:c?c.name:'Unknown'}); }
    });
  }
  if (type==='all'||type==='incident') {
    read('incidents').forEach(i => {
      const total = score(i.title+' '+(i.description||'')+' '+i.type, q);
      if (total>0) { const r=users.find(u=>u.id===i.reported_by);
        results.push({...i,result_type:'incident',relevance_score:Math.min(1.0,total/20),reporter_name:r?r.name:'Unknown'}); }
    });
  }
  results.sort((a,b)=>b.relevance_score-a.relevance_score);
  logAction({ userId:req.user.id, action:'SEARCH', metadata:{ query:q, results:results.length } });
  res.json({ query:q, total:results.length, results });
});
module.exports = router;
`);

// ─── ROUTES: PIR (Post-Incident Review) ──────────────────────────────────────

write('server/routes/pir.js', `const express = require('express');
const { v4: uuid } = require('uuid');
const { read, write } = require('../store');
const { authenticate } = require('../middleware/auth');
const { requireMinRole } = require('../middleware/rbac');
const { logAction } = require('./audit');
const router = express.Router();

router.get('/', authenticate, (req,res) => {
  const pirs = read('pirs'); const users = read('users'); const incidents = read('incidents');
  res.json(pirs.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).map(p => {
    const a=users.find(u=>u.id===p.author_id), inc=incidents.find(i=>i.id===p.incident_id);
    return { ...p, author_name:a?a.name:'Unknown', incident_title:inc?inc.title:'Unknown' };
  }));
});

router.get('/:id', authenticate, (req,res) => {
  const pir = read('pirs').find(p=>p.id===req.params.id);
  if (!pir) return res.status(404).json({ error:'PIR not found' });
  const users=read('users'), incidents=read('incidents');
  const a=users.find(u=>u.id===pir.author_id), inc=incidents.find(i=>i.id===pir.incident_id);
  res.json({ ...pir, author_name:a?a.name:'Unknown', incident_title:inc?inc.title:'Unknown' });
});

router.post('/', authenticate, requireMinRole('analyst'), (req,res) => {
  const { incident_id, timeline, root_cause, five_whys, what_worked, what_failed, action_items, participants } = req.body;
  if (!incident_id||!root_cause) return res.status(400).json({ error:'incident_id and root_cause required' });
  const pirs = read('pirs');
  if (pirs.find(p=>p.incident_id===incident_id)) return res.status(409).json({ error:'PIR already exists for this incident' });
  const newPIR = {
    id:'pir'+uuid().slice(0,8), incident_id,
    author_id:req.user.id, timeline:timeline||'', root_cause,
    five_whys:five_whys||[], what_worked:what_worked||'',
    what_failed:what_failed||'', action_items:action_items||[],
    participants:participants||[], status:'draft',
    created_at:new Date().toISOString(), updated_at:new Date().toISOString()
  };
  pirs.push(newPIR); write('pirs', pirs);
  logAction({ userId:req.user.id, action:'CREATE_PIR', targetType:'pir', targetId:newPIR.id, metadata:{ incident_id } });
  res.status(201).json(newPIR);
});

router.put('/:id', authenticate, requireMinRole('analyst'), (req,res) => {
  const pirs = read('pirs'); const idx = pirs.findIndex(p=>p.id===req.params.id);
  if (idx===-1) return res.status(404).json({ error:'Not found' });
  ['timeline','root_cause','five_whys','what_worked','what_failed','action_items','participants','status'].forEach(f=>{
    if (req.body[f]!==undefined) pirs[idx][f]=req.body[f];
  });
  pirs[idx].updated_at=new Date().toISOString();
  write('pirs', pirs);
  logAction({ userId:req.user.id, action:'UPDATE_PIR', targetType:'pir', targetId:req.params.id });
  res.json(pirs[idx]);
});

module.exports = router;
`);

// ─── ROUTES: REPORTS ─────────────────────────────────────────────────────────

write('server/routes/reports.js', `const express = require('express');
const { read } = require('../store');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const router = express.Router();

const SLA_HOURS = { critical:2, high:4, medium:8, low:24 };

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

function computeMetrics(incidents) {
  const resolved = incidents.filter(i=>['resolved','closed'].includes(i.status));
  const now = new Date();
  // SLA breach rate
  const active = incidents.filter(i=>!['resolved','closed'].includes(i.status));
  const breached = active.filter(i=>now>new Date(slaDeadline(i))).length;
  const sla_breach_rate = active.length?Math.round((breached/active.length)*100):0;
  // avg time to resolve by severity (minutes)
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
  return { sla_breach_rate, ttr_by_severity:ttrBySeverity, recurrence_count:recurrences };
}

router.get('/dashboard', authenticate, (req,res) => {
  const incidents=read('incidents'), knowledge=read('knowledge'),
        users=read('users'), logs=read('audit_logs'), pirs=read('pirs');
  const active=knowledge.filter(k=>k.status==='active');
  const byStatus={},bySeverity={},byType={};
  incidents.forEach(i=>{ byStatus[i.status]=(byStatus[i.status]||0)+1; bySeverity[i.severity]=(bySeverity[i.severity]||0)+1; byType[i.type]=(byType[i.type]||0)+1; });
  const avgConf=active.length?parseFloat((active.reduce((s,k)=>s+k.confidence_score,0)/active.length).toFixed(2)):0;
  const gaps=computeGaps(incidents,knowledge);
  const metrics=computeMetrics(incidents);
  const pir_completion_rate=incidents.filter(i=>i.status==='closed').length?
    Math.round((pirs.length/incidents.filter(i=>i.status==='closed').length)*100):0;
  const enrich=(arr,fld)=>arr.map(i=>{const r=users.find(u=>u.id===i[fld]);return{...i,reporter_name:r?r.name:'Unknown'};});
  res.json({
    summary:{ total_incidents:incidents.length, open_incidents:incidents.filter(i=>['open','investigating','escalated'].includes(i.status)).length,
      resolved_incidents:incidents.filter(i=>i.status==='resolved').length, total_knowledge:knowledge.length,
      active_knowledge:active.length, avg_confidence:avgConf, total_users:users.length,
      total_audit_events:logs.length, major_incidents:incidents.filter(i=>i.is_major).length,
      pir_count:pirs.length, pir_completion_rate },
    by_status:byStatus, by_severity:bySeverity, by_type:byType,
    coverage_rate:coverageRate(gaps), gaps, uncovered_gaps:gaps.filter(g=>!g.covered),
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
`);

// ─── SEED DATA ────────────────────────────────────────────────────────────────

write('server/data/users.json', JSON.stringify([
  {id:'u1',name:'Alice Mwangi',email:'alice@kalro.org',password:'$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',role:'super_admin',department:'ICT',created_at:'2024-01-10T08:00:00Z'},
  {id:'u2',name:'Brian Otieno',email:'brian@kalro.org',password:'$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',role:'analyst',department:'Cybersecurity',created_at:'2024-01-15T09:00:00Z'},
  {id:'u3',name:'Carol Njoroge',email:'carol@kalro.org',password:'$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',role:'viewer',department:'Research',created_at:'2024-02-01T10:00:00Z'},
  {id:'u4',name:'David Kamau',email:'david@kalro.org',password:'$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',role:'analyst',department:'Cybersecurity',created_at:'2024-02-10T11:00:00Z'}
], null, 2));

write('server/data/incidents.json', JSON.stringify([
  {id:'inc1',title:'Phishing Email Campaign Targeting Staff',type:'phishing',severity:'high',status:'resolved',is_major:false,description:'Multiple staff received spoofed emails impersonating KALRO IT support requesting password resets. 3 users clicked the malicious link.',entities:{ips:['196.201.214.55'],emails:['itsupport-fake@kalro-help.com']},reported_by:'u2',assigned_to:'u2',sla_deadline:'2024-03-05T13:15:00Z',created_at:'2024-03-05T09:15:00Z',updated_at:'2024-03-05T16:40:00Z'},
  {id:'inc2',title:'Ransomware Detected on Research Workstation',type:'ransomware',severity:'critical',status:'resolved',is_major:true,description:'LockBit 3.0 detected on a Crop Sciences workstation. Files partially encrypted before isolation.',entities:{ips:['10.0.2.45'],hostnames:['ws-cropscience-04']},reported_by:'u4',assigned_to:'u2',sla_deadline:'2024-04-12T16:22:00Z',created_at:'2024-04-12T14:22:00Z',updated_at:'2024-04-13T10:00:00Z'},
  {id:'inc3',title:'Unauthorized Access to HR Database',type:'unauthorized_access',severity:'critical',status:'investigating',is_major:true,description:'Anomalous login detected on HR database server outside business hours. Multiple failed attempts followed by a successful login from unrecognized IP.',entities:{ips:['102.68.45.201'],users:['hr_admin']},reported_by:'u2',assigned_to:'u4',sla_deadline:'2024-06-18T04:10:00Z',created_at:'2024-06-18T02:10:00Z',updated_at:'2024-06-18T09:30:00Z'},
  {id:'inc4',title:'DDoS Attack on Public Web Portal',type:'ddos',severity:'high',status:'resolved',is_major:true,description:'KALRO public web portal experienced volumetric DDoS attack. 4 hours downtime. Traffic peaked at 12Gbps.',entities:{systems:['web-portal-01']},reported_by:'u4',assigned_to:'u2',sla_deadline:'2024-07-03T15:00:00Z',created_at:'2024-07-03T11:00:00Z',updated_at:'2024-07-03T15:30:00Z'},
  {id:'inc5',title:'Suspicious PowerShell Scripts Executed',type:'malware',severity:'medium',status:'escalated',is_major:false,description:'EDR flagged obfuscated PowerShell scripts on 2 admin workstations attempting C2 download.',entities:{ips:['185.220.101.32'],hostnames:['admin-ws-01','admin-ws-02']},reported_by:'u2',assigned_to:'u2',sla_deadline:'2024-08-20T21:45:00Z',created_at:'2024-08-20T13:45:00Z',updated_at:'2024-08-20T14:00:00Z'},
  {id:'inc6',title:'Data Exfiltration Attempt via USB',type:'data_exfiltration',severity:'medium',status:'open',is_major:false,description:'DLP flagged large file transfer to USB on researcher workstation containing restricted genomics data.',entities:{users:['researcher07@kalro.org']},reported_by:'u4',assigned_to:null,sla_deadline:'2024-09-11T00:20:00Z',created_at:'2024-09-10T16:20:00Z',updated_at:'2024-09-10T16:20:00Z'}
], null, 2));

write('server/data/knowledge.json', JSON.stringify([
  {id:'k1',title:'Phishing Response Playbook',knowledge_type:'playbook',content:'1. Block sending domain at email gateway.\n2. Search mail logs for all recipients.\n3. Force password resets for users who clicked.\n4. Check auth logs for logins from suspicious IPs within 30 minutes of click events.\n5. Send all-staff awareness alert within 2 hours.\n6. Report domain to KE-CIRT and PhishTank.\n\nKALRO note: Users are more likely to fall for emails spoofing IT support during maintenance windows.',tags:['phishing','email','credential-theft','awareness'],incident_id:'inc1',contributor_id:'u2',confidence_score:0.92,version:2,superseded_by:null,status:'active',use_count:4,last_used_at:'2024-08-15T10:00:00Z',created_at:'2024-03-06T08:00:00Z'},
  {id:'k2',title:'Ransomware Containment and Recovery',knowledge_type:'runbook',content:'1. Isolate infected machine immediately — pull network cable.\n2. Do NOT shut down — volatile memory may contain decryption keys.\n3. Identify variant using ID Ransomware (upload ransom note).\n4. Check NoMoreRansom.org for known decryptor before considering payment.\n5. Check shared drives for encrypted files.\n6. Restore from most recent clean backup — verify integrity first.\n7. Reimage before reconnecting.\n\nKALRO: Research backups on NAS at backup-nas-01. Snapshots every 6 hours. Contact David Kamau for access.',tags:['ransomware','containment','recovery','backup'],incident_id:'inc2',contributor_id:'u4',confidence_score:0.95,version:1,superseded_by:null,status:'active',use_count:2,last_used_at:'2024-07-20T14:00:00Z',created_at:'2024-04-14T09:00:00Z'},
  {id:'k3',title:'DDoS Mitigation — Upstream Filtering',knowledge_type:'runbook',content:'Safaricom Business provides upstream DDoS filtering under enterprise SLA.\n1. Call Safaricom NOC 24/7 — get current number from ICT manager.\n2. Provide account number, describe attack type and volume.\n3. Request null-routing or scrubbing center activation.\n4. Activation time: 15-30 minutes.\n5. Monitor border router during mitigation.\n\nAlternative: Enable Cloudflare Under Attack Mode if domain is proxied.',tags:['ddos','network','mitigation','isp'],incident_id:'inc4',contributor_id:'u2',confidence_score:0.88,version:1,superseded_by:null,status:'active',use_count:1,last_used_at:'2024-07-03T15:00:00Z',created_at:'2024-07-04T08:00:00Z'},
  {id:'k4',title:'Compromised DB Credentials — Investigation',knowledge_type:'playbook',content:'1. Lock the compromised account immediately.\n2. Pull 30 days of auth logs.\n3. Check for data exfiltration — review SELECT queries on sensitive tables.\n4. Check credential reuse across systems.\n5. Interview account owner.\n6. Preserve logs before remediation.\n7. Escalate to HR and legal before confronting the user if insider threat suspected.\n\nKALRO: Audit logs at /var/log/mysql/audit.log on hr-db-server-01. 90-day retention.',tags:['unauthorized-access','database','credentials','insider-threat'],incident_id:'inc3',contributor_id:'u2',confidence_score:0.85,version:1,superseded_by:null,status:'active',use_count:1,last_used_at:'2024-06-19T10:00:00Z',created_at:'2024-06-19T08:00:00Z'},
  {id:'k5',title:'PowerShell Obfuscation Detection',knowledge_type:'reference',content:'Indicators: Base64-encoded args, Invoke-Expression (IEX), download cradles.\n\n1. Collect PowerShell transcript from machine.\n2. Decode base64: [System.Text.Encoding]::Unicode.GetString([System.Convert]::FromBase64String("..."))\n3. Submit to VirusTotal.\n4. Block C2 IP at firewall immediately.\n5. Check for new scheduled tasks and registry run keys.\n\nPreventive: Enable Constrained Language Mode on non-admin workstations via Group Policy.',tags:['powershell','malware','endpoint','C2'],incident_id:'inc5',contributor_id:'u2',confidence_score:0.48,version:1,superseded_by:null,status:'active',use_count:0,last_used_at:null,created_at:'2024-08-21T09:00:00Z'}
], null, 2));

write('server/data/annotations.json', JSON.stringify([
  {id:'a1',knowledge_id:'k1',user_id:'u4',note:'Checking auth logs within 30 min of click events was key during the August incident.',created_at:'2024-08-15T10:30:00Z'},
  {id:'a2',knowledge_id:'k2',user_id:'u2',note:'NoMoreRansom had no decryptor for LockBit 3.0 as of April 2024. Backup restoration successful.',created_at:'2024-04-13T11:00:00Z'},
  {id:'a3',knowledge_id:'k4',user_id:'u4',note:'HR escalation was sensitive — legal must be looped in before confronting the user. Do not skip.',created_at:'2024-06-19T14:00:00Z'}
], null, 2));

write('server/data/audit_logs.json', JSON.stringify([
  {id:'log1',user_id:'u2',action:'LOGIN',target_type:null,target_id:null,metadata:{ip:'10.0.1.5'},created_at:'2024-09-10T08:00:00Z'},
  {id:'log2',user_id:'u2',action:'CREATE_INCIDENT',target_type:'incident',target_id:'inc5',metadata:{title:'Suspicious PowerShell'},created_at:'2024-08-20T13:45:00Z'},
  {id:'log3',user_id:'u4',action:'CREATE_KNOWLEDGE',target_type:'knowledge',target_id:'k2',metadata:{title:'Ransomware Containment'},created_at:'2024-04-14T09:00:00Z'},
  {id:'log4',user_id:'u2',action:'SEARCH',target_type:null,target_id:null,metadata:{query:'ransomware recovery'},created_at:'2024-07-20T14:00:00Z'},
  {id:'log5',user_id:'u1',action:'CREATE_USER',target_type:'user',target_id:'u4',metadata:{name:'David Kamau',role:'analyst'},created_at:'2024-02-10T11:00:00Z'}
], null, 2));

write('server/data/pirs.json', JSON.stringify([
  {id:'pir1',incident_id:'inc1',author_id:'u2',
   timeline:'09:15 - Phishing emails reported by 3 staff.\n09:45 - Domain blocked at email gateway.\n10:30 - Password resets issued to affected users.\n11:00 - All-staff alert sent.\n14:00 - KE-CIRT notified.\n16:40 - Incident closed.',
   root_cause:'Staff clicked links in emails that mimicked an internal IT maintenance notification. No MFA was enforced on the affected accounts.',
   five_whys:['Why did users click? — Email appeared to come from a known internal address.','Why was it convincing? — No email DKIM/DMARC enforcement on the spoofed domain.','Why no DMARC? — Policy set to monitoring-only, not enforcement.','Why monitoring-only? — Initial rollout was cautious and was never moved to enforcement.','Why was it never updated? — No owner assigned for email security policy review.'],
   what_worked:'Rapid domain block. Awareness message sent same day. Users responded quickly to password reset instructions.',
   what_failed:'No MFA on affected accounts. DMARC not in enforcement mode. Took 30 minutes to identify all affected recipients.',
   action_items:[{id:'ai1',action:'Enable DMARC enforcement on kalro.org domain',owner:'u1',due:'2024-04-01',done:true},{id:'ai2',action:'Enable MFA for all staff accounts',owner:'u1',due:'2024-06-01',done:false}],
   participants:['u1','u2','u4'],status:'completed',
   created_at:'2024-03-06T09:00:00Z',updated_at:'2024-03-07T10:00:00Z'}
], null, 2));

console.log('\n✅  Part 1 done — all server files written.');
