import type { BikeDetailDto } from '../../schemas/bike.schema.js';
import type {
  BikeCategoryType,
  BrakeType,
  FrameMaterialType,
  RiderGenderType,
  RidingPositionType,
} from '../../schemas/wizard.schema.js';
import { db } from '../../prisma/db.js';
import type { CanonicalBikeRecord, PersistenceSummary } from '../types.js';
import { slugify } from '../normalizers/text.utils.js';

export interface StoredBrandRow {
  id: number;
  slug: string;
  name: string;
  logoUrl: string | null;
  country: string | null;
}

export interface StoredShopRow {
  id: number;
  slug: string;
  name: string;
  baseUrl: string;
}

export interface StoredBikeRow {
  id: number;
  slug: string;
  name: string;
  brandId: number;
  description: string | null;
  drivetrain: string;
  weightKg: number | null;
  imageUrl: string | null;
  keyHighlights: readonly string[];
}

export interface StoredVariantRow {
  id: number;
  bikeId: number;
  sizeLabel: string;
  numericSizeCm: number | null;
  minRiderHeightCm: number;
  maxRiderHeightCm: number;
  minInseamCm: number | null;
  maxInseamCm: number | null;
  stackMm: number | null;
  reachMm: number | null;
}

export interface StoredOfferRow {
  id: number;
  bikeVariantId: number;
  shopId: number;
  productUrl: string;
  priceUah: number;
  oldPriceUah: number | null;
  inStock: boolean;
}

export interface BrandWriteInput {
  slug: string;
  name: string;
  logoUrl: string | null;
  country: string | null;
  updatedAt: string;
}

export interface ShopWriteInput {
  slug: string;
  name: string;
  baseUrl: string;
  logoUrl: string | null;
  affiliateParamKey: string | null;
  updatedAt: string;
}

export interface BikeWriteInput {
  slug: string;
  name: string;
  brandId: number;
  category: BikeCategoryType;
  modelYear: number;
  description: string | null;
  gender: RiderGenderType;
  brakeType: BrakeType;
  drivetrain: string;
  wheelSize: string;
  weightKg: number | null;
  frameMaterial: FrameMaterialType;
  ridingPosition: RidingPositionType;
  hasRackMounts: boolean;
  hasFenderMounts: boolean;
  suspensionFork: boolean;
  asphaltScore: number;
  gravelScore: number;
  offroadScore: number;
  imageUrl: string | null;
  keyHighlights: readonly string[];
  updatedAt: string;
}

export interface VariantWriteInput {
  bikeId: number;
  sizeLabel: string;
  numericSizeCm: number | null;
  minRiderHeightCm: number;
  maxRiderHeightCm: number;
  minInseamCm: number | null;
  maxInseamCm: number | null;
  stackMm: number | null;
  reachMm: number | null;
  updatedAt: string;
}

export interface OfferWriteInput {
  bikeVariantId: number;
  shopId: number;
  priceUah: number;
  oldPriceUah: number | null;
  inStock: boolean;
  productUrl: string;
  affiliateUrl: string;
  lastCheckedAt: string;
  updatedAt: string;
}

/**
 * Persistence adapter interface so the loader runs against both the real Prisma ORM v8
 * PostgreSQL client (`db.orm.public.*`) and lightweight in-memory stores in unit tests.
 */
export interface CatalogStore {
  findBrandBySlug(slug: string): Promise<StoredBrandRow | null>;
  findBrandByName(name: string): Promise<StoredBrandRow | null>;
  createBrand(data: BrandWriteInput): Promise<StoredBrandRow>;
  updateBrand(id: number, data: Partial<BrandWriteInput>): Promise<void>;

  findShopBySlug(slug: string): Promise<StoredShopRow | null>;
  findShopByName(name: string): Promise<StoredShopRow | null>;
  createShop(data: ShopWriteInput): Promise<StoredShopRow>;
  updateShop(id: number, data: Partial<ShopWriteInput>): Promise<void>;

