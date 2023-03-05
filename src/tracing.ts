import {
  ConsoleSpanExporter,
  BatchSpanProcessor,
  SimpleSpanProcessor,
  NoopSpanProcessor
} from '@opentelemetry/sdk-trace-base';
import { metrics, NodeSDK } from '@opentelemetry/sdk-node';
import * as process from 'process';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
// Don't forget to import the dotenv package!
import * as dotenv from 'dotenv';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { ExplicitBucketHistogramAggregation, InstrumentType, MeterProvider, View } from '@opentelemetry/sdk-metrics';
import { HostMetrics } from '@opentelemetry/host-metrics';


dotenv.config()

diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN)

const consoleSpanExporter = new ConsoleSpanExporter();

const jaegerExporter = new JaegerExporter({
  endpoint: 'http://localhost:14268/api/traces',
});

const traceExporter = jaegerExporter;

const spanProcessor = new BatchSpanProcessor(traceExporter);

const noopProcessor = new NoopSpanProcessor()

const exporter = new OTLPTraceExporter({
  url: undefined
})

export const otelSDK = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: `nestjs-otel`,
  }),
  spanProcessor: spanProcessor,//process.env.NODE_ENV === `development` ? noopProcessor : spanProcessor,
  instrumentations: [
    new HttpInstrumentation(),
    new ExpressInstrumentation(),
    new NestInstrumentation(),
  ],
});

const histogramView = new metrics.View({
  aggregation: new metrics.ExplicitBucketHistogramAggregation([0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]),
  instrumentName: '*',
  instrumentType: metrics.InstrumentType.HISTOGRAM
})

// otelSDK.configureMeterProvider({
//   reader: new PrometheusExporter({
//     endpoint: 'metrics'
//   }),
//   views: [histogramView]
// })

const meterProvider = new MeterProvider({
  views: [
    new View({
      instrumentName: '*',
      instrumentType: InstrumentType.HISTOGRAM,
      aggregation: new ExplicitBucketHistogramAggregation([0.001, 0.01, 0.1, 1, 2, 5])
    })
  ]
})
const promexporter = new PrometheusExporter({
  endpoint: 'metrics',
})
meterProvider.addMetricReader(promexporter)

require('opentelemetry-node-metrics')(meterProvider)
const hostMetrics = new HostMetrics({ meterProvider, name: 'example-host-metrics' });
hostMetrics.start();




// gracefully shut down the SDK on process exit
process.on('SIGTERM', () => {
  otelSDK
    .shutdown()
    .then(
      () => diag.info('SDK shut down successfully'),
      (err) => diag.error('Error shutting down SDK', err),
    )
    .finally(() => process.exit(0));
});
