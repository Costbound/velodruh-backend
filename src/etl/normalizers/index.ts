import type {
  NormalizationOptions,
  NormalizedListing,
  RawListing,
  RejectedListing,
} from '../types.js';
import { normalizeBrand } from './brand.normalizer.js';
import { normalizeCategory } from './category.normalizer.js';
import { normalizeFrameSize } from './size.normalizer.js';
import {
  cleanModelName,
  detectMountsAndFork,
  extractModelYear,
  isAccessoryOrNonBike,
  normalizeBrakeType,
  normalizeCondition,
  normalizeDrivetrain,
  normalizeFrameMaterial,
  normalizeGender,
  normalizeWeightKg,
  normalizeWheelSize,
} from './specs.normalizer.js';
import {
  buildAffiliateUrl,
  cleanText,
  DEFAULT_CURRENCY_RATES_TO_UAH,
  normalizeProductUrl,
  parsePriceToUah,
  slugify,
} from './text.utils.js';

export type NormalizationOutcome =
  | { ok: true; value: NormalizedListing }
  | { ok: false; rejected: RejectedListing };

const DEFAULT_MIN_PRICE_UAH = 2_000;
const DEFAULT_MAX_PRICE_UAH = 600_000;

function pickAttribute(
  attrs: Record<string, string> | undefined,
  keyPattern: RegExp,
): string | undefined {
  if (!attrs) return undefined;
  for (const [k, v] of Object.entries(attrs)) {
    if (keyPattern.test(k) && v.trim()) {
      return v.trim();
    }
  }
  return undefined;
}

/**
 * Normalizes a single `RawListing` into a canonical `NormalizedListing`
 * ready for deduplication by `Brand + Model + ModelYear` (`dedupKey`).
 */