  findBikeBySlug(slug: string): Promise<StoredBikeRow | null>;
  findBikeByNameAndYear(brandId: number, name: string, modelYear: number): Promise<StoredBikeRow | null>;
  createBike(data: BikeWriteInput): Promise<StoredBikeRow>;
  updateBike(id: number, data: Partial<BikeWriteInput>): Promise<void>;

  findVariant(bikeId: number, sizeLabel: string): Promise<StoredVariantRow | null>;
  createVariant(data: VariantWriteInput): Promise<StoredVariantRow>;
  updateVariant(id: number, data: Partial<VariantWriteInput>): Promise<void>;

  findOffer(bikeVariantId: number, shopId: number, productUrl: string): Promise<StoredOfferRow | null>;
  createOffer(data: OfferWriteInput): Promise<StoredOfferRow>;
  updateOffer(id: number, data: Partial<OfferWriteInput>): Promise<void>;

  runInTransaction<T>(fn: (txStore: CatalogStore) => Promise<T>): Promise<T>;
}

type PrismaLikeClient = Pick<typeof db, 'orm'>;

function wrapPrismaOrm(client: PrismaLikeClient): Omit<CatalogStore, 'runInTransaction'> {
  return {
    async findBrandBySlug(slug) {
      return await client.orm.public.Brand.where({ slug }).first();
    },
    async findBrandByName(name) {
      return await client.orm.public.Brand.where({ name }).first();
    },
    async createBrand(data) {
      return await client.orm.public.Brand.create({
        slug: data.slug,
        name: data.name,
        logoUrl: data.logoUrl,
        country: data.country,
        updatedAt: data.updatedAt,
      });
    },
    async updateBrand(id, data) {
      await client.orm.public.Brand.where({ id }).update(data);
    },

    async findShopBySlug(slug) {
      return await client.orm.public.Shop.where({ slug }).first();
    },
    async findShopByName(name) {
      return await client.orm.public.Shop.where({ name }).first();
    },
    async createShop(data) {
      return await client.orm.public.Shop.create({
        slug: data.slug,
        name: data.name,
        baseUrl: data.baseUrl,
        logoUrl: data.logoUrl,
        affiliateParamKey: data.affiliateParamKey,
        updatedAt: data.updatedAt,
      });
    },
    async updateShop(id, data) {
      await client.orm.public.Shop.where({ id }).update(data);
    },

    async findBikeBySlug(slug) {
      return await client.orm.public.Bike.where({ slug }).first();
    },
    async findBikeByNameAndYear(brandId, name, modelYear) {
      const target = name.trim().toLowerCase();
      const candidates = await client.orm.public.Bike.where({ brandId, modelYear }).all();
      return candidates.find((b) => b.name.trim().toLowerCase() === target) ?? null;
    },
    async createBike(data) {
      return await client.orm.public.Bike.create({
        slug: data.slug,
        name: data.name,
        brandId: data.brandId,
        category: data.category,
        modelYear: data.modelYear,
        description: data.description,
        gender: data.gender,
        brakeType: data.brakeType,
        drivetrain: data.drivetrain,
        wheelSize: data.wheelSize,
        weightKg: data.weightKg,
        frameMaterial: data.frameMaterial,
        ridingPosition: data.ridingPosition,
        hasRackMounts: data.hasRackMounts,
        hasFenderMounts: data.hasFenderMounts,
        suspensionFork: data.suspensionFork,
        asphaltScore: data.asphaltScore,
        gravelScore: data.gravelScore,
        offroadScore: data.offroadScore,
        imageUrl: data.imageUrl,
        keyHighlights: data.keyHighlights,
        updatedAt: data.updatedAt,
      });
    },
    async updateBike(id, data) {
      await client.orm.public.Bike.where({ id }).update(data);
    },

    async findVariant(bikeId, sizeLabel) {
      return await client.orm.public.BikeVariant.where({ bikeId, sizeLabel }).first();
    },
    async createVariant(data) {
      return await client.orm.public.BikeVariant.create({
        bikeId: data.bikeId,
        sizeLabel: data.sizeLabel,
        numericSizeCm: data.numericSizeCm,
        minRiderHeightCm: data.minRiderHeightCm,
        maxRiderHeightCm: data.maxRiderHeightCm,
        minInseamCm: data.minInseamCm,
        maxInseamCm: data.maxInseamCm,
        stackMm: data.stackMm,
        reachMm: data.reachMm,
        updatedAt: data.updatedAt,
      });
    },
    async updateVariant(id, data) {
      await client.orm.public.BikeVariant.where({ id }).update(data);
    },

    async findOffer(bikeVariantId, shopId, productUrl) {
      return await client.orm.public.Offer.where({ bikeVariantId, shopId, productUrl }).first();
    },
    async createOffer(data) {
      return await client.orm.public.Offer.create({
        bikeVariantId: data.bikeVariantId,
        shopId: data.shopId,
        priceUah: data.priceUah,
        oldPriceUah: data.oldPriceUah,
        inStock: data.inStock,
        productUrl: data.productUrl,
        affiliateUrl: data.affiliateUrl,
        lastCheckedAt: data.lastCheckedAt,
        updatedAt: data.updatedAt,
      });
    },
    async updateOffer(id, data) {
      await client.orm.public.Offer.where({ id }).update(data);
    },
  };
}

