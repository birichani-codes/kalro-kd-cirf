const express = require('express');
const { v4: uuid } = require('uuid');
const { read, write } = require('../store');
const { authenticate } = require('../middleware/auth');
const { requireMinRole } = require('../middleware/rbac');
const { logAction } = require('./audit');
const router = express.Router();

const readData = (name) => read(name) || [];
const writeData = (name, data) => write(name, data);

router.get('/modules', authenticate, (req, res) => {
  const modules = readData('training_modules');
  res.json(modules.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
});

router.post('/modules', authenticate, requireMinRole('analyst'), (req, res) => {
  const { title, description, topics, duration_hours, required_for_roles } = req.body;
  if (!title || !description) return res.status(400).json({ error: 'title and description are required' });
  const modules = readData('training_modules');
  const newModule = {
    id: 'tm' + uuid().slice(0, 8),
    title,
    description,
    topics: Array.isArray(topics) ? topics : (topics ? [topics] : []),
    duration_hours: Number(duration_hours) || 1,
    required_for_roles: Array.isArray(required_for_roles) ? required_for_roles : (required_for_roles ? [required_for_roles] : []),
    created_by: req.user.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    status: 'active'
  };
  modules.push(newModule);
  writeData('training_modules', modules);
  logAction({ userId: req.user.id, action: 'CREATE_TRAINING_MODULE', targetType: 'training_module', targetId: newModule.id });
  res.status(201).json(newModule);
});

router.put('/modules/:id', authenticate, requireMinRole('analyst'), (req, res) => {
  const modules = readData('training_modules');
  const idx = modules.findIndex(m => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Training module not found' });
  const fields = ['title', 'description', 'topics', 'duration_hours', 'required_for_roles', 'status'];
  fields.forEach(field => {
    if (req.body[field] !== undefined) {
      modules[idx][field] = Array.isArray(req.body[field]) ? req.body[field] : req.body[field];
    }
  });
  modules[idx].updated_at = new Date().toISOString();
  writeData('training_modules', modules);
  logAction({ userId: req.user.id, action: 'UPDATE_TRAINING_MODULE', targetType: 'training_module', targetId: req.params.id });
  res.json(modules[idx]);
});

router.get('/mentorships', authenticate, (req, res) => {
  const mentorships = readData('mentorships');
  res.json(mentorships.sort((a,b)=> new Date(b.created_at) - new Date(a.created_at)));
});

router.post('/mentorships', authenticate, requireMinRole('analyst'), (req, res) => {
  const { mentor_id, mentee_id, goals, start_date, end_date, status } = req.body;
  if (!mentor_id || !mentee_id) return res.status(400).json({ error: 'mentor_id and mentee_id are required' });
  const mentorships = readData('mentorships');
  const newMentorship = {
    id: 'mt' + uuid().slice(0, 8),
    mentor_id,
    mentee_id,
    goals: Array.isArray(goals) ? goals : (goals ? [goals] : []),
    start_date: start_date || new Date().toISOString(),
    end_date: end_date || null,
    status: status || 'active',
    created_by: req.user.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  mentorships.push(newMentorship);
  writeData('mentorships', mentorships);
  logAction({ userId: req.user.id, action: 'CREATE_MENTORSHIP', targetType: 'mentorship', targetId: newMentorship.id });
  res.status(201).json(newMentorship);
});

router.put('/mentorships/:id', authenticate, requireMinRole('analyst'), (req, res) => {
  const mentorships = readData('mentorships');
  const idx = mentorships.findIndex(m => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Mentorship not found' });
  const fields = ['goals', 'start_date', 'end_date', 'status'];
  fields.forEach(field => {
    if (req.body[field] !== undefined) mentorships[idx][field] = req.body[field];
  });
  mentorships[idx].updated_at = new Date().toISOString();
  writeData('mentorships', mentorships);
  logAction({ userId: req.user.id, action: 'UPDATE_MENTORSHIP', targetType: 'mentorship', targetId: req.params.id });
  res.json(mentorships[idx]);
});

router.get('/competency/:userId', authenticate, (req, res) => {
  const userId = req.params.userId;
  if (req.user.id !== userId && req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Access denied' });
  }
  const records = readData('competency_records').filter(r => r.user_id === userId);
  res.json(records);
});

router.post('/competency/:userId', authenticate, (req, res) => {
  const userId = req.params.userId;
  if (req.user.id !== userId && req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Access denied' });
  }
  const { skill, level, assessment_date, evidence } = req.body;
  if (!skill || level === undefined) return res.status(400).json({ error: 'skill and level are required' });
  const records = readData('competency_records');
  const newRecord = {
    id: 'cr' + uuid().slice(0,8),
    user_id: userId,
    skill,
    level: Number(level),
    assessment_date: assessment_date || new Date().toISOString(),
    evidence: evidence || '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  records.push(newRecord);
  writeData('competency_records', records);
  logAction({ userId: req.user.id, action: 'RECORD_COMPETENCY', targetType: 'competency_record', targetId: newRecord.id, metadata:{user_id:userId, skill, level} });
  res.status(201).json(newRecord);
});

module.exports = router;