export function normalizeListing(
  raw: RawListing,
  options: NormalizationOptions = {},
): NormalizationOutcome {
  const defaultYear = options.defaultYear ?? new Date().getUTCFullYear();
  const minPriceUah = options.minPriceUah ?? DEFAULT_MIN_PRICE_UAH;
  const maxPriceUah = options.maxPriceUah ?? DEFAULT_MAX_PRICE_UAH;
  const filterAccessories = options.filterAccessories ?? true;
  const rates = {
    ...DEFAULT_CURRENCY_RATES_TO_UAH,
    ...(options.currencyRatesToUah ?? {}),
  };

  const title = cleanText(raw.title);
  if (!title) {
    return {
      ok: false,
      rejected: {
        source: raw.source,
        externalId: raw.externalId,
        title: raw.title,
        reason: 'MISSING_TITLE',
        detail: 'Listing title is empty after cleaning',
      },
    };
  }

  const normalizedUrl = normalizeProductUrl(raw.productUrl);
  if (!normalizedUrl) {
    return {
      ok: false,
      rejected: {
        source: raw.source,
        externalId: raw.externalId,
        title,
        reason: 'MISSING_URL',
        detail: 'Listing productUrl is empty',
      },
    };
  }

  if (filterAccessories && isAccessoryOrNonBike(title, raw.categoryRaw)) {
    return {
      ok: false,
      rejected: {
        source: raw.source,
        externalId: raw.externalId,
        title,
        reason: 'ACCESSORY_OR_PART',
        detail: 'Filtered as accessory, spare part, or non-bicycle item',
      },
    };
  }

  const priceUah = parsePriceToUah(raw.price, raw.currency, rates);
  if (priceUah === null) {
    return {
      ok: false,
      rejected: {
        source: raw.source,
        externalId: raw.externalId,
        title,
        reason: 'INVALID_PRICE',
        detail: `Could not parse positive price from "${String(raw.price ?? '')}"`,
      },
    };
  }

  if (priceUah < minPriceUah || priceUah > maxPriceUah) {
    return {
      ok: false,
      rejected: {
        source: raw.source,
        externalId: raw.externalId,
        title,
        reason: 'PRICE_OUT_OF_RANGE',
        detail: `Price ${priceUah} UAH outside [${minPriceUah}, ${maxPriceUah}]`,
      },
    };
  }

  const parsedOldPrice = parsePriceToUah(raw.oldPrice, raw.currency, rates);
  const oldPriceUah = parsedOldPrice !== null && parsedOldPrice > priceUah ? parsedOldPrice : null;

  const attrs = raw.attributes ?? {};
  const attrsCombined = Object.entries(attrs)
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');
  const description = cleanText(raw.description) || null;

  // Brand
  const rawBrandFromAttr = pickAttribute(attrs, /^(?:бренд|brand|виробник|производитель|vendor|марка)$/i);
  const brand = normalizeBrand(raw.brand ?? rawBrandFromAttr, title);

  // Category
  const rawCatFromAttr = pickAttribute(attrs, /(?:тип\s+велосипед|категорі|категори|вид|type|category)/i);
  const categoryResult = normalizeCategory({
    rawCategory: raw.categoryRaw ?? rawCatFromAttr,
    title,
    description,
    attributesText: attrsCombined,
  });

  // Model Year
  const yearInfo = extractModelYear({
    explicitYear: raw.modelYear,
    attributes: attrs,
    title,
    productUrl: normalizedUrl,
    defaultYear,
  });

  // Model Name & Canonical Key (Brand + Model + Year)
  const cleanedModel = cleanModelName({
    rawModel: raw.model,
    title,
    brandName: brand.name,
    brandSlug: brand.slug,
    modelYear: yearInfo.year,
  });

  const dedupKey = buildDedupKey(brand.slug, cleanedModel.modelSlug, yearInfo.year);
  const bikeSlug = buildBikeSlug(brand.slug, cleanedModel.modelSlug, yearInfo.year);

  // Frame size
  const rawSizeFromAttr = pickAttribute(
    attrs,
    /(?:розмір\s*рами|размер\s*рамы|розмір|размер|ростовка|рама|frame\s*size|size)/i,
  );
  const size = normalizeFrameSize({
    rawSize: raw.sizeRaw ?? rawSizeFromAttr,
    category: categoryResult.category,
    title,
    description,
  });

  // Technical specs
  const fullSpecsText = `${title} ${attrsCombined} ${description ?? ''}`;
  const brakeAttr = pickAttribute(attrs, /(?:гальм|тормоз|brake)/i);
  const brake = normalizeBrakeType(brakeAttr ? `${brakeAttr} ${fullSpecsText}` : fullSpecsText);

  const materialAttr = pickAttribute(attrs, /(?:матеріал\s*рами|материал\s*рамы|frame\s*material|матеріал)/i);
  const frameMaterial = normalizeFrameMaterial(
    materialAttr ? `${materialAttr} ${fullSpecsText}` : fullSpecsText,
  );

  const wheelAttr = pickAttribute(attrs, /(?:діаметр\s*кол|диаметр\s*кол|розмір\s*кол|wheel)/i);
  const wheelSize = normalizeWheelSize(wheelAttr ?? fullSpecsText, categoryResult.category);

  const weightAttr = pickAttribute(attrs, /(?:вага|вес|weight)/i);
  const weightKg = normalizeWeightKg(weightAttr ?? fullSpecsText);

  const drivetrainAttr = pickAttribute(
    attrs,
    /(?:трансміс|трансмис|перемикач|переключат|групсет|drivetrain|groupset|швидкост|скорост)/i,
  );
  const drivetrain = normalizeDrivetrain(drivetrainAttr, fullSpecsText);

  const genderAttr = pickAttribute(attrs, /(?:стать|пол|gender|для\s+кого)/i);
  const gender = normalizeGender(genderAttr ? `${genderAttr} ${title}` : title);

  const { hasRackMounts, hasFenderMounts, suspensionFork } = detectMountsAndFork(
    fullSpecsText,
    categoryResult.category,
    categoryResult.defaultSuspensionFork,
  );

  const condition = normalizeCondition(raw.condition, raw.source, title);
  const city = cleanText(raw.city) || null;
  const shopSlug = slugify(raw.shopSlug || raw.shopName, 'shop');
  const shopName = cleanText(raw.shopName) || shopSlug;
  const collectedAt = raw.collectedAt ?? options.nowIso ?? new Date().toISOString();

  // Build concise highlights from detected specs
  const keyHighlights: string[] = [];
  if (drivetrain.detected) {
    keyHighlights.push(`Трансмісія: ${drivetrain.value}`);
  }
  if (brake.detected) {
    const brakeLabel =
      brake.value === 'HYDRAULIC_DISC'
        ? 'Гідравлічні дискові гальма'
        : brake.value === 'MECHANICAL_DISC'
          ? 'Механічні дискові гальма'
          : 'Обідні гальма (Rim / V-Brake)';
    keyHighlights.push(brakeLabel);
  }
  if (frameMaterial.detected) {
    const matLabel =
      frameMaterial.value === 'CARBON'
        ? 'Карбонова рама'
        : frameMaterial.value === 'STEEL'
          ? 'Сталева / Cr-Mo рама'
          : 'Алюмінієва рама';
    keyHighlights.push(matLabel);
  }
  if (wheelSize.detected) {
    keyHighlights.push(`Колеса ${wheelSize.value}`);
  }

  return {
    ok: true,
    value: {
      source: raw.source,
      externalId: raw.externalId,
      dedupKey,
      bikeSlug,
      brand,
      bikeName: cleanedModel.displayName,
      modelName: cleanedModel.modelName,
      modelSlug: cleanedModel.modelSlug,
      modelYear: yearInfo.year,
      yearDetected: yearInfo.detected,
      category: categoryResult.category,
      categoryConfidence: categoryResult.confidence,
      gender,
      brakeType: brake.value,
      brakeTypeDetected: brake.detected,
      drivetrain: drivetrain.value,
      drivetrainDetected: drivetrain.detected,
      wheelSize: wheelSize.value,
      wheelSizeDetected: wheelSize.detected,
      weightKg,
      frameMaterial: frameMaterial.value,
      frameMaterialDetected: frameMaterial.detected,
      ridingPosition: categoryResult.defaultRidingPosition,
      hasRackMounts,
      hasFenderMounts,
      suspensionFork,
      surfaceProfile: categoryResult.defaultSurfaceProfile,
      description,
      imageUrl: raw.imageUrl?.trim() ? raw.imageUrl.trim() : null,
      keyHighlights,
      size,
      shop: {
        slug: shopSlug,
        name: shopName,
        baseUrl: raw.shopBaseUrl.trim() || 'https://velodruh.ua',
      },
      offer: {
        externalId: raw.externalId,
        source: raw.source,
        priceUah,
        oldPriceUah,
        inStock: raw.inStock ?? true,
        condition,
        city,
        productUrl: normalizedUrl,
        affiliateUrl: buildAffiliateUrl(
          normalizedUrl,
          shopSlug,
          bikeSlug,
          size.sizeLabel,
          raw.source,
        ),
        lastCheckedAt: collectedAt,
        rawTitle: title,
      },
    },
  };
}

