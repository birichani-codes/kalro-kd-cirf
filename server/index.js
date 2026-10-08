require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);

// ======================================================
// 1. DEPLOYMENT CONFIGURATION
// ======================================================

const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';

// Frontend origins allowed to communicate with this API.
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://kalro-kd.vercel.app'
];

// ======================================================
// 2. SOCKET.IO CONFIGURATION
// ======================================================

const io = socketIo(server, {
  cors: {
    origin: (origin, callback) => {
      // Allow requests without an Origin header
      // such as some server-to-server requests.
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.warn(`[Socket.IO CORS] Blocked origin: ${origin}`);
      return callback(new Error('Not allowed by Socket.IO CORS'));
    },

    methods: [
      'GET',
      'POST'
    ],

    credentials: true
  },

  // Allow both WebSocket and long-polling fallback.
  transports: [
    'websocket',
    'polling'
  ],

  allowEIO3: true
});

// Make Socket.IO available inside Express routes.
app.set('io', io);

// ======================================================
// 3. EXPRESS CORS CONFIGURATION
// ======================================================

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no Origin header
    // such as curl, Postman, Render health checks, etc.
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.warn(`[Express CORS] Blocked origin: ${origin}`);

    return callback(
      new Error(`Origin ${origin} is not allowed by CORS`)
    );
  },

  credentials: true,

  methods: [
    'GET',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'OPTIONS'
  ],

  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Accept',
    'Origin',
    'X-Requested-With'
  ]
};

app.use(cors(corsOptions));

// Handle CORS preflight requests.
app.options('*', cors(corsOptions));

// ======================================================
// 4. EXPRESS MIDDLEWARE
// ======================================================

app.use(express.json({
  limit: '10mb'
}));

app.use(express.urlencoded({
  extended: true,
  limit: '10mb'
}));

// ======================================================
// 5. INITIAL DATA / OPERATIONAL TESTING SEEDS
// ======================================================

// Keep the guided operational-testing scenarios
// and phishing response knowledge current.
try {
  require('./services/update7Seed').ensureUpdate7Data();
  console.log('[Seed] Update 7 operational data verified');
} catch (error) {
  console.error('[Seed] Update 7 initialization failed:', error);
}

try {
  require('./services/update9Seed').ensureUpdate9Data();
  console.log('[Seed] Update 9 operational data verified');
} catch (error) {
  console.error('[Seed] Update 9 initialization failed:', error);
}

// ======================================================
// 6. CORE FRAMEWORK ROUTES
// ======================================================

app.use(
  '/api/auth',
  require('./routes/auth')
);

app.use(
  '/api/incidents',
  require('./routes/incidents')
);

app.use(
  '/api/knowledge',
  require('./routes/knowledge')
);

app.use(
  '/api/search',
  require('./routes/search')
);

app.use(
  '/api/reports',
  require('./routes/reports')
);

app.use(
  '/api/pir',
  require('./routes/pir')
);

app.use(
  '/api/game-theory',
  require('./routes/game-theory')
);

app.use(
  '/api/alerts',
  require('./routes/alerts')
);

app.use(
  '/api/sync',
  require('./routes/sync')
);

app.use(
  '/api/notifications',
  require('./routes/notifications')
);

app.use(
  '/api/sde',
  require('./routes/sde')
);

app.use(
  '/api/log-collection',
  require('./routes/log-collection')
);

app.use(
  '/api/emii',
  require('./routes/emii')
);

app.use(
  '/api/training',
  require('./routes/training')
);

app.use(
  '/api/external-reporting',
  require('./routes/external-reporting')
);

app.use(
  '/api/operational-tests',
  require('./routes/operational-tests')
);

app.use(
  '/api/stations',
  require('./routes/stations')
);

// ======================================================
// 7. AUDIT & GOVERNANCE
// ======================================================

const {
  router: auditRouter
} = require('./routes/audit');

app.use(
  '/api/audit',
  auditRouter
);

// ======================================================
// 8. HEALTH CHECK
// ======================================================

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    engine: 'KALRO IKF Strategic Engine',
    decentralized: true,
    environment: process.env.NODE_ENV || 'development',
    time: new Date().toISOString()
  });
});

// Optional root endpoint.
// Useful when opening the Render URL directly.
app.get('/', (req, res) => {
  res.status(200).json({
    service: 'KALRO KD-CIRF API',
    status: 'running',
    health: '/api/health'
  });
});