/** Creates the production PostgreSQL store backed by Prisma ORM v8 (`src/prisma/db.ts`). */
export function createPrismaCatalogStore(client: typeof db = db): CatalogStore {
  const base = wrapPrismaOrm(client);
  return {
    ...base,
    async runInTransaction<T>(fn: (txStore: CatalogStore) => Promise<T>): Promise<T> {
      return await client.transaction(async (tx) => {
        const inner = wrapPrismaOrm(tx);
        const txStore: CatalogStore = {
          ...inner,
          async runInTransaction<U>(nested: (s: CatalogStore) => Promise<U>): Promise<U> {
            return await nested(txStore);
          },
        };
        return await fn(txStore);
      });
    },
  };
}

const INIT_SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS "public"."Brand" (
    "id"        INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    "slug"      TEXT NOT NULL UNIQUE,
    "name"      TEXT NOT NULL UNIQUE,
    "logoUrl"   TEXT,
    "country"   TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "public"."Bike" (
    "id"              INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    "slug"            TEXT NOT NULL UNIQUE,
    "name"            TEXT NOT NULL,
    "brandId"         INTEGER NOT NULL REFERENCES "public"."Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "category"        TEXT NOT NULL CHECK ("category" IN ('GRAVEL', 'ROAD', 'MTB_HARDTAIL', 'CITY_COMMUTER', 'TOURING', 'HYBRID')),
    "modelYear"       INTEGER NOT NULL,
    "description"     TEXT,
    "gender"          TEXT NOT NULL DEFAULT 'UNISEX' CHECK ("gender" IN ('UNISEX', 'MALE', 'FEMALE')),
    "brakeType"       TEXT NOT NULL CHECK ("brakeType" IN ('HYDRAULIC_DISC', 'MECHANICAL_DISC', 'RIM')),
    "drivetrain"      TEXT NOT NULL,
    "wheelSize"       TEXT NOT NULL,
    "weightKg"        DOUBLE PRECISION,
    "frameMaterial"   TEXT NOT NULL CHECK ("frameMaterial" IN ('ALUMINUM', 'CARBON', 'STEEL')),
    "ridingPosition"  TEXT NOT NULL DEFAULT 'COMFORTABLE' CHECK ("ridingPosition" IN ('SPORT', 'COMFORTABLE', 'UPRIGHT')),
    "hasRackMounts"   BOOLEAN NOT NULL DEFAULT false,
    "hasFenderMounts" BOOLEAN NOT NULL DEFAULT false,
    "suspensionFork"  BOOLEAN NOT NULL DEFAULT false,
    "asphaltScore"    INTEGER NOT NULL DEFAULT 50,
    "gravelScore"     INTEGER NOT NULL DEFAULT 50,
    "offroadScore"    INTEGER NOT NULL DEFAULT 50,
    "imageUrl"        TEXT,
    "keyHighlights"   TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS "Bike_brandId_idx" ON "public"."Bike" ("brandId")`,
  `CREATE INDEX IF NOT EXISTS "Bike_category_idx" ON "public"."Bike" ("category")`,
  `CREATE TABLE IF NOT EXISTS "public"."BikeVariant" (
    "id"               INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    "bikeId"           INTEGER NOT NULL REFERENCES "public"."Bike"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "sizeLabel"        TEXT NOT NULL,
    "numericSizeCm"    INTEGER,
    "minRiderHeightCm" INTEGER NOT NULL,
    "maxRiderHeightCm" INTEGER NOT NULL,
    "minInseamCm"      INTEGER,
    "maxInseamCm"      INTEGER,
    "stackMm"          INTEGER,
    "reachMm"          INTEGER,
    "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt"        TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS "BikeVariant_bikeId_idx" ON "public"."BikeVariant" ("bikeId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "BikeVariant_bikeId_sizeLabel_key" ON "public"."BikeVariant" ("bikeId", "sizeLabel")`,
  `CREATE TABLE IF NOT EXISTS "public"."Shop" (
    "id"                INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    "slug"              TEXT NOT NULL UNIQUE,
    "name"              TEXT NOT NULL UNIQUE,
    "baseUrl"           TEXT NOT NULL,
    "logoUrl"           TEXT,
    "affiliateParamKey" TEXT,
    "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt"         TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "public"."Offer" (
    "id"            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    "bikeVariantId" INTEGER NOT NULL REFERENCES "public"."BikeVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "shopId"        INTEGER NOT NULL REFERENCES "public"."Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "priceUah"      INTEGER NOT NULL,
    "oldPriceUah"   INTEGER,
    "inStock"       BOOLEAN NOT NULL DEFAULT true,
    "productUrl"    TEXT NOT NULL,
    "affiliateUrl"  TEXT NOT NULL,
    "lastCheckedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS "Offer_bikeVariantId_idx" ON "public"."Offer" ("bikeVariantId")`,
  `CREATE INDEX IF NOT EXISTS "Offer_shopId_idx" ON "public"."Offer" ("shopId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Offer_variant_shop_url_key" ON "public"."Offer" ("bikeVariantId", "shopId", "productUrl")`,
  `CREATE TABLE IF NOT EXISTS "public"."QuizSubmission" (
    "id"                   INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    "heightCm"             INTEGER NOT NULL,
    "inseamCm"             INTEGER,
    "gender"               TEXT NOT NULL DEFAULT 'UNISEX' CHECK ("gender" IN ('UNISEX', 'MALE', 'FEMALE')),
    "minBudgetUah"         INTEGER NOT NULL,
    "maxBudgetUah"         INTEGER NOT NULL,
    "asphaltPct"           INTEGER NOT NULL,
    "gravelPct"            INTEGER NOT NULL,
    "offroadPct"           INTEGER NOT NULL,
    "ridingPosition"       TEXT NOT NULL CHECK ("ridingPosition" IN ('SPORT', 'COMFORTABLE', 'UPRIGHT')),
    "primaryGoal"          TEXT NOT NULL,
    "recommendedCategory"  TEXT NOT NULL CHECK ("recommendedCategory" IN ('GRAVEL', 'ROAD', 'MTB_HARDTAIL', 'CITY_COMMUTER', 'TOURING', 'HYBRID')),
    "recommendedSizeLabel" TEXT NOT NULL,
    "topBikeSlug"          TEXT,
    "createdAt"            TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
];

/** Applies the idempotent DDL matching `src/prisma/contract.prisma` (`src/prisma/init.sql`). */
export async function ensurePostgresSchema(client: typeof db = db): Promise<void> {
  for (const statement of INIT_SCHEMA_STATEMENTS) {
    const plan = client.raw.sql([statement] as unknown as TemplateStringsArray).affectedCount().build();
    await client.execute(plan);
  }
}

/**
 * Idempotently persists deduplicated `CanonicalBikeRecord[]` into PostgreSQL
 * (`Brand`, `Shop`, `Bike`, `BikeVariant`, `Offer`).
 * Re-running on identical data updates existing rows cleanly without creating duplicates.
 */
export async function persistCanonicalBikes(
  bikes: CanonicalBikeRecord[],
  store: CatalogStore = createPrismaCatalogStore(),
  nowIso: string = new Date().toISOString(),
): Promise<PersistenceSummary> {
  const summary: PersistenceSummary = {
    brandsCreated: 0,
    brandsUpdated: 0,
    shopsCreated: 0,
    shopsUpdated: 0,
    bikesCreated: 0,
    bikesUpdated: 0,
    variantsCreated: 0,
    variantsUpdated: 0,
    offersCreated: 0,
    offersUpdated: 0,
  };

  const brandCache = new Map<string, StoredBrandRow>();
  const shopCache = new Map<string, StoredShopRow>();

  async function upsertBrand(
    tx: CatalogStore,
    brand: CanonicalBikeRecord['brand'],
  ): Promise<StoredBrandRow> {
    const cached = brandCache.get(brand.slug);
    if (cached) return cached;

    let existing = await tx.findBrandBySlug(brand.slug);
    if (!existing) {
      existing = await tx.findBrandByName(brand.name);
    }

    if (!existing) {
      const created = await tx.createBrand({
        slug: brand.slug,
        name: brand.name,
        logoUrl: brand.logoUrl,
        country: brand.country,
        updatedAt: nowIso,
      });
      summary.brandsCreated += 1;
      brandCache.set(brand.slug, created);
      return created;
    }

    const needsUpdate =
      (brand.country !== null && existing.country === null) ||
      (brand.logoUrl !== null && existing.logoUrl === null);
    if (needsUpdate) {
      await tx.updateBrand(existing.id, {
        country: existing.country ?? brand.country,
        logoUrl: existing.logoUrl ?? brand.logoUrl,
        updatedAt: nowIso,
      });
      summary.brandsUpdated += 1;
    }

    brandCache.set(brand.slug, existing);
    return existing;
  }

  async function upsertShop(
    tx: CatalogStore,
    shop: { slug: string; name: string; baseUrl: string },
  ): Promise<StoredShopRow> {
    const cached = shopCache.get(shop.slug);
    if (cached) return cached;

    let existing = await tx.findShopBySlug(shop.slug);
    if (!existing) {
      existing = await tx.findShopByName(shop.name);
    }

    if (!existing) {
      const created = await tx.createShop({
        slug: shop.slug,
        name: shop.name,
        baseUrl: shop.baseUrl,
        logoUrl: null,
        affiliateParamKey: 'utm_source',
        updatedAt: nowIso,
      });
      summary.shopsCreated += 1;
      shopCache.set(shop.slug, created);
      return created;
    }

    if (shop.baseUrl && shop.baseUrl !== existing.baseUrl && existing.baseUrl === 'https://velodruh.ua') {
      await tx.updateShop(existing.id, {
        baseUrl: shop.baseUrl,
        updatedAt: nowIso,
      });
      summary.shopsUpdated += 1;
    }

    shopCache.set(shop.slug, existing);
    return existing;
  }

  for (const bike of bikes) {
    await store.runInTransaction(async (tx) => {
      const brandRow = await upsertBrand(tx, bike.brand);
      let existingBike = await tx.findBikeBySlug(bike.slug);
      if (!existingBike) {
        existingBike = await tx.findBikeByNameAndYear(brandRow.id, bike.name, bike.modelYear);
      }

      let bikeId: number;
      if (!existingBike) {
        const createdBike = await tx.createBike({
          slug: bike.slug,
          name: bike.name,
          brandId: brandRow.id,
          category: bike.category,
          modelYear: bike.modelYear,
          description: bike.description,
          gender: bike.gender,
          brakeType: bike.brakeType,
          drivetrain: bike.drivetrain,
          wheelSize: bike.wheelSize,
          weightKg: bike.weightKg,
          frameMaterial: bike.frameMaterial,
          ridingPosition: bike.ridingPosition,
          hasRackMounts: bike.hasRackMounts,
          hasFenderMounts: bike.hasFenderMounts,
          suspensionFork: bike.suspensionFork,
          asphaltScore: bike.surfaceProfile.asphaltScore,
          gravelScore: bike.surfaceProfile.gravelScore,
          offroadScore: bike.surfaceProfile.offroadScore,
          imageUrl: bike.imageUrl,
          keyHighlights: bike.keyHighlights,
          updatedAt: nowIso,
        });
        bikeId = createdBike.id;
        summary.bikesCreated += 1;
      } else {
        // Enrich existing bike only when incoming record carries richer metadata
        const mergedDescription =
          bike.description &&
          (!existingBike.description || bike.description.length > existingBike.description.length)
            ? bike.description
            : existingBike.description;
        const mergedDrivetrain =
          existingBike.drivetrain === 'Не вказано' && bike.drivetrain !== 'Не вказано'
            ? bike.drivetrain
            : existingBike.drivetrain;
        const mergedHighlights = [...new Set([...existingBike.keyHighlights, ...bike.keyHighlights])].slice(
          0,
          6,
        );

        await tx.updateBike(existingBike.id, {
          category: bike.category,
          description: mergedDescription,
          drivetrain: mergedDrivetrain,
          weightKg: existingBike.weightKg ?? bike.weightKg,
          imageUrl: existingBike.imageUrl ?? bike.imageUrl,
          keyHighlights: mergedHighlights,
          updatedAt: nowIso,
        });
        bikeId = existingBike.id;
        summary.bikesUpdated += 1;
      }

      for (const variant of bike.variants) {
        const existingVariant = await tx.findVariant(bikeId, variant.sizeLabel);
        let variantId: number;

        if (!existingVariant) {
          const createdVariant = await tx.createVariant({
            bikeId,
            sizeLabel: variant.sizeLabel,
            numericSizeCm: variant.numericSizeCm,
            minRiderHeightCm: variant.minRiderHeightCm,
            maxRiderHeightCm: variant.maxRiderHeightCm,
            minInseamCm: variant.minInseamCm,
            maxInseamCm: variant.maxInseamCm,
            stackMm: variant.stackMm,
            reachMm: variant.reachMm,
            updatedAt: nowIso,
          });
          variantId = createdVariant.id;
          summary.variantsCreated += 1;
        } else {
          await tx.updateVariant(existingVariant.id, {
            numericSizeCm: existingVariant.numericSizeCm ?? variant.numericSizeCm,
            minRiderHeightCm: variant.minRiderHeightCm,
            maxRiderHeightCm: variant.maxRiderHeightCm,
            minInseamCm: existingVariant.minInseamCm ?? variant.minInseamCm,
            maxInseamCm: existingVariant.maxInseamCm ?? variant.maxInseamCm,
            stackMm: existingVariant.stackMm ?? variant.stackMm,
            reachMm: existingVariant.reachMm ?? variant.reachMm,
            updatedAt: nowIso,
          });
          variantId = existingVariant.id;
          summary.variantsUpdated += 1;
        }

        for (const offer of variant.offers) {
          const shopRow = await upsertShop(tx, {
            slug: offer.shopSlug,
            name: offer.shopName,
            baseUrl: offer.shopBaseUrl,
          });

          const existingOffer = await tx.findOffer(variantId, shopRow.id, offer.productUrl);
          if (!existingOffer) {
            await tx.createOffer({
              bikeVariantId: variantId,
              shopId: shopRow.id,
              priceUah: offer.priceUah,
              oldPriceUah: offer.oldPriceUah,
              inStock: offer.inStock,
              productUrl: offer.productUrl,
              affiliateUrl: offer.affiliateUrl,
              lastCheckedAt: offer.lastCheckedAt,
              updatedAt: nowIso,
            });
            summary.offersCreated += 1;
          } else {
            await tx.updateOffer(existingOffer.id, {
              priceUah: offer.priceUah,
              oldPriceUah: offer.oldPriceUah,
              inStock: offer.inStock,
              affiliateUrl: offer.affiliateUrl,
              lastCheckedAt: offer.lastCheckedAt,
              updatedAt: nowIso,
            });
            summary.offersUpdated += 1;
          }
        }
      }
    });
  }

  return summary;
}

/** Converts curated `BikeDetailDto[]` (`CATALOG_BIKES`) into `CanonicalBikeRecord[]` for seeding Postgres. */
export function bikeDetailDtosToCanonical(dtos: BikeDetailDto[]): CanonicalBikeRecord[] {
  return dtos.map((dto) => {
    const modelName = dto.name.startsWith(dto.brand.name)
      ? dto.name.slice(dto.brand.name.length).trim()
      : dto.name;
    const brandSlug = slugify(dto.brand.slug || dto.brand.name);
    const modelSlug = slugify(modelName);
    return {
      dedupKey: `${brandSlug}::${modelSlug}::${dto.modelYear}`,
      slug: dto.slug,
      name: dto.name,
      modelName,
      modelYear: dto.modelYear,
      brand: {
        slug: dto.brand.slug,
        name: dto.brand.name,
        logoUrl: dto.brand.logoUrl,
        country: dto.brand.country,
      },
      category: dto.category,
      gender: dto.gender,
      description: dto.description,
      brakeType: dto.specs.brakeType,
      drivetrain: dto.specs.drivetrain,
      wheelSize: dto.specs.wheelSize,
      weightKg: dto.specs.weightKg,
      frameMaterial: dto.specs.frameMaterial,
      ridingPosition: dto.specs.ridingPosition,
      hasRackMounts: dto.specs.hasRackMounts,
      hasFenderMounts: dto.specs.hasFenderMounts,
      suspensionFork: dto.specs.suspensionFork,
      surfaceProfile: { ...dto.surfaceProfile },
      imageUrl: dto.imageUrl,
      keyHighlights: [...dto.keyHighlights],
      bestPriceUah: dto.bestPriceUah,
      sources: ['seed'],
      mergedListingsCount: dto.variants.reduce((acc, v) => acc + v.offers.length, 0),
      variants: dto.variants.map((v) => ({
        sizeLabel: v.sizeLabel,
        numericSizeCm: v.numericSizeCm,
        minRiderHeightCm: v.minRiderHeightCm,
        maxRiderHeightCm: v.maxRiderHeightCm,
        minInseamCm: v.minInseamCm,
        maxInseamCm: v.maxInseamCm,
        stackMm: v.stackMm,
        reachMm: v.reachMm,
        confidence: 'EXACT',
        offers: v.offers.map((o) => {
          let shopBaseUrl = 'https://velodruh.ua';
          try {
            shopBaseUrl = new URL(o.productUrl).origin;
          } catch {
            // keep default
          }
          return {
            shopSlug: o.shopSlug,
            shopName: o.shopName,
            shopBaseUrl,
            source: 'seed',
            externalId: `${dto.slug}:${v.sizeLabel}:${o.shopSlug}`,
            priceUah: o.priceUah,
            oldPriceUah: o.oldPriceUah,
            inStock: o.inStock,
            condition: 'NEW',
            city: null,
            productUrl: o.productUrl,
            affiliateUrl: o.affiliateUrl,
            lastCheckedAt: o.lastCheckedAt,
          };
        }),
      })),
    };
  });
}
