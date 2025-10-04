// backend/index.js
// Express API with Prometheus metrics & Kubernetes-ready health checks

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const client = require('prom-client');

// Import routes
const contractRoutes = require('./routes/contracts');
const templateRoutes = require('./routes/templates');
const aiRoutes = require('./routes/ai');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

// ---------------- Prometheus metrics ----------------
const register = new client.Registry();

// Collect Node.js runtime & process metrics
client.collectDefaultMetrics({ register });

// Counter for HTTP requests
const httpReqCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['route', 'method', 'status']
});
register.registerMetric(httpReqCounter);

// Histogram for HTTP request durations
const httpReqDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['route', 'method', 'status'],
  buckets: [0.05, 0.1, 0.2, 0.5, 1, 2, 5] // 50ms → 5s
});
register.registerMetric(httpReqDuration);

// Middleware to track requests
app.use((req, res, next) => {
  const end = httpReqDuration.startTimer({
    route: req.path,
    method: req.method
  });

  res.on('finish', () => {
    httpReqCounter.inc({
      route: req.path,
      method: req.method,
      status: res.statusCode
    });
    end({ status: res.statusCode });
  });

  next();
});

// Metrics endpoint for Prometheus
app.get('/metrics', async (_req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    console.error('Metrics error:', err.message);
    res.status(500).send('Metrics collection error');
  }
});
// ----------------------------------------------------

// ---------------- Middleware ----------------
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------------- Routes ----------------
app.use('/api/contracts', contractRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/ai', aiRoutes);

// Root & health endpoints
app.get('/', (_req, res) => {
  res.json({ message: 'Welcome to AI Legal Drafts API', ok: true });
});

app.get('/healthz', (_req, res) => {
  res.status(200).json({ ok: true, service: 'api' });
});

app.get('/readyz', (_req, res) => {
  const mongoReady = mongoose.connection?.readyState === 1; // 1 = connected
  const status = mongoReady ? 200 : 503;
  res.status(status).json({ ok: mongoReady, mongoConnected: mongoReady });
});

// ---------------- MongoDB ----------------
const connectDB = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      console.warn('⚠️ MONGODB_URI not set. API will run without DB.');
      return;
    }
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    // Do not exit — app can still serve metrics/health
  }
};

// ---------------- Start Server ----------------
const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';

const server = app.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on http://${HOST}:${PORT}`);
  console.log(`📊 Metrics available at http://localhost:${PORT}/metrics`);
  connectDB();
});

// Graceful shutdown (important for containers)
const shutdown = async (signal) => {
  try {
    console.log(`\n${signal} received. Closing server...`);
    server.close(() => console.log('✅ HTTP server closed.'));
    await mongoose.connection.close().catch(() => {});
  } finally {
    process.exit(0);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
