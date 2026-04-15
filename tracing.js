// Must be required before anything else in server.js
'use strict';

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-proto');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-proto');
const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-proto');
const { SimpleLogRecordProcessor } = require('@opentelemetry/sdk-logs');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { Resource } = require('@opentelemetry/resources');
const { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_DEPLOYMENT_ENVIRONMENT } = require('@opentelemetry/semantic-conventions');

const DD_API_KEY = process.env.DD_API_KEY;
const DD_SITE = process.env.DD_SITE || 'datadoghq.com';
const DD_SERVICE = process.env.DD_SERVICE || 'flex-node-service-otel';
const DD_ENV = process.env.DD_ENV || 'dev';

const otlpHeaders = { 'dd-api-key': DD_API_KEY };

// Base endpoint — traces use the GAE-specific endpoint
const baseEndpoint = `https://api.${DD_SITE}`;
const tracesEndpoint = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ||
  'https://gae.integrations.otlp.us5.datadoghq.com/v1/traces';

const traceExporter = new OTLPTraceExporter({
  url: tracesEndpoint,
  headers: otlpHeaders
});

const metricExporter = new OTLPMetricExporter({
  url: `${baseEndpoint}/api/v2/otlp/v1/metrics`,
  headers: otlpHeaders
});

const logExporter = new OTLPLogExporter({
  url: `${baseEndpoint}/api/v2/otlp/v1/logs`,
  headers: otlpHeaders
});

const sdk = new NodeSDK({
  resource: new Resource({
    [SEMRESATTRS_SERVICE_NAME]: DD_SERVICE,
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: DD_ENV
  }),
  traceExporter,
  metricReader: new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 60000
  }),
  logRecordProcessor: new SimpleLogRecordProcessor(logExporter),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false } // too noisy
    })
  ]
});

sdk.start();
console.log('OpenTelemetry SDK started');

// Graceful shutdown
process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('OpenTelemetry SDK shut down'))
    .catch(err => console.error('Error shutting down OTel SDK', err))
    .finally(() => process.exit(0));
});

module.exports = sdk;