import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  bikeDetailDtosToCanonical,
  persistCanonicalBikes,
  type BrandWriteInput,
  type BikeWriteInput,
  type CatalogStore,
  type OfferWriteInput,
  type ShopWriteInput,
  type StoredBikeRow,
  type StoredBrandRow,
  type StoredOfferRow,
  type StoredShopRow,
  type StoredVariantRow,
  type VariantWriteInput,
} from '../src/etl/loader/postgres.loader.js';
import { runEtlPipeline } from '../src/etl/pipeline.js';
import type { ReefApiSnapshotRecord } from '../src/etl/sources/reefapi.client.js';
import { CATALOG_BIKES } from '../src/services/catalog.data.js';

function createInMemoryCatalogStore(): {
  store: CatalogStore;
  tables: {
    brands: StoredBrandRow[];
    shops: StoredShopRow[];
    bikes: Array<StoredBikeRow & { category: string; modelYear: number }>;
    variants: StoredVariantRow[];
    offers: StoredOfferRow[];
  };
} {
  let nextId = 1;
  const brands: StoredBrandRow[] = [];
  const shops: StoredShopRow[] = [];
  const bikes: Array<StoredBikeRow & { category: string; modelYear: number }> = [];
  const variants: StoredVariantRow[] = [];
  const offers: StoredOfferRow[] = [];

  const store: CatalogStore = {
    async findBrandBySlug(slug) {
      return brands.find((b) => b.slug === slug) ?? null;
    },
    async findBrandByName(name) {
      return brands.find((b) => b.name === name) ?? null;
    },
    async createBrand(data: BrandWriteInput) {
      const row: StoredBrandRow = {
        id: nextId++,
        slug: data.slug,
        name: data.name,
        logoUrl: data.logoUrl,
        country: data.country,
      };
      brands.push(row);
      return row;
    },
    async updateBrand(id, data) {
      const target = brands.find((b) => b.id === id);
      if (target) Object.assign(target, data);
    },

    async findShopBySlug(slug) {
      return shops.find((s) => s.slug === slug) ?? null;
    },
    async findShopByName(name) {
      return shops.find((s) => s.name === name) ?? null;
    },
    async createShop(data: ShopWriteInput) {
      const row: StoredShopRow = {
        id: nextId++,
        slug: data.slug,
        name: data.name,
        baseUrl: data.baseUrl,
      };
      shops.push(row);
      return row;
    },
    async updateShop(id, data) {
      const target = shops.find((s) => s.id === id);
      if (target) Object.assign(target, data);
    },

    async findBikeBySlug(slug) {
      return bikes.find((b) => b.slug === slug) ?? null;
    },
    async findBikeByNameAndYear(brandId, name, modelYear) {
      const target = name.trim().toLowerCase();
      return (
        bikes.find(
          (b) =>
            b.brandId === brandId &&
            b.modelYear === modelYear &&
            b.name.trim().toLowerCase() === target,
        ) ?? null
      );
    },
    async createBike(data: BikeWriteInput) {
      const row: StoredBikeRow & { category: string; modelYear: number } = {
        id: nextId++,
        slug: data.slug,
        name: data.name,
        brandId: data.brandId,
        category: data.category,
        modelYear: data.modelYear,
        description: data.description,
        drivetrain: data.drivetrain,
        weightKg: data.weightKg,
        imageUrl: data.imageUrl,
        keyHighlights: [...data.keyHighlights],
      };
      bikes.push(row);
      return row;
    },
    async updateBike(id, data) {
      const target = bikes.find((b) => b.id === id);
      if (target) Object.assign(target, data);
    },

    async findVariant(bikeId, sizeLabel) {
      return variants.find((v) => v.bikeId === bikeId && v.sizeLabel === sizeLabel) ?? null;
    },
    async createVariant(data: VariantWriteInput) {
      const row: StoredVariantRow = {
        id: nextId++,
        bikeId: data.bikeId,
        sizeLabel: data.sizeLabel,
        numericSizeCm: data.numericSizeCm,
        minRiderHeightCm: data.minRiderHeightCm,
        maxRiderHeightCm: data.maxRiderHeightCm,
        minInseamCm: data.minInseamCm,
        maxInseamCm: data.maxInseamCm,
        stackMm: data.stackMm,
        reachMm: data.reachMm,
      };
      variants.push(row);
      return row;
    },
    async updateVariant(id, data) {
      const target = variants.find((v) => v.id === id);
      if (target) Object.assign(target, data);
    },

    async findOffer(bikeVariantId, shopId, productUrl) {
      return (
        offers.find(
          (o) => o.bikeVariantId === bikeVariantId && o.shopId === shopId && o.productUrl === productUrl,
        ) ?? null
      );
    },
    async createOffer(data: OfferWriteInput) {
      const row: StoredOfferRow = {
        id: nextId++,
        bikeVariantId: data.bikeVariantId,
        shopId: data.shopId,
        productUrl: data.productUrl,
        priceUah: data.priceUah,
        oldPriceUah: data.oldPriceUah,
        inStock: data.inStock,
      };
      offers.push(row);
      return row;
    },
    async updateOffer(id, data) {
      const target = offers.find((o) => o.id === id);
      if (target) Object.assign(target, data);
    },

    async runInTransaction<T>(fn: (txStore: CatalogStore) => Promise<T>): Promise<T> {
      return await fn(store);
    },
  };

  return { store, tables: { brands, shops, bikes, variants, offers } };
}

