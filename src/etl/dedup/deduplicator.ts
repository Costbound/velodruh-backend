import type { FrameSizeLabelType } from '../../schemas/wizard.schema.js';
import type {
  CanonicalBikeRecord,
  CanonicalOfferRecord,
  CanonicalVariantRecord,
  DeduplicationResult,
  EtlSourceKind,
  NormalizedListing,
  SizeConfidence,
} from '../types.js';
import { normalizeProductUrl } from '../normalizers/text.utils.js';

/**
 * Trust hierarchy used when merging duplicate bike-level metadata from multiple sources.
 * Higher weight means structured B2C metadata wins over unstructured classified ad text.
 */
const SOURCE_PRIORITY: Record<EtlSourceKind, number> = {
  seed: 60,
  xml_feed: 50,
  rozetka: 40,
  hotline: 35,
  prom: 30,
  olx: 10,
};

const SIZE_ORDER: Record<FrameSizeLabelType, number> = {
  XS: 0,
  S: 1,
  M: 2,
  L: 3,
  XL: 4,
};

const CATEGORY_CONFIDENCE_RANK = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
} as const;

const SIZE_CONFIDENCE_RANK: Record<SizeConfidence, number> = {
  EXACT: 3,
  ESTIMATED: 2,
  FALLBACK: 1,
};

const CONDITION_RANK = {
  NEW: 3,
  REFURBISHED: 2,
  USED: 1,
  UNKNOWN: 0,
} as const;

function scoreListingRichness(item: NormalizedListing): number {
  let score = SOURCE_PRIORITY[item.source];
  if (item.categoryConfidence === 'HIGH') score += 15;
  else if (item.categoryConfidence === 'MEDIUM') score += 8;
  if (item.yearDetected) score += 10;
  if (!item.brand.detectedFromTitle) score += 8;
  if (item.drivetrainDetected) score += 8;
  if (item.brakeTypeDetected) score += 6;
  if (item.frameMaterialDetected) score += 6;
  if (item.wheelSizeDetected) score += 4;
  if (item.weightKg !== null) score += 6;
  if (item.imageUrl) score += 4;
  if (item.description && item.description.length > 40) score += 5;
  return score;
}

function buildOfferKey(offer: CanonicalOfferRecord): string {
  const cleanUrl = normalizeProductUrl(offer.productUrl).toLowerCase();
  return `${offer.shopSlug}::${cleanUrl}`;
}

function pickPreferredOffer(
  current: CanonicalOfferRecord,
  incoming: CanonicalOfferRecord,
): CanonicalOfferRecord {
  const currentTs = Date.parse(current.lastCheckedAt);
  const incomingTs = Date.parse(incoming.lastCheckedAt);

  if (Number.isFinite(incomingTs) && Number.isFinite(currentTs) && incomingTs !== currentTs) {
    return incomingTs > currentTs
      ? {
          ...incoming,
          city: incoming.city ?? current.city,
          oldPriceUah: incoming.oldPriceUah ?? current.oldPriceUah,
        }
      : current;
  }

  // Tie-breaker: prefer higher-priority source, in-stock, or non-null oldPrice/city
  const incomingPri = SOURCE_PRIORITY[incoming.source];
  const currentPri = SOURCE_PRIORITY[current.source];
  if (incomingPri !== currentPri) {
    return incomingPri > currentPri ? incoming : current;
  }
  if (incoming.inStock !== current.inStock) {
    return incoming.inStock ? incoming : current;
  }
  if (CONDITION_RANK[incoming.condition] !== CONDITION_RANK[current.condition]) {
    return CONDITION_RANK[incoming.condition] > CONDITION_RANK[current.condition]
      ? incoming
      : current;
  }
  return incoming.priceUah < current.priceUah ? incoming : current;
}

/**
 * Deduplicates and merges normalized listings using the canonical key
 * `Brand + Model + Year` (`dedupKey` = `<brandSlug>::<modelSlug>::<modelYear>`).
 *
 * Within each canonical bike group:
 * - Selects highest-confidence bike specifications across sources (preferring structured feeds).
 * - Aggregates distinct frame sizes (`XS | S | M | L | XL`) into `variants`.
 * - Deduplicates identical offers by `(shopSlug, normalizedUrl)` inside each variant.
 * - Computes `bestPriceUah` across in-stock offers (falling back to all offers if none in stock).
 */
