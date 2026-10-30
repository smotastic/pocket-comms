import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Logger from 'effect/Logger';
import * as Tracer from 'effect/Tracer';
import { HttpClient, type HttpClientRequest, HttpClientResponse } from 'effect/http';

// Test doubles that keep spans and log lines in memory, so tests need no OTLP backend.

/** A tracer that records every span it starts. */
export const recordingTracer = () => {
  const spans: Array<Tracer.NativeSpan> = [];
  const tracer = Tracer.make({
    span: (options) => {
      const span = new Tracer.NativeSpan(options);
      spans.push(span);
      return span;
    },
  });
  return { spans, layer: Layer.succeed(Tracer.Tracer, tracer) };
};

export interface LogRecord {
  readonly message: unknown;
  readonly level: string;
  readonly traceId: string | undefined;
}

/** A logger that records each line with the trace id of the span it was written in. */
export const recordingLogger = () => {
  const records: Array<LogRecord> = [];
  const logger = Logger.make(({ message, logLevel, fiber }) => {
    records.push({
      message: Array.isArray(message) && message.length === 1 ? message[0] : message,
      level: logLevel,
      traceId: fiber.cache.span?.traceId,
    });
  });
  return { records, layer: Logger.layer([logger], { mergeWithExisting: false }) };
};

/** An `HttpClient` that records every request and answers each with an empty body. */
export const recordingHttpClient = (options: { readonly status?: number } = {}) => {
  const requests: Array<HttpClientRequest.HttpClientRequest> = [];
  const client = HttpClient.make((request) => {
    requests.push(request);
    return Effect.succeed(
      HttpClientResponse.fromWeb(request, new Response('{}', { status: options.status ?? 200 })),
    );
  });
  return { requests, layer: Layer.succeed(HttpClient.HttpClient, client) };
};
