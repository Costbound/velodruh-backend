import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { CATALOG_BIKES } from '../services/catalog.data.js';
import { deduplicateListings } from './dedup/deduplicator.js';
import {
  bikeDetailDtosToCanonical,
  ensurePostgresSchema,
  persistCanonicalBikes,
  type CatalogStore,
} from './loader/postgres.loader.js';
import { normalizeListings } from './normalizers/index.js';
import { fetchHotlineListings, parseHotlineResponseData } from './sources/hotline.parser.js';
import { fetchOlxListings, parseOlxResponseData } from './sources/olx.parser.js';
import { fetchPromListings, parsePromResponseData } from './sources/prom.parser.js';
import {
  loadSnapshotRecords,
  ReefApiClient,
  type ReefApiSnapshotRecord,
  type ReefApiUsageStats,
} from './sources/reefapi.client.js';
import { fetchRozetkaListings, parseRozetkaResponseData } from './sources/rozetka.parser.js';
import { fetchAndParseXmlFeed, parseXmlFeedFile } from './sources/xml-feed.parser.js';
import type {
  CanonicalBikeRecord,
  DeduplicationStats,
  NormalizationOptions,
  PersistenceSummary,
  RawListing,
  RejectedListing,
} from './types.js';

export type PresetName = 'minimal' | 'mvp' | 'full';

export interface PresetConfig {
  description: string;
  olxQueries: string[];
  promQueries: string[];
  rozetkaQueries: string[];
  hotlineQueries: string[];
  estimatedCreditsPerPage: number;
}

export const ETL_PRESETS: Record<PresetName, PresetConfig> = {
  minimal: {
    description: 'OLX (2 cr) + Prom.ua (4 cr) = 6 credits/run (~176 listings)',
    olxQueries: ['велосипед гравійний', 'велосипед гірський'],
    promQueries: ['велосипед гравійний', 'велосипед гірський'],
    rozetkaQueries: [],
    hotlineQueries: [],
    estimatedCreditsPerPage: 6,
  },
  mvp: {
    description: 'OLX (3 cr) + Prom.ua (6 cr) + Rozetka (9 cr) = 18 credits/run (~500 listings)',
    olxQueries: ['велосипед гравійний', 'велосипед гірський', 'велосипед шосейний'],
    promQueries: ['велосипед гравійний', 'велосипед гірський', 'велосипед шосейний'],
    rozetkaQueries: ['велосипед гравійний', 'велосипед гірський', 'велосипед шосейний'],
    hotlineQueries: [],
    estimatedCreditsPerPage: 18,
  },
  full: {
    description:
      'OLX (5 cr) + Prom.ua (10 cr) + Rozetka (12 cr) + Hotline.ua (6 cr) = 33 credits/run (~900+ listings)',
    olxQueries: [
      'велосипед гравійний',
      'велосипед гірський',
      'велосипед шосейний',
      'велосипед міський',
      'велосипед туринговий',
    ],
    promQueries: [
      'велосипед гравійний',
      'велосипед гірський',
      'велосипед шосейний',
      'велосипед міський',
      'велосипед гібридний',
    ],
    rozetkaQueries: [
      'велосипед гравійний',
      'велосипед гірський',
      'велосипед шосейний',
      'велосипед міський',
    ],
    hotlineQueries: ['велосипед гравійний', 'велосипед гірський'],
    estimatedCreditsPerPage: 33,
  },
};

export interface XmlFileInput {
  path: string;
  shopSlug?: string;
  shopName?: string;
  shopBaseUrl?: string;
}

export interface XmlUrlInput {
  url: string;
  shopSlug?: string;
  shopName?: string;
  shopBaseUrl?: string;
}

