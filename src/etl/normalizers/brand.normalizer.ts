import type { NormalizedBrand } from '../types.js';
import { cleanText, escapeRegExp, slugify, toTitleCase } from './text.utils.js';

interface BrandEntry {
  slug: string;
  name: string;
  country: string | null;
  aliases: string[];
}

const BRAND_CATALOG: BrandEntry[] = [
  { slug: 'pride', name: 'Pride', country: 'Ukraine', aliases: ['pride', 'pride bikes', 'прайд'] },
  { slug: 'merida', name: 'Merida', country: 'Taiwan', aliases: ['merida', 'меріда', 'мерида'] },
  { slug: 'trek', name: 'Trek', country: 'USA', aliases: ['trek', 'trek bicycles', 'трек'] },
  {
    slug: 'cannondale',
    name: 'Cannondale',
    country: 'USA',
    aliases: ['cannondale', 'канондейл', 'кенондейл', 'кэннондейл', 'каннондейл'],
  },
  {
    slug: 'specialized',
    name: 'Specialized',
    country: 'USA',
    aliases: ['specialized', 'спеціалізований', 'спешиалайзд', 'спеш'],
  },
  { slug: 'giant', name: 'Giant', country: 'Taiwan', aliases: ['giant', 'джайнт', 'гіант'] },
  { slug: 'liv', name: 'Liv', country: 'Taiwan', aliases: ['liv cycling', 'liv'] },
  { slug: 'scott', name: 'Scott', country: 'Switzerland', aliases: ['scott', 'скотт', 'скот'] },
  { slug: 'kellys', name: 'Kellys', country: 'Slovakia', aliases: ['kellys', 'келліс', 'келлис'] },
  { slug: 'polygon', name: 'Polygon', country: 'Indonesia', aliases: ['polygon', 'полігон', 'полигон'] },
  { slug: 'cube', name: 'Cube', country: 'Germany', aliases: ['cube', 'cube bikes', 'куб'] },
  { slug: 'canyon', name: 'Canyon', country: 'Germany', aliases: ['canyon', 'каньйон', 'каньон'] },
  { slug: 'orbea', name: 'Orbea', country: 'Spain', aliases: ['orbea', 'орбеа'] },
  { slug: 'ghost', name: 'Ghost', country: 'Germany', aliases: ['ghost', 'ghost bikes', 'гост'] },
  { slug: 'bergamont', name: 'Bergamont', country: 'Germany', aliases: ['bergamont', 'бергамонт'] },
  { slug: 'gt', name: 'GT', country: 'USA', aliases: ['gt bicycles', 'gt'] },
  { slug: 'marin', name: 'Marin', country: 'USA', aliases: ['marin', 'marin bikes', 'марін', 'марин'] },
  { slug: 'kona', name: 'Kona', country: 'Canada', aliases: ['kona', 'кона'] },
  { slug: 'jamis', name: 'Jamis', country: 'USA', aliases: ['jamis', 'джаміс', 'джамис'] },
  { slug: 'bianchi', name: 'Bianchi', country: 'Italy', aliases: ['bianchi', 'бʼянкі', 'бьянки'] },
  { slug: 'leon', name: 'Leon', country: 'Ukraine', aliases: ['leon', 'леон'] },
  { slug: 'cyclone', name: 'Cyclone', country: 'Ukraine', aliases: ['cyclone', 'циклон'] },
  { slug: 'winner', name: 'Winner', country: 'Ukraine', aliases: ['winner', 'віннер', 'виннер'] },
  { slug: 'formula', name: 'Formula', country: 'Ukraine', aliases: ['formula', 'формула'] },
  { slug: 'dorozhnik', name: 'Dorozhnik', country: 'Ukraine', aliases: ['dorozhnik', 'дорожник', 'дорожнік'] },
  { slug: 'ardis', name: 'Ardis', country: 'Ukraine', aliases: ['ardis', 'ардіс', 'ардис'] },
  { slug: 'comanche', name: 'Comanche', country: 'Ukraine', aliases: ['comanche', 'команч', 'команче'] },
  { slug: 'kinetic', name: 'Kinetic', country: 'Ukraine', aliases: ['kinetic', 'кінетік', 'кинетик'] },
  { slug: 'discovery', name: 'Discovery', country: 'Ukraine', aliases: ['discovery', 'діскавері', 'дискавери'] },
  { slug: 'apollo', name: 'Apollo', country: 'Australia', aliases: ['apollo', 'аполло', 'аполо'] },
  { slug: 'kross', name: 'Kross', country: 'Poland', aliases: ['kross', 'кросс'] },
  { slug: 'author', name: 'Author', country: 'Czech Republic', aliases: ['author', 'автор'] },
  { slug: 'focus', name: 'Focus', country: 'Germany', aliases: ['focus', 'фокус'] },
  { slug: 'lapierre', name: 'Lapierre', country: 'France', aliases: ['lapierre', 'лапʼєр', 'лапьер'] },
  { slug: 'fuji', name: 'Fuji', country: 'Japan', aliases: ['fuji', 'фуджі', 'фуджи'] },
  { slug: 'haibike', name: 'Haibike', country: 'Germany', aliases: ['haibike', 'хайбайк'] },
  { slug: 'bmc', name: 'BMC', country: 'Switzerland', aliases: ['bmc'] },
  { slug: 'cervelo', name: 'Cervelo', country: 'Canada', aliases: ['cervelo', 'cervélo', 'сервело'] },
  { slug: 'pinarello', name: 'Pinarello', country: 'Italy', aliases: ['pinarello', 'пінарелло', 'пинарелло'] },
  { slug: 'ridley', name: 'Ridley', country: 'Belgium', aliases: ['ridley', 'рідлі'] },
  { slug: 'corratec', name: 'Corratec', country: 'Germany', aliases: ['corratec', 'корратек'] },
  { slug: 'norco', name: 'Norco', country: 'Canada', aliases: ['norco', 'норко'] },
  { slug: 'santa-cruz', name: 'Santa Cruz', country: 'USA', aliases: ['santa cruz', 'санта круз'] },
  { slug: 'schwinn', name: 'Schwinn', country: 'USA', aliases: ['schwinn', 'швін', 'швин'] },
  { slug: 'spelli', name: 'Spelli', country: 'Ukraine', aliases: ['spelli', 'спеллі', 'спелли'] },
  { slug: 'electra', name: 'Electra', country: 'USA', aliases: ['electra', 'електра'] },
  { slug: 'rockrider', name: 'Rockrider', country: 'France', aliases: ['rockrider', 'рокрайдер'] },
  { slug: 'triban', name: 'Triban', country: 'France', aliases: ['triban', 'трібан'] },
  { slug: 'riverside', name: 'Riverside', country: 'France', aliases: ['riverside', 'ріверсайд'] },
  { slug: 'van-rysel', name: 'Van Rysel', country: 'France', aliases: ['van rysel'] },
  { slug: 'sava', name: 'Sava', country: 'China', aliases: ['sava', 'сава'] },
  { slug: 'trinx', name: 'Trinx', country: 'China', aliases: ['trinx', 'трінкс', 'тринкс'] },
  { slug: 'titan', name: 'Titan', country: 'Ukraine', aliases: ['titan', 'титан'] },
  { slug: 'avanti', name: 'Avanti', country: 'New Zealand', aliases: ['avanti', 'аванті'] },
  { slug: 'vortex', name: 'Vortex', country: 'Ukraine', aliases: ['vortex', 'вортекс'] },
  { slug: 'crossride', name: 'Crossride', country: 'Ukraine', aliases: ['crossride', 'кросрайд'] },
  { slug: 'velotrade', name: 'Velotrade', country: 'Ukraine', aliases: ['velotrade', 'велотрейд'] },
  { slug: 'surly', name: 'Surly', country: 'USA', aliases: ['surly', 'серлі'] },
  { slug: 'brompton', name: 'Brompton', country: 'UK', aliases: ['brompton', 'бромптон'] },
  { slug: 'dahon', name: 'Dahon', country: 'USA', aliases: ['dahon', 'дахон'] },
  { slug: 'tern', name: 'Tern', country: 'Taiwan', aliases: ['tern', 'терн'] },
  { slug: 'shulz', name: 'Shulz', country: 'Europe', aliases: ['shulz', 'шульц'] },
  { slug: 'romet', name: 'Romet', country: 'Poland', aliases: ['romet', 'ромет'] },
  { slug: 'unibike', name: 'Unibike', country: 'Poland', aliases: ['unibike', 'юнібайк'] },
  { slug: 'ns-bikes', name: 'NS Bikes', country: 'Poland', aliases: ['ns bikes'] },
  { slug: 'rondo', name: 'Rondo', country: 'Poland', aliases: ['rondo', 'рондо'] },
  { slug: 'wilier', name: 'Wilier', country: 'Italy', aliases: ['wilier', 'wilier triestina'] },
  { slug: 'colnago', name: 'Colnago', country: 'Italy', aliases: ['colnago', 'кольнаго'] },
  { slug: 'felt', name: 'Felt', country: 'USA', aliases: ['felt', 'фелт'] },
  { slug: 'rose', name: 'Rose', country: 'Germany', aliases: ['rose bikes'] },
  { slug: 'stevens', name: 'Stevens', country: 'Germany', aliases: ['stevens', 'стівенс'] },
  { slug: 'wheeler', name: 'Wheeler', country: 'Taiwan', aliases: ['wheeler', 'вілер'] },
  { slug: 'cyclotech', name: 'Cyclotech', country: null, aliases: ['cyclotech'] },
  { slug: 'stark', name: 'Stark', country: null, aliases: ['stark bikes'] },
];

