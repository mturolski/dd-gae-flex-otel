// tracing.js MUST be the first require
require('./tracing');

const express = require('express');
const bunyan = require('bunyan');
const { trace, context, SpanStatusCode } = require('@opentelemetry/api');
const { logs, SeverityNumber } = require('@opentelemetry/api-logs');

const app = express();
const PORT = process.env.PORT || 8080;
const DD_SERVICE = process.env.DD_SERVICE || 'flex-node-service-otel';
const DD_ENV = process.env.DD_ENV || 'dev';

// Bunyan logger — writes to stdout and file
const logger = bunyan.createLogger({
  name: DD_SERVICE,
  streams: [
    { stream: process.stdout, level: 'info' },
    { path: '/var/log/app/app.log', level: 'info' }
  ]
});

// Helper to get current trace/span IDs for log correlation
function getTraceContext() {
  const span = trace.getActiveSpan();
  if (!span) return {};
  const ctx = span.spanContext();
  return {
    dd: {
      trace_id: ctx.traceId,
      span_id: ctx.spanId,
      service: DD_SERVICE,
      env: DD_ENV
    }
  };
}

// Serve static files
app.use('/static', express.static('static'));

app.get('/', (req, res) => {
  const tracer = trace.getTracer(DD_SERVICE);

  tracer.startActiveSpan('root.request', span => {
    try {
      logger.info({ ...getTraceContext(), page: 'home' }, 'Root endpoint hit');

      const dummyTimes = [
        new Date('2018-01-01T10:00:00'),
        new Date('2018-01-02T10:30:00'),
        new Date('2018-01-03T11:00:00')
      ];

      logger.info({ ...getTraceContext(), times_count: dummyTimes.length }, 'Rendering response');

      span.setStatus({ code: SpanStatusCode.OK });
      res.json({
        message: 'Hello from GAE Flex Node.js with OpenTelemetry + Datadog!',
        times: dummyTimes
      });
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      span.recordException(err);
      logger.error({ ...getTraceContext(), err }, 'Error handling request');
      res.status(500).json({ error: 'Internal server error' });
    } finally {
      span.end();
    }
  });
});

// Diagnostic endpoints
app.get('/dd-status', (req, res) => {
  const { execSync } = require('child_process');
  let output = '';
  const commands = {
    'PROCESSES': 'ps aux',
    'ENV (DD vars)': 'env | grep DD_'
  };
  for (const [label, cmd] of Object.entries(commands)) {
    try {
      output += `${label}:\n${execSync(cmd).toString()}\n\n`;
    } catch (e) {
      output += `${label}: ERROR - ${e.message}\n\n`;
    }
  }
  res.send(`<pre>${output}</pre>`);
});

app.get('/dd-trace-check', (req, res) => {
  const span = trace.getActiveSpan();
  const ctx = span ? span.spanContext() : null;
  res.json({
    traceId: ctx ? ctx.traceId : 'no active span',
    spanId: ctx ? ctx.spanId : 'no active span',
    service: DD_SERVICE,
    env: DD_ENV
  });
});

app.listen(PORT, () => {
  logger.info({ port: PORT }, `Server started on port ${PORT}`);
});