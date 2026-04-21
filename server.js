'use strict';

// tracing.js MUST be the first require
require('./tracing');

const express = require('express');
const bunyan = require('bunyan');
const { trace, SpanStatusCode } = require('@opentelemetry/api');
const { logs, SeverityNumber } = require('@opentelemetry/api-logs');

const app = express();
const PORT = process.env.PORT || 8080;
const DD_SERVICE = process.env.DD_SERVICE || 'flex-node-service-otel';
const DD_ENV = process.env.DD_ENV || 'dev';

const otelLogger = logs.getLogger(DD_SERVICE);

// Custom Bunyan stream that forwards to OTel
class OTelStream {
  write(rec) {
    const span = trace.getActiveSpan();
    const ctx = span ? span.spanContext() : null;

    const severityMap = {
      10: SeverityNumber.TRACE,
      20: SeverityNumber.DEBUG,
      30: SeverityNumber.INFO,
      40: SeverityNumber.WARN,
      50: SeverityNumber.ERROR,
      60: SeverityNumber.FATAL
    };

    // Strip bunyan internal fields from attributes
    const { level, msg, time, v, pid, hostname, name, ...rest } = rec;

    otelLogger.emit({
      severityNumber: severityMap[level] || SeverityNumber.INFO,
      severityText: bunyan.nameFromLevel[level].toUpperCase(),
      body: msg,
      attributes: {
        ...rest,
        'dd.trace_id': ctx ? ctx.traceId : '',
        'dd.span_id': ctx ? ctx.spanId : '',
        'dd.service': DD_SERVICE,
        'dd.env': DD_ENV,
        'ddsource': 'nodejs',
        'ddtags': `env:${DD_ENV},service:${DD_SERVICE},source:nodejs`
      }
    });
  }
}

// Bunyan logger with stdout and OTel streams
const logger = bunyan.createLogger({
  name: DD_SERVICE,
  streams: [
    { stream: process.stdout, level: 'info' },
    { stream: new OTelStream(), type: 'raw', level: 'info' }
  ]
});

app.use('/static', express.static('static'));

app.get('/', (req, res) => {
  const tracer = trace.getTracer(DD_SERVICE);

  tracer.startActiveSpan('root.request', span => {
    try {
      logger.info({ page: 'home', method: req.method }, 'Root endpoint hit');

      const dummyTimes = [
        new Date('2018-01-01T10:00:00'),
        new Date('2018-01-02T10:30:00'),
        new Date('2018-01-03T11:00:00')
      ];

      logger.info({ times_count: dummyTimes.length }, 'Rendering response');

      span.setStatus({ code: SpanStatusCode.OK });
      res.json({
        message: 'Hello from GAE Flex Node.js with OpenTelemetry + Datadog!',
        times: dummyTimes
      });
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      span.recordException(err);
      logger.error({ err: err.message }, 'Error handling request');
      res.status(500).json({ error: 'Internal server error' });
    } finally {
      span.end();
    }
  });
});

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

const net = require('net');

function startServer(port, retries = 5) {
  const tester = net.createServer();
  tester.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && retries > 0) {
      console.log(`Port ${port} in use, retrying in 3s... (${retries} retries left)`);
      setTimeout(() => startServer(port, retries - 1), 3000);
    } else {
      console.error('Could not start server:', err.message);
      process.exit(1);
    }
  });
  tester.once('listening', () => {
    tester.close(() => {
      app.listen(port, () => {
        logger.info({ port }, `Server started on port ${port}`);
      });
    });
  });
  tester.listen(port);
}

startServer(PORT);