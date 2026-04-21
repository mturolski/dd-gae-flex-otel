'use strict';

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-proto');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-proto');
const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-proto');
const { BatchLogRecordProcessor } = require('@opentelemetry/sdk-logs');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { Resource } = require('@opentelemetry/resources');
const { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_DEPLOYMENT_ENVIRONMENT, SEMRESATTRS_TELEMETRY_SDK_LANGUAGE } = require('@opentelemetry/semantic-conventions');

const DD_API_KEY = process.env.DD_API_KEY;
const DD_SITE = process.env.DD_SITE || 'datadoghq.com';
const DD_SERVICE = process.env.DD_SERVICE || 'flex-node-service-otel';
const DD_ENV = process.env.DD_ENV || 'dev';

const otlpHeaders = { 'dd-api-key': DD_API_KEY };

const tracesEndpoint = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;

const logsEndpoint = process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT ||
  'https://otlp.datadoghq.com/v1/logs';

const traceExporter = new OTLPTraceExporter({
  url: tracesEndpoint,
  headers: otlpHeaders
});

const metricExporter = new OTLPMetricExporter({
  url: 'https://otlp.datadoghq.com/v1/metrics',
  headers: otlpHeaders
});

const logExporter = new OTLPLogExporter({
  url: logsEndpoint,
  headers: otlpHeaders
});

const sdk = new NodeSDK({
  resource: new Resource({
    [SEMRESATTRS_SERVICE_NAME]: DD_SERVICE,
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: DD_ENV,
    [SEMRESATTRS_TELEMETRY_SDK_LANGUAGE]: 'nodejs',
    'datadog.source': 'nodejs',
    'telemetry.sdk.language': 'nodejs'
  }),
  traceExporter,
  metricReader: new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 60000
  }),
  logRecordProcessors: [
    new BatchLogRecordProcessor(logExporter, {
      exportTimeoutMillis: 5000,
      scheduledDelayMillis: 1000
    })
  ],
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-http': {
        ignoreIncomingRequestHook: (req) => {
          return req.url === '/_ah/health' ||
                 req.url === '/liveness_check' ||
                 req.url === '/readiness_check';
        }
      }
    })
  ]
});

sdk.start();

process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('OTel SDK shut down'))
    .catch(err => console.error('Error shutting down OTel SDK', err))
    .finally(() => process.exit(0));
});

module.exports = sdk;