const EXACT_ALIAS_MAP = new Map<string, BrandEntry>();
const TITLE_PATTERNS: Array<{ entry: BrandEntry; alias: string; regex: RegExp }> = [];

function normalizeLookupKey(raw: string): string {
  return cleanText(raw)
    .toLowerCase()
    .replace(/[®™©"'`()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

for (const entry of BRAND_CATALOG) {
  for (const alias of entry.aliases) {
    const key = normalizeLookupKey(alias);
    EXACT_ALIAS_MAP.set(key, entry);
    // Avoid matching ultra-short generic words blindly inside other words by adding Unicode boundaries.
    const pattern = new RegExp(`(^|[^a-zа-яіїєґ0-9])${escapeRegExp(key)}(?=$|[^a-zа-яіїєґ0-9])`, 'i');
    TITLE_PATTERNS.push({ entry, alias: key, regex: pattern });
  }
}

// Match longer aliases first so "gt bicycles" precedes "gt" and "pride bikes" precedes "pride".
TITLE_PATTERNS.sort((a, b) => b.alias.length - a.alias.length);

const GENERIC_BRAND_VALUES = new Set([
  '',
  'unknown',
  'other',
  'інший',
  'інше',
  'другой',
  'без бренду',
  'без бренда',
  'no brand',
  'noname',
  'n/a',
  '-',
  'handmade',
]);

function stripCorporateSuffixes(raw: string): string {
  return raw
    .replace(/\b(bikes|bicycles|cycling|usa|ukraine|ua|llc|ltd|inc|gmbh)\b\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes a bike brand name to a canonical name + ASCII slug + country metadata.
 * Falls back to matching known brands inside the listing title when explicit vendor/brand is absent.
 */
export function normalizeBrand(
  rawBrand?: string | null,
  fallbackTitle?: string | null,
): NormalizedBrand {
  const cleanedRaw = cleanText(rawBrand);
  const lookupKey = normalizeLookupKey(cleanedRaw);

  if (lookupKey && !GENERIC_BRAND_VALUES.has(lookupKey)) {
    const exact = EXACT_ALIAS_MAP.get(lookupKey);
    if (exact) {
      return {
        slug: exact.slug,
        name: exact.name,
        country: exact.country,
        logoUrl: null,
        detectedFromTitle: false,
      };
    }

    const withoutSuffix = normalizeLookupKey(stripCorporateSuffixes(cleanedRaw));
    const afterStrip = EXACT_ALIAS_MAP.get(withoutSuffix);
    if (afterStrip) {
      return {
        slug: afterStrip.slug,
        name: afterStrip.name,
        country: afterStrip.country,
        logoUrl: null,
        detectedFromTitle: false,
      };
    }

    // Check if an explicit brand string contains a known brand (e.g. "Велосипед Pride")
    for (const { entry, regex } of TITLE_PATTERNS) {
      if (regex.test(lookupKey)) {
        return {
          slug: entry.slug,
          name: entry.name,
          country: entry.country,
          logoUrl: null,
          detectedFromTitle: false,
        };
      }
    }

    const displayName = toTitleCase(stripCorporateSuffixes(cleanedRaw) || cleanedRaw);
    return {
      slug: slugify(displayName, 'unknown'),
      name: displayName,
      country: null,
      logoUrl: null,
      detectedFromTitle: false,
    };
  }

  // Fallback: detect brand inside title text
  const titleText = normalizeLookupKey(fallbackTitle ?? '');
  if (titleText) {
    for (const { entry, regex } of TITLE_PATTERNS) {
      // "author" / "focus" / "liv" / "cube" / "gt" can match safely thanks to non-letter boundaries
      if (regex.test(titleText)) {
        return {
          slug: entry.slug,
          name: entry.name,
          country: entry.country,
          logoUrl: null,
          detectedFromTitle: true,
        };
      }
    }
  }

  return {
    slug: 'unknown',
    name: 'Unknown',
    country: null,
    logoUrl: null,
    detectedFromTitle: true,
  };
}

/** Returns all known brand aliases for a canonical slug (used when stripping brand from model titles). */
export function getBrandAliases(brandSlug: string): string[] {
  const entry = BRAND_CATALOG.find((b) => b.slug === brandSlug);
  return entry ? entry.aliases : [];
}
