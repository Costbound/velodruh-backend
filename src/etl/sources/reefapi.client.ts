import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface ReefApiEnvelope<TData = unknown> {
  ok: boolean;
  data?: TData;
  meta?: {
    record_count?: number;
    credits?: number;
    credits_used?: number;
    next_offset?: number;
    [key: string]: unknown;
  };
  error?: {
    code?: string;
    message?: string;
    retryable?: boolean;
  };
}

export interface ReefApiSnapshotRecord<TData = unknown> {
  version: 1;
  savedAt: string;
  engine: string;
  action: string;
  requestBody: Record<string, unknown>;
  estimatedCredits: number;
  actualCredits: number;
  response: ReefApiEnvelope<TData>;
}

export interface PlannedReefApiCall {
  engine: string;
  action: string;
  endpoint: string;
  requestBody: Record<string, unknown>;
  estimatedCredits: number;
  cacheHit: boolean;
  snapshotPath: string | null;
}

/**
 * Official per-call credit costs published in `https://reefapi.com/docs/<engine>.md`.
 * Used strictly BEFORE issuing a live HTTP request to prevent exceeding `maxCredits`.
 */
export const REEFAPI_CREDIT_COSTS: Record<string, number> = {
  'olx/search': 1,
  'olx/offer': 1,
  'olx/count': 1,
  'olx/categories': 1,
  'olx/locations': 1,
  'olx/user_offers': 1,
  'olx/suggested': 1,
  'olx/breadcrumbs': 1,
  'olx/user': 1,
  'olx/filters': 1,
  'prom-ua/search': 2,
  'prom-ua/product': 1,
  'prom-ua/reviews': 1,
  'prom-ua/seller': 2,
  'prom-ua/seller_reviews': 1,
  'prom-ua/categories': 1,
  'rozetka/search': 3,
  'rozetka/product': 3,
  'rozetka/reviews': 2,
  'rozetka/prices': 3,
  'hotline-ua/search': 3,
  'hotline-ua/category': 2,
  'hotline-ua/product': 1,
  'hotline-ua/offers': 2,
  'hotline-ua/price_history': 3,
};

export function getEstimatedCreditCost(engine: string, action: string): number {
  return REEFAPI_CREDIT_COSTS[`${engine}/${action}`] ?? 3;
}

export class CreditBudgetExceededError extends Error {
  public readonly spentCredits: number;
  public readonly requestedCredits: number;
  public readonly maxCredits: number;

  constructor(spentCredits: number, requestedCredits: number, maxCredits: number, endpoint: string) {
    super(
      `ReefAPI credit budget exceeded before calling ${endpoint}: ` +
        `spent=${spentCredits}, nextCost=${requestedCredits}, maxCredits=${maxCredits}. ` +
        `Refusing to spend more credits.`,
    );
    this.name = 'CreditBudgetExceededError';
    this.spentCredits = spentCredits;
    this.requestedCredits = requestedCredits;
    this.maxCredits = maxCredits;
  }
}

export class ReefApiRequestError extends Error {
  public readonly code: string;
  public readonly httpStatus: number;
  public readonly retryable: boolean;

  constructor(message: string, code: string, httpStatus: number, retryable = false) {
    super(message);
    this.name = 'ReefApiRequestError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryable = retryable;
  }
}

export interface ReefApiClientOptions {
  apiKey?: string;
  baseUrl?: string;
  /** Maximum credits this client instance is allowed to spend. Defaults to 25. */
  maxCredits?: number;
  /** When true, records planned requests and NEVER calls the network. Defaults to false. */
  dryRun?: boolean;
  /** Directory where every successful response is cached as JSON for zero-credit replay. */
  snapshotDir?: string;
  /** Skip reading existing snapshot cache and hit live API instead (still writes snapshots). */
  refreshCache?: boolean;
  /** Minimum delay between consecutive live HTTP requests in ms. Defaults to 250. */
  requestDelayMs?: number;
  /** HTTP request timeout in ms. Defaults to 30_000. */
  timeoutMs?: number;
  /** Retry count for transient network / 5xx / 429 failures (failed calls are free on ReefAPI). Defaults to 1. */
  maxRetries?: number;
  /** Custom `fetch` implementation for offline unit testing. */
  fetchImpl?: typeof fetch;
}

export interface ReefApiUsageStats {
  dryRun: boolean;
  maxCredits: number;
  creditsEstimated: number;
  creditsSpent: number;
  liveRequests: number;
  cacheHits: number;
  failedRequests: number;
  savedSnapshots: string[];
  plannedCalls: PlannedReefApiCall[];
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

function cleanRequestBody(body: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (v !== undefined) {
      cleaned[k] = v;
    }
  }
  return cleaned;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ReefApiClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly maxCredits: number;
  private readonly dryRun: boolean;
  private readonly snapshotDir: string | undefined;
  private readonly refreshCache: boolean;
  private readonly requestDelayMs: number;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchFn: typeof fetch;