// ======================================================
// 9. AUTOMATED SIEM PROCESSING
// ======================================================

const SIEM_INTERVAL_MS = 5 * 60 * 1000;

setInterval(async () => {
  try {
    const siemEngine = require('./services/siemEngine');
    const alertEnrichment = require('./services/alertEnrichment');

    // Step 1: Analyze logs using SIEM.
    const siemResults = await Promise.resolve(
      siemEngine.processSiemQueue()
    );

    if (
      siemResults &&
      siemResults.status === 'success'
    ) {
      console.log(
        `[SIEM] Processed ${siemResults.processed || 0} logs, ` +
        `generated ${siemResults.alerts_generated || 0} alerts`
      );
    }

    // Step 2: Enrich generated alerts and create incidents.
    const enrichResults = await Promise.resolve(
      alertEnrichment.processPendingAlerts()
    );

    if (
      enrichResults &&
      enrichResults.incidents_created > 0
    ) {
      console.log(
        `[Enrichment] Created ${enrichResults.incidents_created} ` +
        `incidents from ${enrichResults.total_alerts || 0} alerts`
      );
    }

  } catch (error) {
    console.error(
      '[SIEM Processing] Error:',
      error
    );
  }
}, SIEM_INTERVAL_MS);

console.log(
  '[SIEM] Automated processing started (every 5 minutes)'
);

// ======================================================
// 10. EXTERNAL MEDIA INCIDENT INTEGRATION (EMII)
// ======================================================

try {
  const emii = require('./services/emii');

  emii.initializeUSBMonitoring(io);

  console.log(
    '[EMII] External Media Incident Integration initialized'
  );
} catch (error) {
  console.warn(
    '[EMII] USB monitoring could not be initialized:',
    error.message || error
  );
}

// ======================================================
// 11. SOCKET.IO CONNECTION HANDLING
// ======================================================

io.on('connection', (socket) => {
  console.log(
    '[Socket.IO] Client connected:',
    socket.id
  );

  console.log(
    '[Socket.IO] Transport:',
    socket.conn.transport.name
  );

  socket.emit('emii_status', {
    status: 'active',
    monitoring: true,
    timestamp: new Date().toISOString()
  });

  socket.on('disconnect', (reason) => {
    console.log(
      '[Socket.IO] Client disconnected:',
      socket.id,
      'Reason:',
      reason
    );
  });

  socket.on('error', (error) => {
    console.error(
      '[Socket.IO] Client error:',
      socket.id,
      error
    );
  });
});

// ======================================================
// 12. REPORT SCHEDULER
// ======================================================

try {
  const reportScheduler = require(
    './services/reportScheduler'
  );

  reportScheduler.initializeReportScheduler();

  console.log(
    '[ReportScheduler] Initialized'
  );
} catch (error) {
  console.warn(
    '[ReportScheduler] Failed to initialize scheduler:',
    error.message || error
  );
}

// ======================================================
// 13. 404 API HANDLER
// ======================================================

// Keep this AFTER all API routes.
app.use('/api', (req, res) => {
  res.status(404).json({
    error: 'API route not found',
    method: req.method,
    path: req.originalUrl
  });
});

// ======================================================
// 14. GLOBAL ERROR HANDLER
// ======================================================

app.use((err, req, res, next) => {
  console.error(
    '[System Error]',
    err.stack || err
  );

  // Handle CORS rejection cleanly.
  if (
    err.message &&
    (
      err.message.includes('not allowed by CORS') ||
      err.message.includes('Not allowed by Socket.IO CORS')
    )
  ) {
    return res.status(403).json({
      error: 'CORS origin rejected',
      message: err.message
    });
  }

  return res.status(
    err.status || 500
  ).json({
    error: 'Internal Strategic Engine Error',
    message:
      process.env.NODE_ENV === 'production'
        ? 'An internal server error occurred.'
        : err.message
  });
});

// ======================================================
// 15. START SERVER
// ======================================================

server.listen(PORT, HOST, () => {
  console.log(`
================================================
KALRO IKF STRATEGIC ENGINE LOADED

Status:
Running on http://${HOST}:${PORT}

Public backend:
https://kalro-kd-cirf.onrender.com

Allowed Origins:
${allowedOrigins.join('\n')}

Mode:
Decentralized Architecture

SIEM:
Enabled (5-minute processing)

Socket.IO:
Enabled

EMII:
Initialized where supported

Environment:
${process.env.NODE_ENV || 'development'}

================================================
  `);
});