const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'h',
  ґ: 'g',
  д: 'd',
  е: 'e',
  є: 'ye',
  ж: 'zh',
  з: 'z',
  и: 'y',
  і: 'i',
  ї: 'yi',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ь: '',
  ю: 'yu',
  я: 'ya',
  ё: 'yo',
  ъ: '',
  ы: 'y',
  э: 'e',
};

const HTML_ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '-',
  mdash: '-',
  laquo: '"',
  raquo: '"',
  rsquo: "'",
  lsquo: "'",
  ldquo: '"',
  rdquo: '"',
};

export const DEFAULT_CURRENCY_RATES_TO_UAH: Record<string, number> = {
  UAH: 1,
  ГРН: 1,
  USD: 41.5,
  EUR: 44.5,
  PLN: 10.3,
};

/** Decodes basic XML/HTML named and numeric entities. */
export function decodeXmlEntities(input: string): string {
  return input.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (full, code: string) => {
    if (code.startsWith('#x') || code.startsWith('#X')) {
      const cp = Number.parseInt(code.slice(2), 16);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : full;
    }
    if (code.startsWith('#')) {
      const cp = Number.parseInt(code.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : full;
    }
    return HTML_ENTITY_MAP[code.toLowerCase()] ?? full;
  });
}

/** Strips HTML tags and normalizes whitespace into a clean single-line string. */
export function cleanText(input: string | null | undefined): string {
  if (!input) {
    return '';
  }
  const decoded = decodeXmlEntities(input);
  return decoded
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u00A0\u200B-\u200D\uFEFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Transliterates Ukrainian/Russian Cyrillic text to lowercase Latin ASCII. */
export function transliterateCyrillic(input: string): string {
  let out = '';
  for (const ch of input.toLowerCase()) {
    out += CYRILLIC_TO_LATIN[ch] ?? ch;
  }
  return out;
}

/**
 * Produces an ASCII kebab-case slug matching `bikeSlugParamsSchema` (`^[a-z0-9-]+$`).
 */
export function slugify(input: string, fallback = 'item'): string {
  const ascii = transliterateCyrillic(cleanText(input))
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');

  const slug = ascii
    .replace(/[.,/_+]+/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug.length > 0 ? slug : fallback;
}

/**
 * Converts a string to clean ASCII/Latin title-case while preserving known acronyms & digits.
 */
export function toTitleCase(input: string): string {
  return cleanText(input)
    .split(' ')
    .filter(Boolean)
    .map((word) => {
      if (/^[A-Z0-9.-]{2,4}$/.test(word)) {
        return word;
      }
      const first = word.charAt(0).toUpperCase();
      return first + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Parses a price string or number (e.g. `"33 900 грн"`, `"33,900.50"`, `850`) into rounded UAH integer.
 * Returns `null` when invalid or non-positive.
 */
export function parsePriceToUah(
  rawPrice: number | string | null | undefined,
  rawCurrency?: string | null,
  rates: Record<string, number> = DEFAULT_CURRENCY_RATES_TO_UAH,
): number | null {
  if (rawPrice === null || rawPrice === undefined) {
    return null;
  }

  let amount: number;
  let detectedCurrency = (rawCurrency ?? '').trim().toUpperCase();

  if (typeof rawPrice === 'number') {
    if (!Number.isFinite(rawPrice) || rawPrice <= 0) {
      return null;
    }
    amount = rawPrice;
  } else {
    const text = cleanText(rawPrice);
    if (!text) {
      return null;
    }
    if (!detectedCurrency) {
      if (/(\$|usd|дол)/i.test(text)) {
        detectedCurrency = 'USD';
      } else if (/(€|eur|євро|евро)/i.test(text)) {
        detectedCurrency = 'EUR';
      } else if (/(zł|pln|зл)/i.test(text)) {
        detectedCurrency = 'PLN';
      } else {
        detectedCurrency = 'UAH';
      }
    }

    // Remove spaces/non-breaking spaces inside numbers, e.g. "33 900.50 грн"
    const numericPart = text.replace(/[^\d.,]/g, '');
    if (!numericPart) {
      return null;
    }

    let normalizedNumber: string;
    const hasComma = numericPart.includes(',');
    const hasDot = numericPart.includes('.');
    if (hasComma && hasDot) {
      // Determine decimal separator by last position
      const lastComma = numericPart.lastIndexOf(',');
      const lastDot = numericPart.lastIndexOf('.');
      if (lastComma > lastDot) {
        normalizedNumber = numericPart.replace(/\./g, '').replace(',', '.');
      } else {
        normalizedNumber = numericPart.replace(/,/g, '');
      }
    } else if (hasComma) {
      const parts = numericPart.split(',');
      const tail = parts[parts.length - 1] ?? '';
      // "33,900" -> thousands sep; "33900,50" -> decimal sep
      normalizedNumber =
        parts.length === 2 && tail.length <= 2
          ? numericPart.replace(',', '.')
          : numericPart.replace(/,/g, '');
    } else if (hasDot) {
      const parts = numericPart.split('.');
      const tail = parts[parts.length - 1] ?? '';
      normalizedNumber =
        parts.length > 2 || (parts.length === 2 && tail.length === 3)
          ? numericPart.replace(/\./g, '')
          : numericPart;
    } else {
      normalizedNumber = numericPart;
    }

    amount = Number.parseFloat(normalizedNumber);
    if (!Number.isFinite(amount) || amount <= 0) {
      return null;
    }
  }

  const currencyKey =
    detectedCurrency === '₴' || detectedCurrency === 'ГРН' || detectedCurrency === 'UAH' || !detectedCurrency
      ? 'UAH'
      : detectedCurrency === '$'
        ? 'USD'
        : detectedCurrency === '€'
          ? 'EUR'
          : detectedCurrency;

  const rate = rates[currencyKey] ?? DEFAULT_CURRENCY_RATES_TO_UAH[currencyKey] ?? 1;
  const converted = Math.round(amount * rate);
  return converted > 0 ? converted : null;
}

/** Normalizes a product URL for reliable cross-run offer deduplication (strips UTM/tracking params). */
export function normalizeProductUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return '';
  }
  try {
    const parsed = new URL(trimmed);
    const trackingPrefixes = ['utm_', 'fbclid', 'gclid', 'yclid', 'ref', 'srsltid'];
    for (const key of [...parsed.searchParams.keys()]) {
      const lower = key.toLowerCase();
      if (trackingPrefixes.some((p) => lower === p || lower.startsWith(p))) {
        parsed.searchParams.delete(key);
      }
    }
    parsed.hash = '';
    const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    parsed.pathname = pathname;
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

/** Builds a clean deep-link affiliate URL matching the project's convention. */
export function buildAffiliateUrl(
  productUrl: string,
  shopSlug: string,
  bikeSlug: string,
  sizeLabel: string,
  source: string,
): string {
  try {
    const url = new URL(productUrl);
    url.searchParams.set('utm_source', 'velodruh');
    url.searchParams.set('utm_medium', source === 'xml_feed' ? 'feed' : 'aggregator');
    url.searchParams.set('utm_campaign', `${shopSlug}-${bikeSlug}-${sizeLabel.toLowerCase()}`);
    return url.toString();
  } catch {
    return productUrl;
  }
}

/** Escapes special regex characters in a literal token. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