  private creditsSpent = 0;
  private creditsEstimated = 0;
  private liveRequests = 0;
  private cacheHits = 0;
  private failedRequests = 0;
  private readonly savedSnapshots: string[] = [];
  private readonly plannedCalls: PlannedReefApiCall[] = [];
  private lastRequestAt = 0;
  private callQueue: Promise<void> = Promise.resolve();

  constructor(options: ReefApiClientOptions = {}) {
    this.apiKey = (options.apiKey ?? '').trim();
    this.baseUrl = (options.baseUrl ?? 'https://api.reefapi.com').replace(/\/+$/, '');
    this.maxCredits = options.maxCredits ?? 25;
    this.dryRun = options.dryRun ?? false;
    this.snapshotDir = options.snapshotDir;
    this.refreshCache = options.refreshCache ?? false;
    this.requestDelayMs = options.requestDelayMs ?? 250;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxRetries = Math.max(0, options.maxRetries ?? 1);
    this.fetchFn = options.fetchImpl ?? fetch;
  }

  public isDryRun(): boolean {
    return this.dryRun;
  }

  public getRemainingCredits(): number {
    return Math.max(0, this.maxCredits - this.creditsSpent);
  }

  public getStats(): ReefApiUsageStats {
    return {
      dryRun: this.dryRun,
      maxCredits: this.maxCredits,
      creditsEstimated: this.creditsEstimated,
      creditsSpent: this.creditsSpent,
      liveRequests: this.liveRequests,
      cacheHits: this.cacheHits,
      failedRequests: this.failedRequests,
      savedSnapshots: [...this.savedSnapshots],
      plannedCalls: [...this.plannedCalls],
    };
  }

  public getSnapshotPath(engine: string, action: string, body: Record<string, unknown>): string | null {
    if (!this.snapshotDir) return null;
    const hash = createHash('sha256')
      .update(`${engine}/${action}:${stableStringify(cleanRequestBody(body))}`)
      .digest('hex')
      .slice(0, 16);
    const safeEngine = engine.replace(/[^a-z0-9_-]/gi, '-');
    const safeAction = action.replace(/[^a-z0-9_-]/gi, '-');
    return join(this.snapshotDir, `${safeEngine}__${safeAction}__${hash}.json`);
  }

  private async tryReadSnapshot<TData>(path: string | null): Promise<ReefApiSnapshotRecord<TData> | null> {
    if (!path || this.refreshCache) return null;
    try {
      const content = await readFile(path, 'utf8');
      const parsed = JSON.parse(content) as ReefApiSnapshotRecord<TData>;
      if (parsed && parsed.response && parsed.response.ok === true) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  }

  private async waitRateLimitSlot(): Promise<void> {
    if (this.requestDelayMs <= 0) return;
    const previous = this.callQueue;
    let release!: () => void;
    this.callQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const elapsed = Date.now() - this.lastRequestAt;
    if (this.lastRequestAt > 0 && elapsed < this.requestDelayMs) {
      await sleep(this.requestDelayMs - elapsed);
    }
    this.lastRequestAt = Date.now();
    release();
  }

  /**
   * Calls `POST <baseUrl>/<engine>/v1/<action>` with snapshot cache, dry-run protection,
   * and a hard per-run credit ceiling.
   */
  public async call<TData = Record<string, unknown>>(
    engine: string,
    action: string,
    requestBody: Record<string, unknown>,
  ): Promise<ReefApiEnvelope<TData> | null> {
    const cleanedBody = cleanRequestBody(requestBody);
    const endpoint = `${this.baseUrl}/${engine}/v1/${action}`;
    const estimatedCredits = getEstimatedCreditCost(engine, action);
    const snapshotPath = this.getSnapshotPath(engine, action, cleanedBody);

    // 1. Reuse cached disk snapshot whenever available (0 credits!)
    const cached = await this.tryReadSnapshot<TData>(snapshotPath);
    if (cached) {
      this.cacheHits += 1;
      this.plannedCalls.push({
        engine,
        action,
        endpoint,
        requestBody: cleanedBody,
        estimatedCredits: 0,
        cacheHit: true,
        snapshotPath,
      });
      return cached.response;
    }

    this.plannedCalls.push({
      engine,
      action,
      endpoint,
      requestBody: cleanedBody,
      estimatedCredits,
      cacheHit: false,
      snapshotPath,
    });
    this.creditsEstimated += estimatedCredits;

    // 2. Dry-run exits before any HTTP call or API key check
    if (this.dryRun) {
      return null;
    }

    // 3. Enforce hard credit ceiling BEFORE firing the live request
    if (this.creditsSpent + estimatedCredits > this.maxCredits) {
      throw new CreditBudgetExceededError(
        this.creditsSpent,
        estimatedCredits,
        this.maxCredits,
        endpoint,
      );
    }

    if (!this.apiKey) {
      throw new Error(
        `REEFAPI_API_KEY is required for live execution against ${endpoint}. ` +
          `Pass --dry-run (default) to preview estimated credits without spending them, ` +
          `or set REEFAPI_API_KEY in your .env file.`,
      );
    }

    // Reserve credit slot before awaiting network in case of concurrent requests
    this.creditsSpent += estimatedCredits;

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      await this.waitRateLimitSlot();

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        this.liveRequests += 1;
        const response = await this.fetchFn(endpoint, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'x-api-key': this.apiKey,
          },
          body: JSON.stringify(cleanedBody),
        });

