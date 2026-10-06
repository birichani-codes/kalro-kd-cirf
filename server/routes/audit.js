const express = require('express');
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
