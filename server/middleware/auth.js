const jwt = require('jsonwebtoken');
const { read } = require('../store');
const JWT_SECRET = process.env.JWT_SECRET || 'kalro-ikf-secret-2024';
const authenticate = (req, res, next) => {
  let token = null;
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) {
    token = h.split(' ')[1];
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) return res.status(401).json({ error:'No token provided' });
  try {
    const d = jwt.verify(token, JWT_SECRET);
    const user = read('users').find(u => u.id === d.id);
    if (!user) return res.status(401).json({ error:'User not found' });
    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      station_id: user.station_id || user.stationId || null
    };
    next();
  } catch(e) { res.status(401).json({ error:'Invalid or expired token' }); }
};
module.exports = { authenticate, authenticateToken: authenticate, JWT_SECRET };
