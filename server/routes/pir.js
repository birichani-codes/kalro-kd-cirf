const express = require('express');
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

router.post('/:id/action-item/:itemId/complete', authenticate, requireMinRole('analyst'), (req,res) => {
  const pirs = read('pirs'); const idx = pirs.findIndex(p=>p.id===req.params.id);
  if (idx===-1) return res.status(404).json({ error:'PIR not found' });
  const itemId = req.params.itemId;
  const actionItems = pirs[idx].action_items || [];
  const itemIdx = actionItems.findIndex(item => item.id === itemId);
  if (itemIdx === -1) return res.status(404).json({ error:'Action item not found' });
  actionItems[itemIdx].completed = true;
  actionItems[itemIdx].completed_at = new Date().toISOString();
  actionItems[itemIdx].completed_by = req.user.id;
  pirs[idx].updated_at = new Date().toISOString();
  write('pirs', pirs);
  logAction({ userId:req.user.id, action:'COMPLETE_PIR_ACTION_ITEM', targetType:'pir', targetId:req.params.id, metadata:{ item_id:itemId } });
  res.json(actionItems[itemIdx]);
});

module.exports = router;
