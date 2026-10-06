require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const app = express();
const server = http.createServer(app);

// Initialize Socket.io
const io = socketIo(server, {
  cors: {
    origin: [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://cybersecurity-incident-response-fra.vercel.app'
    ],
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Make io available to routes
app.set('io', io);

// 1. DYNAMIC PORT & HOST FOR DEPLOYMENT
const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';

// 2. CORS CONFIGURATION
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://cybersecurity-incident-response-fra.vercel.app'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      console.warn(`Blocked by CORS: ${origin}`);
      return callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

app.options('*', cors());

app.use(express.json());

// Keep the guided operational-testing scenarios and phishing response knowledge current.
require('./services/update7Seed').ensureUpdate7Data();
require('./services/update9Seed').ensureUpdate9Data();

// 3. CORE FRAMEWORK ROUTES
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/incidents',     require('./routes/incidents'));
app.use('/api/knowledge',     require('./routes/knowledge'));
app.use('/api/search',        require('./routes/search'));
app.use('/api/reports',       require('./routes/reports'));
app.use('/api/pir',           require('./routes/pir'));
app.use('/api/game-theory',   require('./routes/game-theory'));
app.use('/api/alerts',        require('./routes/alerts'));
app.use('/api/sync',          require('./routes/sync'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/sde',           require('./routes/sde'));
app.use('/api/log-collection', require('./routes/log-collection'));
app.use('/api/emii',           require('./routes/emii'));
app.use('/api/training',       require('./routes/training'));
app.use('/api/external-reporting', require('./routes/external-reporting'));
app.use('/api/operational-tests', require('./routes/operational-tests'));
app.use('/api/stations', require('./routes/stations'));

// 4. AUDIT & GOVERNANCE
const { router: auditRouter } = require('./routes/audit');
app.use('/api/audit', auditRouter);

// 5. HEALTH CHECK
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    engine: 'KALRO IKF Strategic Engine',
    decentralized: true,
    time: new Date().toISOString()
  });
});

// ========================================
// 6. AUTOMATED SIEM PROCESSING
// ========================================
// Process SIEM queue every 5 minutes
setInterval(async () => {
  try {
    const siemEngine = require('./services/siemEngine');
    const alertEnrichment = require('./services/alertEnrichment');

    // Step 1: Analyze logs with SIEM
    const siemResults = siemEngine.processSiemQueue();

    if (siemResults.status === 'success') {
      console.log(`[SIEM] Processed ${siemResults.processed} logs, generated ${siemResults.alerts_generated} alerts`);
    }

    // Step 2: Enrich alerts and create incidents
    const enrichResults = alertEnrichment.processPendingAlerts();

    if (enrichResults.incidents_created > 0) {
      console.log(`[Enrichment] Created ${enrichResults.incidents_created} incidents from ${enrichResults.total_alerts} alerts`);
    }

  } catch (error) {
    console.error('[SIEM Processing] Error:', error);
  }
}, 5 * 60 * 1000); // Run every 5 minutes

console.log('[SIEM] Automated processing started (every 5 minutes)');

// ========================================
// 7. EXTERNAL MEDIA INCIDENT INTEGRATION (EMII)
// ========================================
// Initialize USB detection and monitoring
const emii = require('./services/emii');
emii.initializeUSBMonitoring(io);

// Socket.io connection handling for real-time EMII alerts
io.on('connection', (socket) => {
  console.log('[EMII] Client connected for real-time alerts:', socket.id);

  socket.on('disconnect', () => {
    console.log('[EMII] Client disconnected:', socket.id);
  });

  // Send initial EMII status
  socket.emit('emii_status', {
    status: 'active',
    monitoring: true,
    timestamp: new Date().toISOString()
  });
});

console.log('[EMII] External Media Incident Integration initialized');

// Initialize scheduled report sender (daily/cron)
try {
  const reportScheduler = require('./services/reportScheduler');
  reportScheduler.initializeReportScheduler();
  console.log('[ReportScheduler] Initialized');
} catch (err) {
  console.warn('[ReportScheduler] Failed to initialize scheduler:', err.message || err);
}

// 8. GLOBAL ERROR HANDLING
app.use((err, req, res, next) => {
  console.error('System Error:', err.stack);
  res.status(500).json({
    error: 'Internal Strategic Engine Error',
    message: err.message
  });
});

// 9. START SERVER
server.listen(PORT, HOST, () => {
  console.log(`
  ================================================
  KALRO IKF STRATEGIC ENGINE LOADED
  Status: Running on http://${HOST}:${PORT}
  Allowed Origins: ${allowedOrigins.join(', ')}
  Mode:   Decentralized Architecture
  SIEM:   Enabled (5-minute processing)
  EMII:   Enabled (Real-time USB monitoring)
  ================================================
  `);
});