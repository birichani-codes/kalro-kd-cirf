const express = require('express');
const { read } = require('../store');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

router.get('/', authenticate, (req,res) => {
  const stations = read('stations').filter(s => s.active !== false);
  res.json(stations);
});

router.get('/:id', authenticate, (req,res) => {
  const value = String(req.params.id || '').toLowerCase();
  const station = read('stations').find(s => String(s.id).toLowerCase() === value || String(s.name).toLowerCase() === value || String(s.code).toLowerCase() === value);
  if (!station) return res.status(404).json({ error:'Station not found' });
  res.json(station);
});

module.exports = router;