/**
 * Normalizes a batch of raw listings, collecting valid normalized entries and rejected entries separately.
 */
export function normalizeListings(
  rawItems: RawListing[],
  options: NormalizationOptions = {},
): { normalized: NormalizedListing[]; rejected: RejectedListing[] } {
  const normalized: NormalizedListing[] = [];
  const rejected: RejectedListing[] = [];

  for (const item of rawItems) {
    const outcome = normalizeListing(item, options);
    if (outcome.ok) {
      normalized.push(outcome.value);
    } else {
      rejected.push(outcome.rejected);
    }
  }

  return { normalized, rejected };
}

/** Canonical deduplication key: «Brand + Model + Year». */
export function buildDedupKey(brandSlug: string, modelSlug: string, modelYear: number): string {
  const b = slugify(brandSlug, 'unknown');
  const m = slugify(modelSlug, 'model');
  return `${b}::${m}::${modelYear}`;
}

/** Builds a URL-safe bike slug (`^[a-z0-9-]+$`) from normalized brand, model, and year. */
export function buildBikeSlug(brandSlug: string, modelSlug: string, modelYear: number): string {
  const b = slugify(brandSlug, 'unknown');
  const m = slugify(modelSlug, 'model');
  const raw = b === 'unknown' ? `${m}-${modelYear}` : `${b}-${m}-${modelYear}`;
  return raw.replace(/-{2,}/g, '-').slice(0, 96).replace(/-+$/, '');
}

export { normalizeBrand } from './brand.normalizer.js';
export { normalizeCategory, getDefaultSurfaceProfile } from './category.normalizer.js';
export { normalizeFrameSize } from './size.normalizer.js';
export {
  cleanModelName,
  extractModelYear,
  isAccessoryOrNonBike,
  normalizeBrakeType,
  normalizeCondition,
  normalizeDrivetrain,
  normalizeFrameMaterial,
  normalizeGender,
  normalizeWeightKg,
  normalizeWheelSize,
} from './specs.normalizer.js';
export {
  buildAffiliateUrl,
  cleanText,
  decodeXmlEntities,
  normalizeProductUrl,
  parsePriceToUah,
  slugify,
  transliterateCyrillic,
} from './text.utils.js';
