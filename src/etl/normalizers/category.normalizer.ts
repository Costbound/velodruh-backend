import type { BikeCategoryType, RidingPositionType } from '../../schemas/wizard.schema.js';
import type { NormalizedSurfaceProfile } from '../types.js';
import { cleanText } from './text.utils.js';

export interface CategoryNormalizationResult {
  category: BikeCategoryType;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  defaultSurfaceProfile: NormalizedSurfaceProfile;
  defaultRidingPosition: RidingPositionType;
  defaultSuspensionFork: boolean;
}

const CATEGORY_DEFAULTS: Record<
  BikeCategoryType,
  {
    surfaceProfile: NormalizedSurfaceProfile;
    ridingPosition: RidingPositionType;
    suspensionFork: boolean;
  }
> = {
  GRAVEL: {
    surfaceProfile: { asphaltScore: 80, gravelScore: 92, offroadScore: 50 },
    ridingPosition: 'COMFORTABLE',
    suspensionFork: false,
  },
  ROAD: {
    surfaceProfile: { asphaltScore: 96, gravelScore: 30, offroadScore: 5 },
    ridingPosition: 'SPORT',
    suspensionFork: false,
  },
  MTB_HARDTAIL: {
    surfaceProfile: { asphaltScore: 45, gravelScore: 78, offroadScore: 94 },
    ridingPosition: 'COMFORTABLE',
    suspensionFork: true,
  },
  CITY_COMMUTER: {
    surfaceProfile: { asphaltScore: 92, gravelScore: 42, offroadScore: 15 },
    ridingPosition: 'UPRIGHT',
    suspensionFork: false,
  },
  TOURING: {
    surfaceProfile: { asphaltScore: 76, gravelScore: 86, offroadScore: 52 },
    ridingPosition: 'COMFORTABLE',
    suspensionFork: false,
  },
  HYBRID: {
    surfaceProfile: { asphaltScore: 78, gravelScore: 72, offroadScore: 42 },
    ridingPosition: 'COMFORTABLE',
    suspensionFork: true,
  },
};

interface CategoryRule {
  category: BikeCategoryType;
  patterns: RegExp[];
  modelHints: RegExp[];
}