        let payload: ReefApiEnvelope<TData> | null = null;
        try {
          payload = (await response.json()) as ReefApiEnvelope<TData>;
        } catch {
          payload = null;
        }

        if (!response.ok) {
          const isTransient = response.status === 429 || response.status >= 500;
          const errCode = payload?.error?.code ?? `HTTP_${response.status}`;
          const errMsg = payload?.error?.message ?? `${response.status} ${response.statusText}`;
          const err = new ReefApiRequestError(
            `ReefAPI error on ${engine}/v1/${action}: ${errMsg}`,
            errCode,
            response.status,
            isTransient,
          );
          if (isTransient && attempt < this.maxRetries) {
            lastError = err;
            await sleep(500 * (attempt + 1));
            continue;
          }
          // Failed calls cost 0 credits on ReefAPI — refund the reserved estimate
          this.creditsSpent = Math.max(0, this.creditsSpent - estimatedCredits);
          this.failedRequests += 1;
          throw err;
        }

        if (!payload || payload.ok !== true) {
          const isRetryable = Boolean(payload?.error?.retryable);
          const errCode = payload?.error?.code ?? 'API_ERROR';
          const errMsg = payload?.error?.message ?? 'ReefAPI returned ok: false';
          const err = new ReefApiRequestError(
            `ReefAPI call failed on ${engine}/v1/${action}: ${errMsg}`,
            errCode,
            response.status,
            isRetryable,
          );
          if (isRetryable && attempt < this.maxRetries) {
            lastError = err;
            await sleep(500 * (attempt + 1));
            continue;
          }
          this.creditsSpent = Math.max(0, this.creditsSpent - estimatedCredits);
          this.failedRequests += 1;
          throw err;
        }

        // Reconcile actual credit cost returned by ReefAPI metadata if present
        const reportedCredits = payload.meta?.credits ?? payload.meta?.credits_used;
        const actualCredits =
          typeof reportedCredits === 'number' && Number.isFinite(reportedCredits) && reportedCredits >= 0
            ? reportedCredits
            : estimatedCredits;
        this.creditsSpent = Math.max(0, this.creditsSpent - estimatedCredits + actualCredits);

        // Immediately write raw response to snapshot cache so user never pays twice
        if (snapshotPath && this.snapshotDir) {
          await mkdir(this.snapshotDir, { recursive: true });
          const record: ReefApiSnapshotRecord<TData> = {
            version: 1,
            savedAt: new Date().toISOString(),
            engine,
            action,
            requestBody: cleanedBody,
            estimatedCredits,
            actualCredits,
            response: payload,
          };
          await writeFile(snapshotPath, JSON.stringify(record, null, 2), 'utf8');
          this.savedSnapshots.push(snapshotPath);
        }

        return payload;
      } catch (err) {
        if (err instanceof ReefApiRequestError) {
          throw err;
        }
        lastError = err;
        if (attempt < this.maxRetries) {
          await sleep(500 * (attempt + 1));
          continue;
        }
        this.creditsSpent = Math.max(0, this.creditsSpent - estimatedCredits);
        this.failedRequests += 1;
        throw err;
      } finally {
        clearTimeout(timer);
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}

/** Loads all saved ReefAPI `.json` snapshots from a file or directory (0 credits!). */
export async function loadSnapshotRecords(
  pathOrDir: string,
): Promise<ReefApiSnapshotRecord<unknown>[]> {
  if (pathOrDir.endsWith('.json')) {
    const raw = await readFile(pathOrDir, 'utf8');
    const parsed = JSON.parse(raw) as ReefApiSnapshotRecord<unknown>;
    return [parsed];
  }

  const entries = await readdir(pathOrDir, { withFileTypes: true });
  const records: ReefApiSnapshotRecord<unknown>[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const raw = await readFile(join(pathOrDir, entry.name), 'utf8');
    const parsed = JSON.parse(raw) as ReefApiSnapshotRecord<unknown>;
    if (parsed && typeof parsed.engine === 'string' && typeof parsed.action === 'string') {
      records.push(parsed);
    }
  }
  return records;
}

/** Runs async worker tasks with bounded parallelism to prevent burst load. */
export async function mapWithConcurrency<TIn, TOut>(
  items: TIn[],
  concurrency: number,
  worker: (item: TIn, index: number) => Promise<TOut>,
): Promise<TOut[]> {
  const safeLimit = Math.max(1, Math.min(concurrency, items.length || 1));
  const results: TOut[] = new Array<TOut>(items.length);
  let nextIndex = 0;

  async function consume(): Promise<void> {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await worker(items[current]!, current);
    }
  }

  const workers = Array.from({ length: safeLimit }, () => consume());
  await Promise.all(workers);
  return results;
}
