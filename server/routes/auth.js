const express = require('express');
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
  const token = jwt.sign({ id:user.id, email:user.email, role:user.role, station_id:user.station_id }, JWT_SECRET, { expiresIn:'8h' });
  logAction({ userId:user.id, action:'LOGIN', metadata:{ email } });
  res.json({ token, user:{ id:user.id, name:user.name, email:user.email, role:user.role, department:user.department, station_id:user.station_id || '' } });
});

router.get('/me', authenticate, (req,res) => {
  const user = read('users').find(u => u.id===req.user.id);
  if (!user) return res.status(404).json({ error:'Not found' });
  const { password, ...safe } = user; res.json(safe);
});

router.get('/users', authenticate, requireRole('super_admin', 'analyst'), (req,res) => {
  res.json(read('users').map(({ password, ...u }) => u));
});

router.post('/users', authenticate, requireRole('super_admin'), async (req,res) => {
  const { name, email, password, role, department, station_id } = req.body;
  if (!name||!email||!password||!role) return res.status(400).json({ error:'name, email, password, role required' });
  const stations = read('stations').filter(s=>s.active!==false).map(s=>s.name);
  if (station_id && !stations.includes(station_id)) return res.status(400).json({ error:'Select a valid KALRO station' });
  const users = read('users');
  if (users.find(u => u.email===email)) return res.status(409).json({ error:'Email already exists' });
  const newUser = { id:'u'+uuid().slice(0,8), name, email, password:await bcrypt.hash(password,10), role, department:department||'', station_id:station_id||'', created_at:new Date().toISOString() };
  users.push(newUser); write('users', users);
  logAction({ userId:req.user.id, action:'CREATE_USER', targetType:'user', targetId:newUser.id, metadata:{ name, role, station_id:newUser.station_id } });
  const { password:_, ...safe } = newUser; res.status(201).json(safe);
});

router.put('/users/:id', authenticate, requireRole('super_admin'), async (req,res) => {
  const users = read('users'); const idx = users.findIndex(u => u.id===req.params.id);
  if (idx===-1) return res.status(404).json({ error:'Not found' });
  const { name, role, department, station_id } = req.body;
  if (station_id!==undefined && station_id!=='' && !read('stations').filter(s=>s.active!==false).map(s=>s.name).includes(station_id)) return res.status(400).json({ error:'Select a valid KALRO station' });
  if (name) users[idx].name=name;
  if (role) users[idx].role=role;
  if (department!==undefined) users[idx].department=department;
  if (station_id!==undefined) users[idx].station_id=station_id;
  write('users', users); logAction({ userId:req.user.id, action:'UPDATE_USER', targetType:'user', targetId:req.params.id, metadata:{ station_id:users[idx].station_id } });
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
