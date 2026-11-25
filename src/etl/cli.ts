import 'dotenv/config';
import { parseArgs } from 'node:util';
import { env } from '../config/env.js';
import { db } from '../prisma/db.js';
import { ensurePostgresSchema } from './loader/postgres.loader.js';
import { ETL_PRESETS, runEtlPipeline, type PresetName, type RunEtlPipelineOptions } from './pipeline.js';
import { ReefApiClient } from './sources/reefapi.client.js';

const HELP_TEXT = `
VeloDruh ETL CLI — One-time & snapshot-cached bicycle catalog aggregator

Safety default: DRY-RUN mode! No ReefAPI credits are spent unless you explicitly pass --execute.
Every successful ReefAPI response is cached to disk (--snapshot-dir), so subsequent re-runs
cost 0 credits.

Usage:
  npx tsx src/etl/cli.ts [options]

Options:
  --preset <name>         Query preset: minimal (6 cr), mvp (18 cr, default), full (33 cr)
  --sources <list>        Comma-separated ReefAPI sources: olx,prom,rozetka,hotline
  --query <text>          Custom search query (repeatable; overrides preset queries)
  --pages <n>             Pages per query per source (default: 1)
  --max-credits <n>       Hard ceiling on ReefAPI credits spent in this run (default: 25)
  --olx-condition <val>   Filter OLX listings: used | new
  --prom-condition <val>  Filter Prom.ua listings: new | used | refurbished | markdown
  --hotline-category <s>  Hotline.ua category slug (2 credits/page via /hotline-ua/v1/category)
  --min-price <uah>       Min bike price filter in UAH (default: 2000)
  --max-price <uah>       Max bike price filter in UAH (default: 600000)
  --enrich-details <n>    Optional per-listing detail fetch cap for OLX/Prom (default: 0)
  --xml-file <path>       Parse a local XML/YML feed file (repeatable, 0 credits)
  --xml-url <url>         Fetch & parse a remote XML/YML feed URL (repeatable, 0 credits)
  --snapshot-dir <dir>    Cache directory for raw ReefAPI JSON snapshots (default: data/snapshots)
  --from-snapshot <path>  Replay existing ReefAPI snapshot file or directory (repeatable, 0 credits)
  --refresh-cache         Ignore cached snapshot hits and call live ReefAPI (only with --execute)
  --seed                  Include the curated CATALOG_BIKES seed records (0 credits)
  --out <path>            Write normalized + deduplicated catalog JSON to file
  --init-schema           Run idempotent Postgres CREATE TABLE IF NOT EXISTS DDL
  --save-db               Persist resulting catalog into PostgreSQL (DATABASE_URL)
  --execute               LIVE MODE: authorize calling api.reefapi.com and spending credits
  --help, -h              Show this help message

Examples:
  # 1. Preview credit cost (0 credits spent):
  npm run etl:plan

  # 2. Run local XML/YML sample feed offline (0 credits):
  npm run etl:demo

  # 3. Bootstrap Postgres schema & load curated seed dataset (0 credits):
  npm run etl:seed

  # 4. One-time LIVE ReefAPI ingestion (18 credits -> saved to data/snapshots/ & Postgres):
  REEFAPI_API_KEY=... npm run etl:run -- --preset mvp --max-credits 20 --execute --init-schema --save-db

  # 5. Re-normalize & reload from saved snapshots (0 credits!):
  npm run etl:run -- --from-snapshot data/snapshots --save-db
`.trim();