export interface RunEtlPipelineOptions {
  /** Direct raw listings supplied in memory (great for tests/programmatic usage). */
  rawListings?: RawListing[];
  /** Local XML/YML feed files (0 ReefAPI credits). */
  xmlFiles?: XmlFileInput[];
  /** Remote XML/YML feed URLs (0 ReefAPI credits). */
  xmlUrls?: XmlUrlInput[];
  /** Path(s) to saved ReefAPI JSON snapshot file or directory for zero-credit replay. */
  snapshotPaths?: string[];
  /** Include the curated in-repo `CATALOG_BIKES` dataset as seed records. */
  includeSeed?: boolean;
  /** ReefAPI client instance or inline marketplace tasks (guarded by `dryRun` and `maxCredits`). */
  reefApi?: {
    client: ReefApiClient;
    olx?: {
      queries: string[];
      maxPages?: number;
      limit?: number;
      condition?: 'new' | 'used';
      priceFrom?: number;
      priceTo?: number;
      enrichDetailsLimit?: number;
    };
    prom?: {
      queries: string[];
      maxPages?: number;
      pageSize?: number;
      condition?: 'new' | 'used' | 'refurbished' | 'markdown';
      inStockOnly?: boolean;
      minPrice?: number;
      maxPrice?: number;
      enrichDetailsLimit?: number;
    };
    rozetka?: {
      queries: string[];
      maxPages?: number;
      seller?: 'rozetka' | 'marketplace';
      minPrice?: number;
      maxPrice?: number;
    };
    hotline?: {
      queries?: string[];
      category?: string;
      maxPages?: number;
      minPrice?: number;
      maxPrice?: number;
    };
  };
  /** Normalization parameters (default year, min/max price filter, exchange rates). */
  normalization?: NormalizationOptions;
  /** Optional output JSON file path to dump normalized + deduplicated records. */
  exportJsonPath?: string;
  /** Persist canonical records into PostgreSQL via `persistStore` or default Prisma ORM store. */
  persist?: {
    enabled: boolean;
    initSchema?: boolean;
    store?: CatalogStore;
  };
  fetchImpl?: typeof fetch;
}

export interface SourceExtractionStats {
  xmlFeeds: number;
  snapshots: number;
  olx: number;
  prom: number;
  rozetka: number;
  hotline: number;
  inline: number;
  seedBikes: number;
}

export interface EtlPipelineResult {
  extracted: SourceExtractionStats;
  totalRawListings: number;
  rejectedCount: number;
  rejectedByReason: Record<string, number>;
  rejected: RejectedListing[];
  normalizedCount: number;
  bikes: CanonicalBikeRecord[];
  dedupStats: DeduplicationStats;
  warnings: string[];
  reefApiStats: ReefApiUsageStats | null;
  persistence: PersistenceSummary | null;
}

/** Converts saved ReefAPI JSON snapshot records back into `RawListing[]` (0 credits). */
export function parseSnapshotRecordToListings(record: ReefApiSnapshotRecord<unknown>): RawListing[] {
  if (!record.response || record.response.ok !== true || record.response.data === undefined) {
    return [];
  }
  const timestamp = record.savedAt || new Date().toISOString();
  switch (record.engine) {
    case 'olx':
      return parseOlxResponseData(record.action, record.response.data, timestamp);
    case 'prom-ua': {
      const cond =
        typeof record.requestBody?.['condition'] === 'string'
          ? record.requestBody['condition']
          : undefined;
      return parsePromResponseData(record.action, record.response.data, cond, timestamp);
    }
    case 'rozetka':
      return parseRozetkaResponseData(record.action, record.response.data, timestamp);
    case 'hotline-ua':
      return parseHotlineResponseData(record.action, record.response.data, timestamp);
    default:
      return [];
  }
}

/**
 * Pure synchronous normalization + deduplication step for already-extracted `RawListing[]`.
 */
export function transformAndDeduplicate(
  rawListings: RawListing[],
  options: NormalizationOptions = {},
): {
  bikes: CanonicalBikeRecord[];
  stats: DeduplicationStats;
  normalizedCount: number;
  rejected: RejectedListing[];
  rejectedByReason: Record<string, number>;
} {
  const { normalized, rejected } = normalizeListings(rawListings, options);
  const { bikes, stats } = deduplicateListings(normalized);

  const rejectedByReason: Record<string, number> = {};
  for (const r of rejected) {
    rejectedByReason[r.reason] = (rejectedByReason[r.reason] ?? 0) + 1;
  }

  return {
    bikes,
    stats,
    normalizedCount: normalized.length,
    rejected,
    rejectedByReason,
  };
}

