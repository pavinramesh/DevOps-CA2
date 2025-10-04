const express = require('express');
const prom = require('prom-client');

const app = express();
const register = new prom.Registry();
prom.collectDefaultMetrics({ register });

const httpReqCounter = new prom.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['route', 'method', 'status'],
});
register.registerMetric(httpReqCounter);

app.get('/', (req, res) => {
  res.send('Contract_Gen backend: OK');
});

app.use((req, res, next) => {
  const end = res.end;
  res.end = function (...args) {
    httpReqCounter.inc({ route: req.path, method: req.method, status: res.statusCode });
    end.apply(this, args);
  };
  next();
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`Server on :${port}`));
