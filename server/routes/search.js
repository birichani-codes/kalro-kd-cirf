const express = require('express');
const { read } = require('../store');
const { authenticate } = require('../middleware/auth');
const { logAction } = require('./audit');
const router = express.Router();

const score = (text, q) => {
  if (!text||!q) return 0;
  const c = text.toLowerCase();
  return q.toLowerCase().split(/\s+/).reduce((s,t)=>s+(c.match(new RegExp(t,'g'))||[]).length,0);
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
