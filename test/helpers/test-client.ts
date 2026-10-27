import { Duplex } from 'node:stream';
import { IncomingMessage, ServerResponse } from 'node:http';
import type { Express } from 'express';

export interface TestRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface TestResponse<T = unknown> {
  status: number;
  headers: Record<string, string | number | string[] | undefined>;
  body: T;
  text: string;
}

class MockSocket extends Duplex {
  public remoteAddress = '127.0.0.1';
  public writable = true;
  override _read(): void {}
  override _write(
    _chunk: unknown,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    callback();
  }
}

export async function invokeApp<T = unknown>(
  app: Express,
  options: TestRequestOptions,
): Promise<TestResponse<T>> {
  return new Promise((resolve, reject) => {
    const socket = new MockSocket();
    const req = new IncomingMessage(socket as unknown as import('node:net').Socket);
    req.method = options.method ?? 'GET';
    req.url = options.path;

    const rawBody =
      options.body !== undefined
        ? typeof options.body === 'string'
          ? options.body
          : JSON.stringify(options.body)
        : '';

    const headers: Record<string, string> = {
      host: 'localhost',
      ...Object.fromEntries(
        Object.entries(options.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
      ),
    };

    if (options.body !== undefined) {
      headers['content-type'] = headers['content-type'] ?? 'application/json';
      headers['content-length'] = String(Buffer.byteLength(rawBody));
    }

    req.headers = headers;

    const res = new ServerResponse(req);
    res.assignSocket(socket as unknown as import('node:net').Socket);

    const chunks: Buffer[] = [];
    const origWrite = res.write.bind(res);
    const origEnd = res.end.bind(res);

    res.write = ((chunk: unknown, ...args: unknown[]): boolean => {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      }
      return (origWrite as (...a: unknown[]) => boolean)(chunk, ...args);
    }) as typeof res.write;

    res.end = ((chunk?: unknown, ...args: unknown[]): ServerResponse => {
      if (chunk && typeof chunk !== 'function') {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      }
      const result = (origEnd as (...a: unknown[]) => ServerResponse)(chunk, ...args);
      const rawOutput = Buffer.concat(chunks).toString('utf8');
      const separatorIdx = rawOutput.indexOf('\r\n\r\n');
      const text = separatorIdx !== -1 ? rawOutput.slice(separatorIdx + 4) : rawOutput;

      let parsedBody: unknown;
      try {
        parsedBody = text.length > 0 ? JSON.parse(text) : undefined;
      } catch {
        parsedBody = text;
      }

      resolve({
        status: res.statusCode,
        headers: res.getHeaders(),
        body: parsedBody as T,
        text,
      });
      return result;
    }) as typeof res.end;

    try {
      app(req, res);
      if (rawBody.length > 0) {
        req.push(Buffer.from(rawBody));
      }
      req.push(null);
    } catch (err) {
      reject(err);
    }
  });
}
