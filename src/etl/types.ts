import type {
  BikeCategoryType,
  BrakeType,
  FrameMaterialType,
  FrameSizeLabelType,
  RiderGenderType,
  RidingPositionType,
} from '../schemas/wizard.schema.js';

export type EtlSourceKind =
  | 'xml_feed'
  | 'olx'
  | 'prom'
  | 'rozetka'
  | 'hotline'
  | 'seed';

export type OfferCondition = 'NEW' | 'USED' | 'REFURBISHED' | 'UNKNOWN';

export type SizeConfidence = 'EXACT' | 'ESTIMATED' | 'FALLBACK';

/**
 * Unified intermediate representation produced by every extractor
 * (XML/YML feed parser, ReefAPI OLX/Prom/Rozetka/Hotline adapters, snapshots).
 */
export interface RawListing {
  source: EtlSourceKind;
  externalId: string;
  shopSlug: string;
  shopName: string;
  shopBaseUrl: string;
  title: string;
  brand?: string | null;
  model?: string | null;
  categoryRaw?: string | null;
  price?: number | string | null;
  oldPrice?: number | string | null;
  currency?: string | null;
  inStock?: boolean | null;
  condition?: string | null;
  city?: string | null;
  productUrl: string;
  imageUrl?: string | null;
  description?: string | null;
  modelYear?: number | string | null;
  sizeRaw?: string | null;
  attributes?: Record<string, string>;
  collectedAt?: string;
}

export interface NormalizedBrand {
  slug: string;
  name: string;
  country: string | null;
  logoUrl: string | null;
  detectedFromTitle: boolean;
}

export interface NormalizedFrameSize {
  sizeLabel: FrameSizeLabelType;
  numericSizeCm: number;
  minRiderHeightCm: number;
  maxRiderHeightCm: number;
  minInseamCm: number;
  maxInseamCm: number;
  rawInput: string | null;
  confidence: SizeConfidence;
}

export interface NormalizedSurfaceProfile {
  asphaltScore: number;
  gravelScore: number;
  offroadScore: number;
}

export interface NormalizedListing {
  source: EtlSourceKind;
  externalId: string;
  /** Canonical deduplication key: `<brandSlug>::<modelSlug>::<modelYear>` */
  dedupKey: string;
  /** Canonical URL-safe slug matching `^[a-z0-9-]+$`: `<brandSlug>-<modelSlug>-<modelYear>` */
  bikeSlug: string;
  brand: NormalizedBrand;
  /** Clean display name (`<Brand> <Model>`) without noise like size/color/year */
  bikeName: string;
  /** Clean model name without brand/year/size noise */
  modelName: string;
  modelSlug: string;
  modelYear: number;
  yearDetected: boolean;
  category: BikeCategoryType;
  categoryConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
  gender: RiderGenderType;
  brakeType: BrakeType;
  brakeTypeDetected: boolean;
  drivetrain: string;
  drivetrainDetected: boolean;
  wheelSize: string;
  wheelSizeDetected: boolean;
  weightKg: number | null;
  frameMaterial: FrameMaterialType;
  frameMaterialDetected: boolean;
  ridingPosition: RidingPositionType;
  hasRackMounts: boolean;
  hasFenderMounts: boolean;
  suspensionFork: boolean;
  surfaceProfile: NormalizedSurfaceProfile;
  description: string | null;
  imageUrl: string | null;
  keyHighlights: string[];
  size: NormalizedFrameSize;
  shop: {
    slug: string;
    name: string;
    baseUrl: string;
  };
  offer: {
    externalId: string;
    source: EtlSourceKind;
    priceUah: number;
    oldPriceUah: number | null;
    inStock: boolean;
    condition: OfferCondition;
    city: string | null;
    productUrl: string;
    affiliateUrl: string;
    lastCheckedAt: string;
    rawTitle: string;
  };
}

export type RejectedListingReason =
  | 'ACCESSORY_OR_PART'
  | 'INVALID_PRICE'
  | 'MISSING_URL'
  | 'MISSING_TITLE'
  | 'PRICE_OUT_OF_RANGE';

export interface RejectedListing {
  source: EtlSourceKind;
  externalId: string;
  title: string;
  reason: RejectedListingReason;
  detail: string;
}

export interface CanonicalOfferRecord {
  shopSlug: string;
  shopName: string;
  shopBaseUrl: string;
  source: EtlSourceKind;
  externalId: string;
  priceUah: number;
  oldPriceUah: number | null;
  inStock: boolean;
  condition: OfferCondition;
  city: string | null;
  productUrl: string;
  affiliateUrl: string;
  lastCheckedAt: string;
}

export interface CanonicalVariantRecord {
  sizeLabel: FrameSizeLabelType;
  numericSizeCm: number;
  minRiderHeightCm: number;
  maxRiderHeightCm: number;
  minInseamCm: number;
  maxInseamCm: number;
  stackMm: number | null;
  reachMm: number | null;
  confidence: SizeConfidence;
  offers: CanonicalOfferRecord[];
}

export interface CanonicalBikeRecord {
  dedupKey: string;
  slug: string;
  name: string;
  modelName: string;
  modelYear: number;
  brand: {
    slug: string;
    name: string;
    logoUrl: string | null;
    country: string | null;
  };
  category: BikeCategoryType;
  gender: RiderGenderType;
  description: string | null;
  brakeType: BrakeType;
  drivetrain: string;
  wheelSize: string;
  weightKg: number | null;
  frameMaterial: FrameMaterialType;
  ridingPosition: RidingPositionType;
  hasRackMounts: boolean;
  hasFenderMounts: boolean;
  suspensionFork: boolean;
  surfaceProfile: NormalizedSurfaceProfile;
  imageUrl: string | null;
  keyHighlights: string[];
  bestPriceUah: number;
  sources: EtlSourceKind[];
  mergedListingsCount: number;
  variants: CanonicalVariantRecord[];
}

export interface DeduplicationStats {
  inputListings: number;
  uniqueBikes: number;
  mergedBikeDuplicates: number;
  uniqueVariants: number;
  uniqueOffers: number;
  deduplicatedOffers: number;
  crossSourceMatches: number;
}

export interface DeduplicationResult {
  bikes: CanonicalBikeRecord[];
  stats: DeduplicationStats;
}

export interface NormalizationOptions {
  /** Fallback year when listing does not contain a model year (defaults to current year). */
  defaultYear?: number;
  /** Minimum realistic bicycle price in UAH (filters out parts/accessories noise). */
  minPriceUah?: number;
  /** Maximum realistic bicycle price in UAH. */
  maxPriceUah?: number;
  /** Exchange rates used to convert foreign currency prices to UAH. */
  currencyRatesToUah?: Record<string, number>;
  /** Filter out accessory/spare-part listings based on title heuristics. Default: true. */
  filterAccessories?: boolean;
  /** Override collectedAt fallback timestamp for deterministic tests. */
  nowIso?: string;
}

export interface PersistenceSummary {
  brandsCreated: number;
  brandsUpdated: number;
  shopsCreated: number;
  shopsUpdated: number;
  bikesCreated: number;
  bikesUpdated: number;
  variantsCreated: number;
  variantsUpdated: number;
  offersCreated: number;
  offersUpdated: number;
}
