import type { RawListing } from '../types.js';
import { cleanText, slugify } from '../normalizers/text.utils.js';
import type { ReefApiClient } from './reefapi.client.js';

export interface HotlineSearchOptions {
  /** Keyword searches (3 credits/page via `/hotline-ua/v1/search`). */
  queries?: string[];
  /** Optional category slug (2 credits/page via `/hotline-ua/v1/category`). */
  category?: string;
  city?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: 'popular' | 'price_asc' | 'price_desc' | 'newest' | 'name' | 'offers';
  maxPages?: number;
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

function extractHotlineSpecs(rawSpecs: unknown): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (!Array.isArray(rawSpecs)) return attrs;
  for (const group of rawSpecs) {
    const gRec = asRecord(group);
    const items = Array.isArray(gRec?.['specs']) ? gRec['specs'] : [group];
    for (const s of items) {
      const sRec = asRecord(s);
      if (!sRec) continue;
      const name = asString(sRec['name']);
      const value = asString(sRec['value']);
      if (name && value) attrs[cleanText(name)] = cleanText(value);
    }
  }
  return attrs;
}

/** Maps a Hotline.ua row (`search` / `category` / `product`) into `RawListing`. */
export function mapHotlineItemToRawListing(
  rawItem: unknown,
  collectedAt = new Date().toISOString(),
): RawListing | null {
  const item = asRecord(rawItem);
  if (!item) return null;

  const productId = asString(item['product_id']) ?? asString(item['id']);
  const title = asString(item['title']);
  const rawUrl =
    asString(item['outbound_url']) ??
    asString(item['url']) ??
    (asString(item['product_path']) ? `https://hotline.ua${asString(item['product_path'])}` : null);
  if (!title || !rawUrl) return null;

  const shopName = asString(item['shop_name']) ?? 'Hotline.ua';
  const shopSlug = shopName === 'Hotline.ua' ? 'hotline-ua' : slugify(shopName, 'hotline-ua');
  const price =
    item['cheapest_new_offer'] ??
    item['lowest_price'] ??
    item['price'] ??
    null;

  const attrs = extractHotlineSpecs(item['specs']);
  const shortSpecs = asString(item['short_specs']);
  if (shortSpecs && !attrs['Характеристики']) {
    attrs['Характеристики'] = cleanText(shortSpecs);
  }

  const images = Array.isArray(item['images']) ? item['images'] : [];
  const imageUrl = asString(item['image']) ?? (typeof images[0] === 'string' ? images[0] : null);

  return {
    source: 'hotline',
    externalId: productId ?? rawUrl,
    shopSlug,
    shopName,
    shopBaseUrl: 'https://hotline.ua',
    title,
    brand: asString(item['brand']),
    categoryRaw: asString(item['category_path']),
    price: typeof price === 'number' || typeof price === 'string' ? price : null,
    oldPrice: null,
    currency: asString(item['currency']) ?? 'UAH',
    inStock: price !== null,
    condition: 'new',
    city: asString(item['city']),
    productUrl: rawUrl,
    imageUrl,
    description: shortSpecs,
    modelYear: attrs['Рік випуску'] ?? attrs['Модельний рік'] ?? null,
    sizeRaw: attrs['Розмір рами'] ?? attrs['Ростовка'] ?? null,
    attributes: attrs,
    collectedAt,
  };
}

/** Maps a ReefAPI `hotline-ua` response `data` payload to `RawListing[]`. */
export function parseHotlineResponseData(
  action: string,
  data: unknown,
  collectedAt = new Date().toISOString(),
): RawListing[] {
  const rec = asRecord(data);
  if (!rec) return [];

  if (action === 'product') {
    const mapped = mapHotlineItemToRawListing(rec, collectedAt);
    return mapped ? [mapped] : [];
  }

  const results = Array.isArray(rec['results']) ? rec['results'] : [];
  const listings: RawListing[] = [];
  for (const row of results) {
    const mapped = mapHotlineItemToRawListing(row, collectedAt);
    if (mapped) listings.push(mapped);
  }
  return listings;
}

/**
 * Async Hotline.ua parser powered by ReefAPI.
 * Prefer `category` (`POST /hotline-ua/v1/category` — 2 credits/48 bikes) over `search` (3 credits).
 */
export async function fetchHotlineListings(
  client: ReefApiClient,
  options: HotlineSearchOptions,
): Promise<RawListing[]> {
  const maxPages = Math.max(1, options.maxPages ?? 1);
  const collectedAt = options.collectedAt ?? new Date().toISOString();
  const listings: RawListing[] = [];

  if (options.category) {
    for (let page = 1; page <= maxPages; page += 1) {
      const envelope = await client.call<Record<string, unknown>>('hotline-ua', 'category', {
        category: options.category,
        page,
        ...(options.sort !== undefined ? { sort: options.sort } : {}),
        ...(options.minPrice !== undefined ? { min_price: options.minPrice } : {}),
        ...(options.maxPrice !== undefined ? { max_price: options.maxPrice } : {}),
        ...(options.city !== undefined ? { city: options.city } : {}),
      });
      if (!envelope?.data) break;
      listings.push(...parseHotlineResponseData('category', envelope.data, collectedAt));
      if (!asRecord(envelope.data)?.['has_more']) break;
    }
  }

  for (const query of options.queries ?? []) {
    for (let page = 1; page <= maxPages; page += 1) {
      const envelope = await client.call<Record<string, unknown>>('hotline-ua', 'search', {
        query,
        page,
      });
      if (!envelope?.data) break;
      listings.push(...parseHotlineResponseData('search', envelope.data, collectedAt));
      if (!asRecord(envelope.data)?.['has_more']) break;
    }
  }

  return listings;
}