export function deduplicateListings(listings: NormalizedListing[]): DeduplicationResult {
  const bikeGroups = new Map<string, NormalizedListing[]>();

  for (const item of listings) {
    const existing = bikeGroups.get(item.dedupKey);
    if (existing) {
      existing.push(item);
    } else {
      bikeGroups.set(item.dedupKey, [item]);
    }
  }

  const bikes: CanonicalBikeRecord[] = [];
  let totalUniqueVariants = 0;
  let totalUniqueOffers = 0;
  let deduplicatedOffers = 0;
  let crossSourceMatches = 0;

  for (const [dedupKey, group] of bikeGroups.entries()) {
    // Sort candidate records richest-first so the primary exemplar establishes canonical metadata
    const sorted = [...group].sort((a, b) => scoreListingRichness(b) - scoreListingRichness(a));
    const primary = sorted[0]!;

    // Pick best category across group (highest confidence, weighted by source priority)
    const bestCategoryItem = [...sorted].sort((a, b) => {
      const confDiff =
        CATEGORY_CONFIDENCE_RANK[b.categoryConfidence] -
        CATEGORY_CONFIDENCE_RANK[a.categoryConfidence];
      if (confDiff !== 0) return confDiff;
      return SOURCE_PRIORITY[b.source] - SOURCE_PRIORITY[a.source];
    })[0]!;

    // Pick richest spec fields where any member in the group detected a real value
    const brakeOwner = sorted.find((item) => item.brakeTypeDetected) ?? primary;
    const drivetrainOwner = sorted.find((item) => item.drivetrainDetected) ?? primary;
    const materialOwner = sorted.find((item) => item.frameMaterialDetected) ?? primary;
    const wheelOwner = sorted.find((item) => item.wheelSizeDetected) ?? primary;
    const weightOwner = sorted.find((item) => item.weightKg !== null);
    const imageOwner = sorted.find((item) => item.imageUrl !== null);
    const descriptionOwner = [...sorted]
      .filter((item) => item.description !== null)
      .sort((a, b) => (b.description?.length ?? 0) - (a.description?.length ?? 0))[0];
    const genderOwner = sorted.find((item) => item.gender !== 'UNISEX') ?? primary;

    const highlightSet = new Set<string>();
    for (const item of sorted) {
      for (const h of item.keyHighlights) {
        if (highlightSet.size < 6) {
          highlightSet.add(h);
        }
      }
    }

    const uniqueSources = [...new Set(group.map((item) => item.source))];
    if (uniqueSources.length > 1) {
      crossSourceMatches += 1;
    }

    // Group variants by normalized frame size label (`XS | S | M | L | XL`)
    const variantMap = new Map<
      FrameSizeLabelType,
      {
        size: NormalizedListing['size'];
        offersByKey: Map<string, CanonicalOfferRecord>;
      }
    >();

    for (const item of group) {
      const incomingOffer: CanonicalOfferRecord = {
        shopSlug: item.shop.slug,
        shopName: item.shop.name,
        shopBaseUrl: item.shop.baseUrl,
        source: item.offer.source,
        externalId: item.offer.externalId,
        priceUah: item.offer.priceUah,
        oldPriceUah: item.offer.oldPriceUah,
        inStock: item.offer.inStock,
        condition: item.offer.condition,
        city: item.offer.city,
        productUrl: item.offer.productUrl,
        affiliateUrl: item.offer.affiliateUrl,
        lastCheckedAt: item.offer.lastCheckedAt,
      };

      const existingVariant = variantMap.get(item.size.sizeLabel);
      if (!existingVariant) {
        const offersByKey = new Map<string, CanonicalOfferRecord>();
        offersByKey.set(buildOfferKey(incomingOffer), incomingOffer);
        variantMap.set(item.size.sizeLabel, {
          size: item.size,
          offersByKey,
        });
      } else {
        if (
          SIZE_CONFIDENCE_RANK[item.size.confidence] >
          SIZE_CONFIDENCE_RANK[existingVariant.size.confidence]
        ) {
          existingVariant.size = item.size;
        }
        const key = buildOfferKey(incomingOffer);
        const existingOffer = existingVariant.offersByKey.get(key);
        if (existingOffer) {
          deduplicatedOffers += 1;
          existingVariant.offersByKey.set(key, pickPreferredOffer(existingOffer, incomingOffer));
        } else {
          existingVariant.offersByKey.set(key, incomingOffer);
        }
      }
    }

    const variants: CanonicalVariantRecord[] = [...variantMap.entries()]
      .sort(([a], [b]) => SIZE_ORDER[a] - SIZE_ORDER[b])
      .map(([sizeLabel, bucket]) => {
        const offers = [...bucket.offersByKey.values()].sort(
          (a, b) => Number(b.inStock) - Number(a.inStock) || a.priceUah - b.priceUah,
        );
        return {
          sizeLabel,
          numericSizeCm: bucket.size.numericSizeCm,
          minRiderHeightCm: bucket.size.minRiderHeightCm,
          maxRiderHeightCm: bucket.size.maxRiderHeightCm,
          minInseamCm: bucket.size.minInseamCm,
          maxInseamCm: bucket.size.maxInseamCm,
          stackMm: null,
          reachMm: null,
          confidence: bucket.size.confidence,
          offers,
        };
      });

    const allOffers = variants.flatMap((v) => v.offers);
    const inStockOffers = allOffers.filter((o) => o.inStock);
    const pricePool = inStockOffers.length > 0 ? inStockOffers : allOffers;
    const bestPriceUah = Math.min(...pricePool.map((o) => o.priceUah));

    totalUniqueVariants += variants.length;
    totalUniqueOffers += allOffers.length;

    bikes.push({
      dedupKey,
      slug: primary.bikeSlug,
      name: primary.bikeName,
      modelName: primary.modelName,
      modelYear: primary.modelYear,
      brand: {
        slug: primary.brand.slug,
        name: primary.brand.name,
        logoUrl: primary.brand.logoUrl,
        country: primary.brand.country,
      },
      category: bestCategoryItem.category,
      gender: genderOwner.gender,
      description: descriptionOwner?.description ?? null,
      brakeType: brakeOwner.brakeType,
      drivetrain: drivetrainOwner.drivetrain,
      wheelSize: wheelOwner.wheelSize,
      weightKg: weightOwner?.weightKg ?? null,
      frameMaterial: materialOwner.frameMaterial,
      ridingPosition: bestCategoryItem.ridingPosition,
      hasRackMounts: group.some((item) => item.hasRackMounts),
      hasFenderMounts: group.some((item) => item.hasFenderMounts),
      suspensionFork:
        sorted.find((item) => item.source !== 'olx')?.suspensionFork ??
        bestCategoryItem.suspensionFork,
      surfaceProfile: bestCategoryItem.surfaceProfile,
      imageUrl: imageOwner?.imageUrl ?? null,
      keyHighlights: [...highlightSet],
      bestPriceUah,
      sources: uniqueSources,
      mergedListingsCount: group.length,
      variants,
    });
  }

  // Resolve any rare slug collision (e.g. if slice(0, 96) truncated two distinct long dedup keys identically)
  const seenSlugs = new Map<string, number>();
  for (const bike of bikes) {
    const count = seenSlugs.get(bike.slug) ?? 0;
    seenSlugs.set(bike.slug, count + 1);
    if (count > 0) {
      bike.slug = `${bike.slug}-${count + 1}`;
    }
  }

  bikes.sort((a, b) => a.bestPriceUah - b.bestPriceUah || a.slug.localeCompare(b.slug));

  return {
    bikes,
    stats: {
      inputListings: listings.length,
      uniqueBikes: bikes.length,
      mergedBikeDuplicates: Math.max(0, listings.length - bikes.length),
      uniqueVariants: totalUniqueVariants,
      uniqueOffers: totalUniqueOffers,
      deduplicatedOffers,
      crossSourceMatches,
    },
  };
}
