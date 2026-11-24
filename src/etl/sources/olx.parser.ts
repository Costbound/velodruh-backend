import type { RawListing } from '../types.js';
import { cleanText } from '../normalizers/text.utils.js';
import { mapWithConcurrency, type ReefApiClient } from './reefapi.client.js';

export interface OlxSearchOptions {
  queries: string[];
  /** OLX numeric category_id (optional). */
  categoryId?: number;
  /** OLX marketplace country code (defaults to Ukraine `ua`). */
  country?: string;
  /** Filter by condition (`new` or `used`). */
  condition?: 'new' | 'used';
  /** Number of offset pages per query (default 1 = 1 credit/query). */
  maxPages?: number;
  /** Results per page (1..50, default 40). */
  limit?: number;
  priceFrom?: number;
  priceTo?: number;
  withPhotos?: boolean;
  /** Optional cap on extra `/olx/v1/offer` detail calls (1 credit each). Default: 0. */
  enrichDetailsLimit?: number;
  concurrency?: number;
  collectedAt?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  if (typeof value === 'string') {
    const t = value.trim();
    return t.length > 0 ? t : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function extractOlxPrice(offer: Record<string, unknown>): {
  price: number | string | null;
  currency: string;
} {
  const direct = offer['price'];
  if (typeof direct === 'number' || typeof direct === 'string') {
    return {
      price: direct,
      currency: asString(offer['currency']) ?? 'UAH',
    };
  }
  const priceObj = asRecord(direct);
  if (priceObj) {
    const val = priceObj['value'] ?? priceObj['amount'] ?? priceObj['regular_price'];
    const cur =
      asString(priceObj['currency']) ??
      asString(priceObj['currency_code']) ??
      asString(offer['currency']) ??
      'UAH';
    if (typeof val === 'number' || typeof val === 'string') {
      return { price: val, currency: cur };
    }
    const label = asString(priceObj['label']) ?? asString(priceObj['display']);
    if (label) {
      return { price: label, currency: cur };
    }
  }

  // Fallback to OLX params[] style (`key === 'price'`)
  const params = offer['params'];
  if (Array.isArray(params)) {
    for (const p of params) {
      const rec = asRecord(p);
      if (rec && rec['key'] === 'price') {
        const valRec = asRecord(rec['value']);
        const rawVal = valRec?.['value'] ?? rec['value'];
        if (typeof rawVal === 'number' || typeof rawVal === 'string') {
          return {
            price: rawVal,
            currency: asString(valRec?.['currency']) ?? 'UAH',
          };
        }
      }
    }
  }

  return { price: null, currency: 'UAH' };
}

function extractOlxParams(offer: Record<string, unknown>): Record<string, string> {
  const attrs: Record<string, string> = {};
  const rawParams = offer['params'] ?? offer['attributes'];

  if (Array.isArray(rawParams)) {
    for (const entry of rawParams) {
      const rec = asRecord(entry);
      if (!rec) continue;
      const key = asString(rec['name']) ?? asString(rec['label']) ?? asString(rec['key']);
      if (!key) continue;
      const rawValue = rec['value'];
      if (typeof rawValue === 'string' || typeof rawValue === 'number') {
        attrs[key] = cleanText(String(rawValue));
      } else {
        const valObj = asRecord(rawValue);
        const label =
          asString(valObj?.['label']) ??
          asString(valObj?.['value']) ??
          asString(rec['value_label']);
        if (label) {
          attrs[key] = cleanText(label);
        }
      }
    }
  } else {
    const obj = asRecord(rawParams);
    if (obj) {
      for (const [k, v] of Object.entries(obj)) {
        const str = asString(v);
        if (str) attrs[k] = cleanText(str);
      }
    }
  }

  return attrs;
}

function extractOlxPhoto(offer: Record<string, unknown>): string | null {
  const direct = asString(offer['image']) ?? asString(offer['photo']) ?? asString(offer['thumbnail']);
  if (direct) return direct;

  const photos = offer['photos'] ?? offer['images'];
  if (Array.isArray(photos) && photos.length > 0) {
    const first = photos[0];
    if (typeof first === 'string') return first;
    const obj = asRecord(first);
    return asString(obj?.['url']) ?? asString(obj?.['link']) ?? asString(obj?.['src']) ?? null;
  }
  return null;
}

function extractOlxCity(offer: Record<string, unknown>): string | null {
  const direct = asString(offer['city']);
  if (direct) return direct;
  const location = asRecord(offer['location']);
  if (!location) return null;
  const cityVal = location['city'];
  if (typeof cityVal === 'string') return cityVal;
  const cityRec = asRecord(cityVal);
  return (
    asString(cityRec?.['name']) ??
    asString(location['city_name']) ??
    asString(location['region_name']) ??
    null
  );
}

/** Maps a single ReefAPI OLX offer object (from `/olx/v1/search` or `/olx/v1/offer`) to `RawListing`. */
export function mapOlxOfferToRawListing(
  rawOffer: unknown,
  collectedAt = new Date().toISOString(),
): RawListing | null {
  const offer = asRecord(rawOffer);
  if (!offer) return null;

  const id = asString(offer['id']) ?? asString(offer['offer_id']);
  const title = asString(offer['title']) ?? asString(offer['name']);
  const url = asString(offer['url']) ?? asString(offer['href']);
  if (!title || !url) {
    return null;
  }

  const { price, currency } = extractOlxPrice(offer);
  const attrs = extractOlxParams(offer);

  const condition =
    asString(offer['condition']) ??
    asString(offer['state']) ??
    attrs['Стан'] ??
    attrs['Состояние'] ??
    attrs['state'] ??
    'used';

  const catObj = asRecord(offer['category']);
  const categoryRaw =
    asString(offer['category_name']) ??
    asString(catObj?.['name']) ??
    asString(catObj?.['title']) ??
    asString(offer['category']) ??
    attrs['Підкатегорія'] ??
    null;

  const brand =
    asString(offer['brand']) ??
    attrs['Марка'] ??
    attrs['Бренд'] ??
    attrs['Виробник'] ??
    null;

  const sizeRaw =
    attrs['Розмір рами'] ??
    attrs['Размер рамы'] ??
    attrs['Рама'] ??
    attrs['frame_size'] ??
    null;

  const statusStr = (asString(offer['status']) ?? '').toLowerCase();
  const inStock = statusStr ? statusStr === 'active' || statusStr === 'published' : true;

  const sellerObj = asRecord(offer['seller']) ?? asRecord(offer['user']);
  const sellerName = asString(sellerObj?.['name']);
  const city = extractOlxCity(offer);

  const shopLabel = sellerName ? `OLX (${sellerName})` : 'OLX.ua';

  return {
    source: 'olx',
    externalId: id ?? url,
    shopSlug: 'olx-ua',
    shopName: city ? `OLX (${city})` : shopLabel,
    shopBaseUrl: 'https://www.olx.ua',
    title,
    brand,
    categoryRaw,
    price,
    oldPrice: null,
    currency,
    inStock,
    condition,
    city,
    productUrl: url,
    imageUrl: extractOlxPhoto(offer),
    description: asString(offer['description']),
    modelYear: attrs['Рік випуску'] ?? attrs['Год'] ?? null,
    sizeRaw,
    attributes: attrs,
    collectedAt,
  };
}

/** Maps a ReefAPI `olx/v1/search` or `olx/v1/offer` payload `data` into `RawListing[]`. */
export function parseOlxResponseData(
  action: string,
  data: unknown,
  collectedAt = new Date().toISOString(),
): RawListing[] {
  const rec = asRecord(data);
  if (!rec) return [];

  if (action === 'offer') {
    const single = mapOlxOfferToRawListing(rec['offer'] ?? rec, collectedAt);
    return single ? [single] : [];
  }

  const offers = Array.isArray(rec['offers'])
    ? rec['offers']
    : Array.isArray(rec['results'])
      ? rec['results']
      : [];

  const parsed: RawListing[] = [];
  for (const item of offers) {
    const mapped = mapOlxOfferToRawListing(item, collectedAt);
    if (mapped) parsed.push(mapped);
  }
  return parsed;
}

/**
 * Async OLX parser powered by ReefAPI (`POST /olx/v1/search`, 1 credit/call).
 * Pagination stops early when `has_more` is false or `maxPages` is reached.
 */
export async function fetchOlxListings(
  client: ReefApiClient,
  options: OlxSearchOptions,
): Promise<RawListing[]> {
  const country = options.country ?? 'ua';
  const maxPages = Math.max(1, options.maxPages ?? 1);
  const limit = Math.min(50, Math.max(1, options.limit ?? 40));
  const collectedAt = options.collectedAt ?? new Date().toISOString();
  const listings: RawListing[] = [];
  const offerIdsToEnrich: string[] = [];

  for (const query of options.queries) {
    let offset = 0;
    for (let page = 0; page < maxPages; page += 1) {
      const requestBody: Record<string, unknown> = {
        query,
        country,
        limit,
        offset,
        ...(options.categoryId !== undefined ? { category_id: options.categoryId } : {}),
        ...(options.condition !== undefined ? { condition: options.condition } : {}),
        ...(options.priceFrom !== undefined ? { price_from: options.priceFrom } : {}),
        ...(options.priceTo !== undefined ? { price_to: options.priceTo } : {}),
        ...(options.withPhotos !== undefined ? { with_photos: options.withPhotos } : {}),
      };

      const envelope = await client.call<Record<string, unknown>>('olx', 'search', requestBody);
      if (!envelope?.data) {
        break;
      }

      const batch = parseOlxResponseData('search', envelope.data, collectedAt);
      listings.push(...batch);

      for (const item of batch) {
        if (/^\d+$/.test(item.externalId)) {
          offerIdsToEnrich.push(item.externalId);
        }
      }

      const dataRec = asRecord(envelope.data);
      const hasMore = Boolean(dataRec?.['has_more']);
      const nextOffsetRaw = dataRec?.['next_offset'] ?? envelope.meta?.next_offset;
      if (!hasMore) {
        break;
      }
      offset =
        typeof nextOffsetRaw === 'number' && nextOffsetRaw > offset
          ? nextOffsetRaw
          : offset + limit;
    }
  }

  // Optional detail enrichment (`POST /olx/v1/offer` — 1 credit each, disabled by default)
  const enrichCap = Math.max(0, options.enrichDetailsLimit ?? 0);
  if (enrichCap > 0 && offerIdsToEnrich.length > 0) {
    const targets = [...new Set(offerIdsToEnrich)].slice(0, enrichCap);
    const enriched = await mapWithConcurrency(
      targets,
      options.concurrency ?? 2,
      async (id) => {
        const envelope = await client.call<Record<string, unknown>>('olx', 'offer', {
          id: Number.parseInt(id, 10),
          country,
        });
        if (!envelope?.data) return null;
        const mapped = parseOlxResponseData('offer', envelope.data, collectedAt);
        return mapped[0] ?? null;
      },
    );

    const enrichedById = new Map<string, RawListing>();
    for (const item of enriched) {
      if (item) enrichedById.set(item.externalId, item);
    }

    return listings.map((row) => enrichedById.get(row.externalId) ?? row);
  }

  return listings;
}
