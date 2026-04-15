# Datadog on Google App Engine Flexible - Node.js (OpenTelemetry)

A sample Express app demonstrating how to instrument a Node.js application on Google App Engine Flexible environment using OpenTelemetry, with APM tracing, log collection via Bunyan, and trace-log correlation sent directly to Datadog.

## Features

- ✅ APM tracing via OpenTelemetry SDK
- ✅ Log collection with Bunyan + trace-log correlation
- ✅ Custom metrics via OpenTelemetry SDK
- ✅ Infrastructure metrics via GCP integration
- ✅ Officially supported — no Datadog Agent required

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
git clone https://github.com/YOUR_USERNAME/dd-gae-flex-node.git
cd dd-gae-flex-node
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
gcloud app browse
```

## How It Works

### Architecture

```
Node.js app (Express)
       │
       ├── Traces ──► OTel OTLP Exporter ──► https://gae.integrations.otlp.us5.datadoghq.com/v1/traces
       ├── Logs ───► OTel OTLP Exporter ──► https://api.datadoghq.com/api/v2/otlp/v1/logs
       └── Metrics ► OTel OTLP Exporter ──► https://api.datadoghq.com/api/v2/otlp/v1/metrics

GCP Integration ──────────────────────────► Datadog (infrastructure metrics)
```

### tracing.js

Initializes the OpenTelemetry Node SDK before the app starts with three exporters:

- **Traces** — sent to Datadog's GAE-specific OTel endpoint via HTTP/protobuf
- **Logs** — sent to Datadog's standard OTel logs intake
- **Metrics** — sent to Datadog's standard OTel metrics intake, exported every 60 seconds

Auto-instrumentation via `@opentelemetry/auto-instrumentations-node` automatically traces HTTP requests, Express routes, and other supported libraries with no additional code.

> **Note:** `tracing.js` must be the **first `require`** in `server.js` to ensure instrumentation is set up before any other modules load.

### server.js

The Express app manually creates spans for business logic and injects trace context into Bunyan log entries via the `getTraceContext()` helper. This enables trace-log correlation in Datadog — clicking a trace shows the correlated logs and vice versa.

### Logging with Bunyan

Bunyan writes logs to both:
- **stdout** — picked up by GCP Cloud Logging
- **/var/log/app/app.log** — for local file access if needed

Each log entry includes `dd.trace_id` and `dd.span_id` fields for correlation.

### Dockerfile

Significantly simpler than an agent-based approach — just a Node.js base image with dependencies installed. No Datadog Agent, no background processes, no fragile binary paths.

## What You'll See in Datadog

| Feature | Where to look | Source |
|---|---|---|
| APM traces | APM → Traces, filter by `service:flex-node-service-otel` | OTel |
| Logs | Logs, filter by `service:flex-node-service-otel` | OTel |
| Trace-log correlation | Click a trace → Logs tab | OTel |
| Custom metrics | Metrics Explorer | OTel |
| Infrastructure (CPU, memory) | Infrastructure → Host Map | GCP integration |
| GAE metrics (requests, latency) | Dashboards → GAE | GCP integration |

## Diagnostic Endpoints

| Endpoint | Description |
|---|---|
| `/dd-status` | Shows running processes and DD env vars |
| `/dd-trace-check` | Returns current trace/span IDs for the active request |

## Comparison vs Agent-based Approach

| | Agent-based  | OTel-based (this example) |
|---|---|---|
| APM | ✅ | ✅ |
| Logs | ✅ | ✅ |
| Trace-log correlation | ✅ | ✅ |
| Infrastructure metrics | ✅ | ✅ (via GCP integration) |
| AppSec / IAST | ✅ | ❌ |
| SBOM / SCA | ✅ | ❌ |
| Runtime security | ✅ | ❌ |
| Officially supported | ❌ | ✅ |
| Memory overhead | ~200MB | ~50MB |
| Fragile binary paths | ❌ Yes | ✅ None |
| Dockerfile complexity | High | Low |

## OTel Endpoint Requirements

This example uses Datadog's GAE-specific OTel endpoint (currently in preview):

```
OTEL_EXPORTER_OTLP_TRACES_PROTOCOL=http/protobuf
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=<Your endpoint>
OTEL_EXPORTER_OTLP_TRACES_HEADERS=dd-api-key=${DD_API_KEY}
```

Authentication is handled via the `dd-api-key` header, set dynamically from the `DD_API_KEY` environment variable in `tracing.js`.

## Known Limitations

- The GAE OTel endpoint is currently in **preview** — not yet generally available
- Security features (AppSec, IAST, SBOM) are not available without the Datadog Agent
- The GAE-managed OpenTelemetry collector (`opentelemetry-collector` sidecar) cannot be configured to forward to Datadog — it is managed entirely by Google