function parsePositiveInt(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid integer for ${name}: "${raw}"`);
  }
  return parsed;
}

function parseNonNegativeInt(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid integer for ${name}: "${raw}"`);
  }
  return parsed;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      help: { type: 'boolean', short: 'h', default: false },
      preset: { type: 'string' },
      sources: { type: 'string' },
      query: { type: 'string', multiple: true },
      pages: { type: 'string' },
      'max-credits': { type: 'string' },
      'olx-condition': { type: 'string' },
      'prom-condition': { type: 'string' },
      'hotline-category': { type: 'string' },
      'min-price': { type: 'string' },
      'max-price': { type: 'string' },
      'enrich-details': { type: 'string' },
      'xml-file': { type: 'string', multiple: true },
      'xml-url': { type: 'string', multiple: true },
      'snapshot-dir': { type: 'string', default: 'data/snapshots' },
      'from-snapshot': { type: 'string', multiple: true },
      'refresh-cache': { type: 'boolean', default: false },
      seed: { type: 'boolean', default: false },
      out: { type: 'string' },
      'init-schema': { type: 'boolean', default: false },
      'save-db': { type: 'boolean', default: false },
      execute: { type: 'boolean', default: false },
    },
    strict: true,
  });

  if (values.help) {
    console.log(HELP_TEXT);
    return;
  }

  const xmlFiles = (values['xml-file'] ?? []).map((path) => ({ path }));
  const xmlUrls = (values['xml-url'] ?? []).map((url) => ({ url }));
  const snapshotPaths = values['from-snapshot'] ?? [];
  const includeSeed = Boolean(values.seed);
  const saveDb = Boolean(values['save-db']);
  const initSchema = Boolean(values['init-schema']);
  const executeLive = Boolean(values.execute);

  const presetArg = values.preset as PresetName | undefined;
  if (presetArg && !(presetArg in ETL_PRESETS)) {
    throw new Error(`Unknown preset "${presetArg}". Expected one of: minimal, mvp, full`);
  }

  const hasOfflineOnlyInputs =
    (xmlFiles.length > 0 || xmlUrls.length > 0 || snapshotPaths.length > 0 || includeSeed) &&
    !values.preset &&
    !values.sources &&
    !(values.query && values.query.length > 0) &&
    !values['hotline-category'];

  const isInitOnly = initSchema && !saveDb && hasOfflineOnlyInputs === false && !values.preset && !values.sources && !values.execute;

  let touchedDb = false;

  try {
    if (isInitOnly && xmlFiles.length === 0 && xmlUrls.length === 0 && snapshotPaths.length === 0 && !includeSeed) {
      console.log('[ETL] Applying idempotent PostgreSQL schema (src/prisma/init.sql)...');
      await ensurePostgresSchema();
      touchedDb = true;
      console.log('[ETL] PostgreSQL schema ready.');
      return;
    }

    const pages = parsePositiveInt(values.pages, 1, '--pages');
    const maxCredits = parsePositiveInt(values['max-credits'], 25, '--max-credits');
    const minPriceUah = parseNonNegativeInt(values['min-price'], 2_000, '--min-price');
    const maxPriceUah = parsePositiveInt(values['max-price'], 600_000, '--max-price');
    const enrichDetails = parseNonNegativeInt(values['enrich-details'], 0, '--enrich-details');

    const pipelineOptions: RunEtlPipelineOptions = {
      xmlFiles,
      xmlUrls,
      snapshotPaths,
      includeSeed,
      normalization: {
        minPriceUah,
        maxPriceUah,
      },
      ...(values.out ? { exportJsonPath: values.out } : {}),
      ...(saveDb ? { persist: { enabled: true, initSchema } } : {}),
    };

    if (!hasOfflineOnlyInputs) {
      const preset = ETL_PRESETS[presetArg ?? 'mvp'];
      const enabledSources = new Set(
        values.sources
          ? values.sources
              .split(',')
              .map((s) => s.trim().toLowerCase())
              .filter(Boolean)
          : ['olx', 'prom', 'rozetka', ...(preset.hotlineQueries.length > 0 ? ['hotline'] : [])],
      );
      const customQueries = values.query && values.query.length > 0 ? values.query : undefined;

      const client = new ReefApiClient({
        apiKey: env.REEFAPI_API_KEY,
        baseUrl: env.REEFAPI_BASE_URL,
        maxCredits,
        dryRun: !executeLive,
        snapshotDir: values['snapshot-dir'],
        refreshCache: Boolean(values['refresh-cache']),
      });

      const olxCondition = values['olx-condition'] as 'new' | 'used' | undefined;
      const promCondition = values['prom-condition'] as
        | 'new'
        | 'used'
        | 'refurbished'
        | 'markdown'
        | undefined;

      pipelineOptions.reefApi = {
        client,
        ...(enabledSources.has('olx')
          ? {
              olx: {
                queries: customQueries ?? preset.olxQueries,
                maxPages: pages,
                limit: 50,
                ...(olxCondition ? { condition: olxCondition } : {}),
                enrichDetailsLimit: enrichDetails,
              },
            }
          : {}),
        ...(enabledSources.has('prom')
          ? {
              prom: {
                queries: customQueries ?? preset.promQueries,
                maxPages: pages,
                pageSize: 60,
                ...(promCondition ? { condition: promCondition } : {}),
                enrichDetailsLimit: enrichDetails,
              },
            }
          : {}),
        ...(enabledSources.has('rozetka')
          ? {
              rozetka: {
                queries: customQueries ?? preset.rozetkaQueries,
                maxPages: pages,
              },
            }
          : {}),
        ...(enabledSources.has('hotline') || values['hotline-category']
          ? {
              hotline: {
                ...(values['hotline-category']
                  ? { category: values['hotline-category'] }
                  : { queries: customQueries ?? preset.hotlineQueries }),
                maxPages: pages,
              },
            }
          : {}),
      };
    }

    if (saveDb) {
      touchedDb = true;
    }

    const result = await runEtlPipeline(pipelineOptions);

    console.log('\n=== VeloDruh ETL Run Report ===');
    if (result.reefApiStats) {
      const s = result.reefApiStats;
      console.log(`Mode:                ${s.dryRun ? 'DRY-RUN (0 credits spent — add --execute to call ReefAPI)' : 'LIVE EXECUTION'}`);
      console.log(`Credit budget cap:   ${s.maxCredits}`);
      console.log(`Estimated uncached:  ${s.creditsEstimated} credit(s)`);
      console.log(`Actual spent:        ${s.creditsSpent} credit(s)`);
      console.log(`Cache hits (free):   ${s.cacheHits}`);
      console.log(`Live HTTP calls:     ${s.liveRequests}`);
      if (s.savedSnapshots.length > 0) {
        console.log(`Saved snapshots:     ${s.savedSnapshots.length} file(s) in ${values['snapshot-dir']}`);
      }
      if (s.dryRun && s.plannedCalls.length > 0) {
        console.log('\nPlanned ReefAPI calls:');
        for (const call of s.plannedCalls) {
          const status = call.cacheHit ? 'CACHED (0 cr)' : `${call.estimatedCredits} cr`;
          console.log(`  - POST ${call.engine}/v1/${call.action} [${status}] ${JSON.stringify(call.requestBody)}`);
        }
      }
    }

    console.log('\nExtraction summary:');
    console.log(`  Raw listings total: ${result.totalRawListings} (xml=${result.extracted.xmlFeeds}, snapshots=${result.extracted.snapshots}, olx=${result.extracted.olx}, prom=${result.extracted.prom}, rozetka=${result.extracted.rozetka}, hotline=${result.extracted.hotline})`);
    if (result.extracted.seedBikes > 0) {
      console.log(`  Seed bikes added:   ${result.extracted.seedBikes}`);
    }
    console.log(`  Rejected listings:  ${result.rejectedCount} ${JSON.stringify(result.rejectedByReason)}`);
    console.log(`  Normalized valid:   ${result.normalizedCount}`);

    console.log('\nDeduplication (key: Brand + Model + Year):');
    console.log(`  Unique bikes:       ${result.bikes.length}`);
    console.log(`  Merged bike dupes:  ${result.dedupStats.mergedBikeDuplicates}`);
    console.log(`  Unique variants:    ${result.dedupStats.uniqueVariants}`);
    console.log(`  Unique offers:      ${result.dedupStats.uniqueOffers} (deduped URL dupes: ${result.dedupStats.deduplicatedOffers})`);
    console.log(`  Cross-source merge: ${result.dedupStats.crossSourceMatches}`);

    if (result.warnings.length > 0) {
      console.log(`\nWarnings (${result.warnings.length}):`);
      for (const w of result.warnings.slice(0, 10)) {
        console.log(`  ! ${w}`);
      }
    }

    if (values.out) {
      console.log(`\nExported JSON:       ${values.out}`);
    }

    if (result.persistence) {
      const p = result.persistence;
      console.log('\nPostgreSQL persistence:');
      console.log(`  Brands:   +${p.brandsCreated} created, ${p.brandsUpdated} updated`);
      console.log(`  Shops:    +${p.shopsCreated} created, ${p.shopsUpdated} updated`);
      console.log(`  Bikes:    +${p.bikesCreated} created, ${p.bikesUpdated} updated`);
      console.log(`  Variants: +${p.variantsCreated} created, ${p.variantsUpdated} updated`);
      console.log(`  Offers:   +${p.offersCreated} created, ${p.offersUpdated} updated`);
    }
  } finally {
    if (touchedDb) {
      await db.close();
    }
  }
}

main().catch((err) => {
  console.error('[ETL] Failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
