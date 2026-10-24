require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');
const rateLimit = require('express-rate-limit');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:8080,http://localhost:8811,http://localhost:3000,http://localhost:5500')
  .split(',').map(s => s.trim());

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-PHS-Role','X-Request-ID'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

// Disable ETag so browser never gets 304 on /api routes.
app.disable('etag');
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 500,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api', limiter);

app.use((req, _res, next) => {
  req.requestId = req.headers['x-request-id'] || require('uuid').v4();
  next();
});

// Health check (includes Mautic/RudderStack/CDP status)
const catalogRouter = require('./routes/catalog');
app.use('/health', require('./routes/health'));
app.get('/ping', (_req, res) => res.json({ status: 'ok' }));

// ── CDP Webhook receiver (from RudderStack) ───────────────────
// Must NOT be behind rate limiter — RS calls this for every event
app.use('/api/webhook', require('./routes/webhook'));

// ── API Routes ────────────────────────────────────────────────
// v2 routes use CDP Profile Store; v1 mock-first routes kept as fallback
app.use('/api/customers',    require('./routes/customers-v2'));
app.use('/api/catalog',      catalogRouter);
app.use('/api/audiences',    require('./routes/audiences-v2'));
app.use('/api/events',       require('./routes/events'));
app.use('/api/sources',      require('./routes/sources'));
app.use('/api/destinations', require('./routes/destinations'));
app.use('/api/campaigns',    require('./routes/campaigns'));
app.use('/api/journeys',     require('./routes/journeys'));
app.use('/api/data-quality', require('./routes/dataQuality'));
app.use('/api/consent',      require('./routes/consent'));
app.use('/api/directory',    require('./routes/directory'));
app.use('/api/connections',     require('./routes/connections'));
app.use('/api/transformations', require('./routes/transformations'));

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use(require('./middleware/errorHandler'));

app.listen(PORT, () => {
  console.log(`\n🚀 PHS CDP BFF running on http://localhost:${PORT}`);
  console.log(`   Mode: ${process.env.USE_MOCK === 'true' ? '🧪 MOCK' : '🔌 LIVE (CDP Postgres + Mautic + RudderStack)'}`);
  if (process.env.USE_MOCK !== 'true') {
    console.log(`   CDP DB: ${process.env.CDP_DB_HOST}:${process.env.CDP_DB_PORT}/${process.env.CDP_DB_NAME}`);
    console.log(`   Mautic: ${process.env.MAUTIC_BASE_URL}`);
    console.log(`   RudderStack: ${process.env.RUDDERSTACK_DATA_PLANE_URL || 'not configured'}`);
    console.log(`   Webhook: http://localhost:${PORT}/api/webhook/rudderstack`);
  }
  console.log(`   Health: http://localhost:${PORT}/health\n`);
});

module.exports = app;