/**
 * Runs the end-to-end ETL pipeline:
 * 1. Extract (`xml_feed` files/URLs, saved snapshots, ReefAPI `olx`/`prom-ua`/`rozetka`/`hotline-ua`)
 * 2. Clean & Normalize (`brand`, `category`, `size`, `specs`, `year`, accessory filter)
 * 3. Deduplicate & Merge (`Brand + Model + Year` key)
 * 4. Optional JSON export & idempotent PostgreSQL persistence (`Brand`, `Shop`, `Bike`, `BikeVariant`, `Offer`)
 */
export async function runEtlPipeline(options: RunEtlPipelineOptions): Promise<EtlPipelineResult> {
  const rawListings: RawListing[] = [];
  const warnings: string[] = [];
  const extracted: SourceExtractionStats = {
    xmlFeeds: 0,
    snapshots: 0,
    olx: 0,
    prom: 0,
    rozetka: 0,
    hotline: 0,
    inline: 0,
    seedBikes: 0,
  };

  if (options.rawListings && options.rawListings.length > 0) {
    rawListings.push(...options.rawListings);
    extracted.inline += options.rawListings.length;
  }

  // 1a. Local XML/YML feed files (0 credits)
  for (const feed of options.xmlFiles ?? []) {
    const parsed = await parseXmlFeedFile(feed.path, {
      ...(feed.shopSlug ? { shopSlug: feed.shopSlug } : {}),
      ...(feed.shopName ? { shopName: feed.shopName } : {}),
      ...(feed.shopBaseUrl ? { shopBaseUrl: feed.shopBaseUrl } : {}),
    });
    rawListings.push(...parsed.listings);
    extracted.xmlFeeds += parsed.listings.length;
    warnings.push(...parsed.warnings);
  }

  // 1b. Remote XML/YML feed URLs (0 credits)
  for (const feed of options.xmlUrls ?? []) {
    const parsed = await fetchAndParseXmlFeed(feed.url, {
      ...(feed.shopSlug ? { shopSlug: feed.shopSlug } : {}),
      ...(feed.shopName ? { shopName: feed.shopName } : {}),
      ...(feed.shopBaseUrl ? { shopBaseUrl: feed.shopBaseUrl } : {}),
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    });
    rawListings.push(...parsed.listings);
    extracted.xmlFeeds += parsed.listings.length;
    warnings.push(...parsed.warnings);
  }

  // 1c. Replay saved ReefAPI JSON snapshots (0 credits)
  for (const snapPath of options.snapshotPaths ?? []) {
    const records = await loadSnapshotRecords(snapPath);
    for (const rec of records) {
      const parsed = parseSnapshotRecordToListings(rec);
      if (parsed.length === 0) {
        warnings.push(`Snapshot for ${rec.engine}/${rec.action} yielded 0 raw listings`);
      }
      rawListings.push(...parsed);
      extracted.snapshots += parsed.length;
    }
  }

  // 1d. Live / dry-run / cached ReefAPI extraction (sequential per source to keep credit budget deterministic)
  let reefApiStats: ReefApiUsageStats | null = null;
  if (options.reefApi) {
    const { client, olx, prom, rozetka, hotline } = options.reefApi;

    if (olx && olx.queries.length > 0) {
      const olxRows = await fetchOlxListings(client, {
        queries: olx.queries,
        country: 'ua',
        ...(olx.maxPages !== undefined ? { maxPages: olx.maxPages } : {}),
        ...(olx.limit !== undefined ? { limit: olx.limit } : {}),
        ...(olx.condition !== undefined ? { condition: olx.condition } : {}),
        ...(olx.priceFrom !== undefined ? { priceFrom: olx.priceFrom } : {}),
        ...(olx.priceTo !== undefined ? { priceTo: olx.priceTo } : {}),
        ...(olx.enrichDetailsLimit !== undefined
          ? { enrichDetailsLimit: olx.enrichDetailsLimit }
          : {}),
      });
      rawListings.push(...olxRows);
      extracted.olx += olxRows.length;
    }

    if (prom && prom.queries.length > 0) {
      const promRows = await fetchPromListings(client, {
        queries: prom.queries,
        ...(prom.maxPages !== undefined ? { maxPages: prom.maxPages } : {}),
        ...(prom.pageSize !== undefined ? { pageSize: prom.pageSize } : {}),
        ...(prom.condition !== undefined ? { condition: prom.condition } : {}),
        ...(prom.inStockOnly !== undefined ? { inStockOnly: prom.inStockOnly } : {}),
        ...(prom.minPrice !== undefined ? { minPrice: prom.minPrice } : {}),
        ...(prom.maxPrice !== undefined ? { maxPrice: prom.maxPrice } : {}),
        ...(prom.enrichDetailsLimit !== undefined
          ? { enrichDetailsLimit: prom.enrichDetailsLimit }
          : {}),
      });
      rawListings.push(...promRows);
      extracted.prom += promRows.length;
    }

    if (rozetka && rozetka.queries.length > 0) {
      const rozetkaRows = await fetchRozetkaListings(client, {
        queries: rozetka.queries,
        ...(rozetka.maxPages !== undefined ? { maxPages: rozetka.maxPages } : {}),
        ...(rozetka.seller !== undefined ? { seller: rozetka.seller } : {}),
        ...(rozetka.minPrice !== undefined ? { minPrice: rozetka.minPrice } : {}),
        ...(rozetka.maxPrice !== undefined ? { maxPrice: rozetka.maxPrice } : {}),
      });
      rawListings.push(...rozetkaRows);
      extracted.rozetka += rozetkaRows.length;
    }

    if (hotline && ((hotline.queries?.length ?? 0) > 0 || hotline.category)) {
      const hotlineRows = await fetchHotlineListings(client, {
        ...(hotline.queries ? { queries: hotline.queries } : {}),
        ...(hotline.category ? { category: hotline.category } : {}),
        ...(hotline.maxPages !== undefined ? { maxPages: hotline.maxPages } : {}),
        ...(hotline.minPrice !== undefined ? { minPrice: hotline.minPrice } : {}),
        ...(hotline.maxPrice !== undefined ? { maxPrice: hotline.maxPrice } : {}),
      });
      rawListings.push(...hotlineRows);
      extracted.hotline += hotlineRows.length;
    }

    reefApiStats = client.getStats();
  }

  // 2 & 3. Clean, normalize, and deduplicate by `Brand + Model + Year`
  const transformed = transformAndDeduplicate(rawListings, options.normalization);
  const allBikes: CanonicalBikeRecord[] = [...transformed.bikes];

  if (options.includeSeed) {
    const seedBikes = bikeDetailDtosToCanonical(CATALOG_BIKES);
    const existingSlugs = new Set(allBikes.map((b) => b.slug));
    for (const sb of seedBikes) {
      if (!existingSlugs.has(sb.slug)) {
        allBikes.push(sb);
        existingSlugs.add(sb.slug);
        extracted.seedBikes += 1;
      }
    }
  }

  // 4a. Optional JSON snapshot export of processed catalog
  if (options.exportJsonPath) {
    await mkdir(dirname(options.exportJsonPath), { recursive: true });
    await writeFile(
      options.exportJsonPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          extracted,
          dedupStats: transformed.stats,
          rejectedByReason: transformed.rejectedByReason,
          bikes: allBikes,
        },
        null,
        2,
      ),
      'utf8',
    );
  }

  // 4b. Optional idempotent PostgreSQL persistence
  let persistence: PersistenceSummary | null = null;
  if (options.persist?.enabled) {
    if (options.persist.initSchema && !options.persist.store) {
      await ensurePostgresSchema();
    }
    persistence = await persistCanonicalBikes(
      allBikes,
      options.persist.store,
      options.normalization?.nowIso,
    );
  }

  return {
    extracted,
    totalRawListings: rawListings.length,
    rejectedCount: transformed.rejected.length,
    rejectedByReason: transformed.rejectedByReason,
    rejected: transformed.rejected,
    normalizedCount: transformed.normalizedCount,
    bikes: allBikes,
    dedupStats: transformed.stats,
    warnings,
    reefApiStats,
    persistence,
  };
}