const CATEGORY_RULES: CategoryRule[] = [
  // Touring precedes gravel so "Pride Rocx Tour" classifies as TOURING rather than GRAVEL
  {
    category: 'TOURING',
    patterns: [
      /турингов/i,
      /туринг/i,
      /турінг/i,
      /туристичн/i,
      /\btouring\b/i,
      /\brandoneur\b/i,
      /\brandonneur\b/i,
      /\bbikepacking\b/i,
      /байкпак/i,
      /експедиційн/i,
    ],
    modelHints: [/\brocx\s*tour\b/i, /\bdisc\s*trucker\b/i, /\bsutra\b/i, /\b520\b.*\btrek\b/i, /\bfour\s*corners\b/i],
  },
  {
    category: 'GRAVEL',
    patterns: [
      /гравій/i,
      /гравійн/i,
      /гравійник/i,
      /гравий/i,
      /гревел/i,
      /грейвел/i,
      /грэвел/i,
      /\bgravel\b/i,
      /циклокрос/i,
      /велокрос/i,
      /\bcyclocross\b/i,
      /\ball-?road\b/i,
    ],
    modelHints: [
      /\bsilex\b/i,
      /\brocx\b/i,
      /\btopstone\b/i,
      /\bdiverge\b/i,
      /\brevolt\b/i,
      /\bgrizl\b/i,
      /\bgrail\b/i,
      /\bcheckpoint\b/i,
      /\bnuroad\b/i,
      /\bsoot\b/i,
      /\bgsx\b/i,
      /\bterra\b/i,
      /\brenegade\b/i,
      /\bpath\s*x\b/i,
      /\bbend\b/i,
      /\bkanzo\b/i,
      /\baskan\b/i,
      /\bgestalt\b/i,
      /\besker\b/i,
      /\bruut\b/i,
    ],
  },
  {
    category: 'ROAD',
    patterns: [
      /шосейн/i,
      /шосейник/i,
      /шосей/i,
      /(?<![\p{L}\p{N}])шосе(?![\p{L}\p{N}])/iu,
      /шоссе/i,
      /\broad\b/i,
      /ендюранс/i,
      /\bendurance\b/i,
      /гоночн/i,
      /тріатлон/i,
      /\baero\b/i,
    ],
    modelHints: [
      /\bscultura\b/i,
      /\breacto\b/i,
      /\bdomane\b/i,
      /\bemonda\b/i,
      /\bmadone\b/i,
      /\ballez\b/i,
      /\btarmac\b/i,
      /\broubaix\b/i,
      /\bsynapse\b/i,
      /\bcaad\b/i,
      /\bsupersix\b/i,
      /\bcontend\b/i,
      /\btcr\b/i,
      /\bpropel\b/i,
      /\bdefy\b/i,
      /\bstrattos\b/i,
      /\battain\b/i,
      /\bvento\b/i,
      /\btriban\s*rc\b/i,
    ],
  },
  {
    category: 'HYBRID',
    patterns: [
      /гібрид/i,
      /гибрид/i,
      /\bhybrid\b/i,
      /кросов/i,
      /кроссов/i,
      /\bcross\b/i,
      /\bdual\s*sport\b/i,
      /\btrekking\b/i,
      /трекінгов/i,
      /треккингов/i,
    ],
    modelHints: [/\bphanatic\b/i, /\bheist\b/i, /\broam\b/i, /\bcrossway\b/i, /\bsub\s*cross\b/i, /\bverve\b/i, /\bds\b/i],
  },
  {
    category: 'CITY_COMMUTER',
    patterns: [
      /міськ/i,
      /міський/i,
      /городск/i,
      /ком['’]?ют/i,
      /\bcommuter\b/i,
      /\bcity\b/i,
      /\burban\b/i,
      /дорожн/i,
      /круїзер/i,
      /круизер/i,
      /\bcruiser\b/i,
      /прогулянков/i,
      /прогулочн/i,
      /фітнес/i,
      /фитнес/i,
      /\bfitness\b/i,
      /сіті/i,
      /складн/i,
      /складан/i,
      /\bfolding\b/i,
      /фікс/i,
      /\bfixed\b/i,
      /\bsingle\s*speed\b/i,
    ],
    modelHints: [
      /\bquick\b/i,
      /\bsirrus\b/i,
      /\bescape\b/i,
      /\bspeeder\b/i,
      /\bbad\s*boy\b/i,
      /\bpresidio\b/i,
      /\bfairfax\b/i,
      /\bcomfort\b/i,
      /\bretro\b/i,
      /\blux\b/i,
      /\bdorozhnik\b/i,
      /\bpatrol\b/i,
    ],
  },
  {
    category: 'MTB_HARDTAIL',
    patterns: [
      /\bmtb\b/i,
      /(?<![\p{L}\p{N}])мтб(?![\p{L}\p{N}])/iu,
      /(?<![\p{L}\p{N}])мтв(?![\p{L}\p{N}])/iu,
      /гірськ/i,
      /горн/i,
      /хардтейл/i,
      /\bhardtail\b/i,
      /\bmountain\b/i,
      /крос-?кантр/i,
      /кросс-?кантр/i,
      /\bcross-?country\b/i,
      /трейл/i,
      /\btrail\b/i,
      /ендуро/i,
      /\benduro\b/i,
      /двопідвіс/i,
      /двухподвес/i,
      /\bfatbike\b/i,
      /фетбайк/i,
    ],
    modelHints: [
      /\bmarlin\b/i,
      /\bx-?caliber\b/i,
      /\bprocaliber\b/i,
      /\broscoe\b/i,
      /\btalon\b/i,
      /\bbig\.?nine\b/i,
      /\bbig\.?seven\b/i,
      /\baspect\b/i,
      /\bscale\b/i,
      /\brockhopper\b/i,
      /\bchisel\b/i,
      /\bavalanche\b/i,
      /\baggressor\b/i,
      /\baim\b/i,
      /\banalog\b/i,
      /\battention\b/i,
      /\bacid\b/i,
      /\bspider\b/i,
      /\bxc-?\d+\b/i,
      /\bxtrada\b/i,
      /\bslx\b/i,
      /\bpremier\b/i,
      /\bmarvel\b/i,
      /\bviper\b/i,
      /\brebel\b/i,
      /\bsolid\b/i,
      /\bstorm\b/i,
      /\bhexagon\b/i,
      /\blevel\b/i,
      /\balma\b/i,
      /\bonna\b/i,
    ],
  },
];

const DIRECT_ENUM_MAP: Record<string, BikeCategoryType> = {
  GRAVEL: 'GRAVEL',
  ROAD: 'ROAD',
  MTB_HARDTAIL: 'MTB_HARDTAIL',
  MTB: 'MTB_HARDTAIL',
  CITY_COMMUTER: 'CITY_COMMUTER',
  CITY: 'CITY_COMMUTER',
  TOURING: 'TOURING',
  HYBRID: 'HYBRID',
};

function resultFor(
  category: BikeCategoryType,
  confidence: 'HIGH' | 'MEDIUM' | 'LOW',
): CategoryNormalizationResult {
  const defaults = CATEGORY_DEFAULTS[category];
  return {
    category,
    confidence,
    defaultSurfaceProfile: { ...defaults.surfaceProfile },
    defaultRidingPosition: defaults.ridingPosition,
    defaultSuspensionFork: defaults.suspensionFork,
  };
}

/**
 * Normalizes messy Ukrainian/Russian/English bike category strings, breadcrumbs,
 * model names, and description hints into the canonical `BikeCategoryType` enum.
 */
export function normalizeCategory(input: {
  rawCategory?: string | null;
  title?: string | null;
  description?: string | null;
  attributesText?: string | null;
}): CategoryNormalizationResult {
  const rawCategory = cleanText(input.rawCategory);
  const title = cleanText(input.title);
  const attrs = cleanText(input.attributesText);
  const description = cleanText(input.description);

  // 1. Exact enum value match
  const directEnum = DIRECT_ENUM_MAP[rawCategory.toUpperCase()];
  if (directEnum) {
    return resultFor(directEnum, 'HIGH');
  }

  // 2. Model-line override when category is ambiguous (e.g. "Pride Rocx Tour" marked as gravel/bike)
  const titleAndCat = `${rawCategory} ${title}`.trim();
  for (const rule of CATEGORY_RULES) {
    if (rule.category === 'TOURING' && rule.modelHints.some((re) => re.test(titleAndCat))) {
      return resultFor('TOURING', 'HIGH');
    }
  }

  // 3. Explicit category / breadcrumb / type text keywords
  if (rawCategory) {
    for (const rule of CATEGORY_RULES) {
      if (rule.patterns.some((re) => re.test(rawCategory))) {
        return resultFor(rule.category, 'HIGH');
      }
    }
  }

  // 4. Listing title keyword match
  if (title) {
    for (const rule of CATEGORY_RULES) {
      if (rule.patterns.some((re) => re.test(title))) {
        return resultFor(rule.category, 'HIGH');
      }
    }
  }

  // 5. Well-known model hint (e.g. "Merida Silex 400", "Trek Marlin 7", "Kellys Phanatic 30")
  if (title) {
    for (const rule of CATEGORY_RULES) {
      if (rule.modelHints.some((re) => re.test(title))) {
        return resultFor(rule.category, 'MEDIUM');
      }
    }
  }

  // 6. Attributes text (e.g. `<param name="Тип велосипеда">Гравійний</param>`)
  if (attrs) {
    for (const rule of CATEGORY_RULES) {
      if (rule.patterns.some((re) => re.test(attrs))) {
        return resultFor(rule.category, 'MEDIUM');
      }
    }
  }

  // 7. Description text fallback
  if (description) {
    for (const rule of CATEGORY_RULES) {
      if (rule.patterns.some((re) => re.test(description))) {
        return resultFor(rule.category, 'LOW');
      }
    }
  }

  // 8. Final heuristic fallback: most unclassified bikes on Ukrainian marketplaces (OLX/Prom) are MTB hardtails
  //    or city commuters; default to MTB_HARDTAIL for 29"/27.5"/26" else HYBRID.
  const combined = `${title} ${attrs}`;
  if (/\b(29|27[.,]5|26)\s*("|дюйм)?/.test(combined)) {
    return resultFor('MTB_HARDTAIL', 'LOW');
  }
  return resultFor('HYBRID', 'LOW');
}

export function getDefaultSurfaceProfile(category: BikeCategoryType): NormalizedSurfaceProfile {
  return { ...CATEGORY_DEFAULTS[category].surfaceProfile };
}
