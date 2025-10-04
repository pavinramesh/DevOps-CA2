// backend/index.js
// CommonJS version with Prometheus metrics & health endpoints

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
// Default Node process/runtime metrics (CPU, memory, event loop, etc.)
client.collectDefaultMetrics({ register });

// Count every HTTP request by route/method/status
const httpReqCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['route', 'method', 'status']
});
register.registerMetric(httpReqCounter);

// Use res "finish" event to reliably observe response status
app.use((req, res, next) => {
  res.on('finish', () => {
    httpReqCounter.inc({
      route: req.route?.path || req.path || 'unknown',
      method: req.method,
      status: res.statusCode
    });
  });
  next();
});

// Metrics endpoint for Prometheus
app.get('/metrics', async (_req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).send('Metrics collection error');
  }
});
// ----------------------------------------------------

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Define routes
app.use('/api/contracts', contractRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/ai', aiRoutes);

// Health endpoints (useful for Kubernetes probes)
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

// MongoDB Connection
const connectDB = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      console.warn('MONGODB_URI not set. API will run, but DB features may fail.');
      return;
    }
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    // Do NOT exit; allow app to start for health/metrics & retry later if you add that
  }
};

// Start server
// Use 8080 to align with Docker/K8s manifests
const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';

const server = app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
  console.log(`Metrics at http://localhost:${PORT}/metrics`);
  connectDB();
});

// Graceful shutdown (useful in containers)
const shutdown = async (signal) => {
  try {
    console.log(`${signal} received. Closing server...`);
    server.close(() => console.log('HTTP server closed.'));
    await mongoose.connection.close().catch(() => {});
  } finally {
    process.exit(0);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
