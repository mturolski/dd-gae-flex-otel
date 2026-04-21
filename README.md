# Datadog on Google App Engine Flexible - Node.js (OpenTelemetry)

A sample Express app demonstrating how to instrument a Node.js application on Google App Engine Flexible environment using OpenTelemetry, with APM tracing, log collection via Bunyan, trace-log correlation, and metrics sent directly to Datadog — no Datadog Agent required.

## Features

- ✅ APM tracing via OpenTelemetry SDK
- ✅ Log collection with Bunyan + trace-log correlation
- ✅ Custom metrics via OpenTelemetry SDK
- ✅ Infrastructure metrics via GCP integration
- ✅ Officially supported — no Datadog Agent required
- ✅ No Dataflow, no Pub/Sub, no GCP log forwarding

## Prerequisites

- [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) installed and authenticated
- A [Datadog account](https://www.datadoghq.com/) with an API key
- A GCP project with App Engine enabled
- [GCP integration configured in Datadog](https://docs.datadoghq.com/integrations/google_cloud_platform/) for infrastructure metrics
- Access to Datadog's GAE OTel endpoint (currently in preview)

## Project Structure

```
.
├── app.yaml              # GAE Flex configuration
├── Dockerfile            # Custom runtime container definition
├── entrypoint.sh         # Container startup script
├── package.json          # Node.js dependencies
├── tracing.js            # OpenTelemetry SDK initialization
├── server.js             # Express application
└── static/               # Static files
```

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/mturolski/dd-gae-flex-otel.git
cd dd-gae-flex-otel
```

### 2. Set your Datadog API key

In `app.yaml`, replace the placeholder with your Datadog API key:

```yaml
env_variables:
  DD_API_KEY: "your_api_key_here"
```

> ⚠️ Do not commit your API key to source control. Consider using [GCP Secret Manager](https://cloud.google.com/secret-manager) for production.

### 3. Deploy to App Engine

```bash
gcloud app deploy
```

### 4. Verify the deployment

```bash
gcloud app browse -s flex-node-service-otel
```

## How It Works

### Architecture

```
Node.js app (Express + Bunyan)
       │
       ├── Traces ──► OTel OTLP Proto Exporter ──► https://<YOUR ENDPOINT HERE>.datadoghq.com/v1/traces
       ├── Logs ───► OTel OTLP Proto Exporter ──► https://otlp.datadoghq.com/v1/logs

GCP Integration ──────────────────────────────────► Datadog (infrastructure metrics)
```

### tracing.js

Initializes the OpenTelemetry Node SDK before the app starts with three exporters:

- **Traces** — sent to Datadog's GAE-specific OTel endpoint via HTTP/protobuf
- **Logs** — sent to Datadog's standard OTel logs intake via HTTP/protobuf
- **Metrics** — sent to Datadog's standard OTel metrics intake via HTTP/protobuf, exported every 60 seconds

Auto-instrumentation via `@opentelemetry/auto-instrumentations-node` automatically traces HTTP requests, Express routes, and other supported libraries with no additional code.

> **Note:** `tracing.js` must be the **first `require`** in `server.js` to ensure instrumentation is set up before any other modules load.

### server.js

Uses Bunyan for structured logging with a custom `OTelStream` class that forwards every log record to the OTel logs exporter. This means:

- Bunyan's API is unchanged — `logger.info()`, `logger.error()` etc. work as normal
- Logs go to **stdout** (GCP Cloud Logging) and **Datadog** simultaneously
- Every log entry automatically includes `dd.trace_id` and `dd.span_id` for trace-log correlation

### Logging architecture

```
logger.info(...)
       │
       ├── stdout stream ──► GCP Cloud Logging
       └── OTelStream ─────► OTel SDK ──► Datadog Logs
```

### Dockerfile

Simple Node.js base image with no Datadog Agent — just the app and its dependencies.

## What You'll See in Datadog

| Feature | Where to look | Source |
|---|---|---|
| APM traces | APM → Traces, filter by `service:flex-node-service-otel` | OTel |
| Logs | Logs, filter by `service:flex-node-service-otel` | OTel |
| Trace-log correlation | Click a trace → Logs tab | OTel |
| Infrastructure (CPU, memory) | Infrastructure → Host Map | GCP integration |
| GAE metrics (requests, latency) | Dashboards → GAE | GCP integration |

## Observability Without Infrastructure View

When using direct OTel ingestion (no Datadog Agent), your service will **not** appear in the Datadog Infrastructure Host List. This is expected behaviour — the infrastructure view requires the Agent or host metadata sent via the Datadog Exporter.

However, you still get comprehensive observability through:

### APM Service Page
Go to **APM → Services → flex-node-service-otel**. This gives you:
- Request throughput, latency percentiles (p50, p75, p95, p99), and error rate
- Endpoint-level breakdown showing performance per route
- Deployment tracking across versions
- Flame graphs and trace waterfall views for individual requests

### Log Management
Go to **Logs** and filter by `service:flex-node-service-otel`. You get:
- All structured log entries with full attribute context
- Trace-log correlation — click any log entry to jump to the correlated trace, or click a trace to see its logs
- Log patterns and anomaly detection

### Metrics Explorer
Go to **Metrics → Explorer** and search for metrics prefixed with your service name. Custom metrics emitted via the OTel SDK appear here and can be used to build dashboards and monitors.

### Dashboards
You can build a complete service dashboard combining:
- OTel APM metrics (`trace.*` namespace)
- OTel custom metrics
- GCP integration metrics (`gcp.appengine.*`) for infrastructure-level data like instance count, memory, and CPU — these flow via the GCP integration regardless of the Agent

### Monitors and Alerts
All of the above data sources can be used for monitors. For example:
- Alert on p99 latency exceeding a threshold (APM metric)
- Alert on error rate spike (APM metric)
- Alert on log pattern matching an error keyword (Log monitor)

### What You Won't See
- **Infrastructure Host List** — requires Agent or host metadata
- **Live Process monitoring** — requires Agent
- **Network Performance Monitoring** — requires Agent
- **AppSec / IAST** — requires Agent with ddtrace

For a purely observability-focused setup (traces, logs, metrics), the OTel approach covers everything you need without the operational overhead of managing the Agent.



## OTel Endpoint Requirements

```
OTEL_EXPORTER_OTLP_TRACES_PROTOCOL=http/protobuf
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=<Contact Support for this endpoint>

OTEL_EXPORTER_OTLP_LOGS_PROTOCOL=http/protobuf
OTEL_EXPORTER_OTLP_LOGS_ENDPOINT=https://otlp.datadoghq.com/v1/logs
```

Authentication is handled via the `dd-api-key` header, set dynamically from `DD_API_KEY` in `tracing.js`.

> **Note:** The GAE-specific traces endpoint is currently in preview. The logs and metrics endpoints (`otlp.datadoghq.com`) are generally available.

## Known Limitations

- The GAE OTel traces endpoint is currently in **preview**
- The log `source` tag defaults to `otlp_log_ingestion` — this can be overridden with a Datadog Log Pipeline remapper under **Logs → Pipelines**
- The GAE-managed OpenTelemetry collector sidecar cannot be reconfigured to forward to Datadog — it is managed entirely by Google
- Infrastructure Host List is not populated without the Datadog Agent

## Comparison vs Agent-based Approach

| | Agent-based (app engine example) | OTel-based (this example) |
|---|---|---|
| APM | ✅ | ✅ |
| Logs | ✅ | ✅ |
| Trace-log correlation | ✅ | ✅ |
| Infrastructure metrics | ✅ | ✅ (via GCP integration) |
| Infrastructure Host List | ✅ | ❌ |
| AppSec / IAST | ✅ | ❌ |
| SBOM / SCA | ✅ | ❌ |
| Runtime security | ✅ | ❌ |
| Officially supported | ❌ | ✅ |
| Memory overhead | ~200MB | ~50MB |
| Dockerfile complexity | High | Low |
| Operational fragility | High | Low |