describe('ETL Postgres Loader & End-to-End Pipeline', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'velodruh-etl-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('idempotently seeds CATALOG_BIKES without duplicating rows on repeat runs', async () => {
    const { store, tables } = createInMemoryCatalogStore();
    const records = bikeDetailDtosToCanonical(CATALOG_BIKES);

    const firstRun = await persistCanonicalBikes(records, store, '2026-11-24T10:00:00Z');
    expect(firstRun.bikesCreated).toBe(CATALOG_BIKES.length);
    expect(firstRun.bikesUpdated).toBe(0);
    expect(tables.bikes).toHaveLength(CATALOG_BIKES.length);

    const initialBrandCount = tables.brands.length;
    const initialShopCount = tables.shops.length;
    const initialVariantCount = tables.variants.length;
    const initialOfferCount = tables.offers.length;

    // Modify one offer price and re-run -> updates in place, zero duplicates!
    const updatedRecords = structuredClone(records);
    updatedRecords[0]!.variants[0]!.offers[0]!.priceUah = 31999;

    const secondRun = await persistCanonicalBikes(updatedRecords, store, '2026-11-24T11:00:00Z');
    expect(secondRun.bikesCreated).toBe(0);
    expect(secondRun.bikesUpdated).toBe(CATALOG_BIKES.length);
    expect(secondRun.offersCreated).toBe(0);
    expect(secondRun.offersUpdated).toBe(initialOfferCount);

    expect(tables.brands).toHaveLength(initialBrandCount);
    expect(tables.shops).toHaveLength(initialShopCount);
    expect(tables.variants).toHaveLength(initialVariantCount);
    expect(tables.offers).toHaveLength(initialOfferCount);
    expect(tables.offers[0]!.priceUah).toBe(31999);
  });

  it('runs end-to-end across XML fixture + saved OLX/Prom snapshots, exports JSON, and persists', async () => {
    const olxSnapshot: ReefApiSnapshotRecord = {
      version: 1,
      savedAt: '2026-11-24T10:30:00Z',
      engine: 'olx',
      action: 'search',
      requestBody: { query: 'pride rocx', country: 'ua' },
      estimatedCredits: 1,
      actualCredits: 1,
      response: {
        ok: true,
        data: {
          has_more: false,
          offers: [
            {
              id: 777111,
              title: 'Гравійний велосипед ПРАЙД Rocx 8.2 2025 рама M',
              url: 'https://www.olx.ua/d/uk/obyavlenie/pride-rocx-777111.html',
              price: { value: 27900, currency: 'UAH' },
              condition: 'used',
              location: { city: { name: 'Львів' } },
            },
          ],
        },
      },
    };
    const promSnapshot: ReefApiSnapshotRecord = {
      version: 1,
      savedAt: '2026-11-24T10:35:00Z',
      engine: 'prom-ua',
      action: 'search',
      requestBody: { query: 'trek marlin 7' },
      estimatedCredits: 2,
      actualCredits: 2,
      response: {
        ok: true,
        data: {
          has_more: false,
          results: [
            {
              product_id: '888222',
              name: 'Гірський велосипед Trek Marlin 7 Gen 3 2025 L',
              url: 'https://prom.ua/ua/p888222-trek-marlin-7.html',
              price: 42300,
              currency: 'UAH',
              in_stock: true,
              brand: 'Trek',
              seller: { seller_id: '10', name: 'CycleUA', city: 'Одеса' },
            },
          ],
        },
      },
    };

    const snapDir = join(tempDir, 'snapshots');
    const outPath = join(tempDir, 'catalog.json');
    await runWithDir(snapDir, olxSnapshot, promSnapshot);

    const { store, tables } = createInMemoryCatalogStore();
    const fixturePath = resolve(process.cwd(), 'data/fixtures/sample-feed.yml');

    const result = await runEtlPipeline({
      xmlFiles: [{ path: fixturePath }],
      snapshotPaths: [snapDir],
      exportJsonPath: outPath,
      persist: { enabled: true, store },
    });

    // XML had 5 rows (1 helmet rejected -> 4 valid); OLX added 1; Prom added 1 => 7 raw, 1 rejected, 6 valid
    expect(result.extracted.xmlFeeds).toBe(5);
    expect(result.extracted.snapshots).toBe(2);
    expect(result.totalRawListings).toBe(7);
    expect(result.rejectedCount).toBe(1);
    expect(result.rejectedByReason['ACCESSORY_OR_PART']).toBe(1);
    expect(result.normalizedCount).toBe(6);

    // Merged down to 3 unique bikes: Pride Rocx 8.2 2025, Trek Marlin 7 Gen 3 2025, Merida Scultura Endurance 300 2025
    expect(result.bikes).toHaveLength(3);
    expect(result.dedupStats.crossSourceMatches).toBe(2);
    expect(result.persistence?.bikesCreated).toBe(3);
    expect(tables.bikes).toHaveLength(3);

    const exported = JSON.parse(await readFile(outPath, 'utf8')) as { bikes: unknown[] };
    expect(exported.bikes).toHaveLength(3);
  });
});

async function runWithDir(
  snapDir: string,
  olxSnap: ReefApiSnapshotRecord,
  promSnap: ReefApiSnapshotRecord,
): Promise<void> {
  const { mkdir } = await import('node:fs/promises');
  await mkdir(snapDir, { recursive: true });
  await writeFile(join(snapDir, 'olx__search__test.json'), JSON.stringify(olxSnap), 'utf8');
  await writeFile(join(snapDir, 'prom-ua__search__test.json'), JSON.stringify(promSnap), 'utf8');
}
