import type { RawListing } from '../types.js';
import { cleanText, slugify } from '../normalizers/text.utils.js';
import type { ReefApiClient } from './reefapi.client.js';

export interface RozetkaSearchOptions {
  queries: string[];
  category?: string;
  seller?: 'rozetka' | 'marketplace';
  minPrice?: number;
  maxPrice?: number;
  sort?: 'relevance' | 'price_asc' | 'price_desc';
  /** Pages per query (60 rows/page, default 1 = 3 credits/query). */
  maxPages?: number;
  lang?: 'ua' | 'ru';
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

function extractCharacteristics(raw: unknown): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (!Array.isArray(raw)) return attrs;
  for (const ch of raw) {
    const rec = asRecord(ch);
    if (!rec) continue;
    const name = asString(rec['name']) ?? asString(rec['key']);
    if (!name) continue;
    const values = rec['values'];
    if (Array.isArray(values)) {
      const joined = values
        .map((v) => (typeof v === 'string' || typeof v === 'number' ? String(v) : asString(asRecord(v)?.['title'])))
        .filter((s): s is string => Boolean(s))
        .join(', ');
      if (joined) attrs[cleanText(name)] = cleanText(joined);
    } else if (typeof values === 'string') {
      attrs[cleanText(name)] = cleanText(values);
    }
  }
  return attrs;
}

/** Maps a Rozetka search row or full product object to `RawListing`. */
export function mapRozetkaItemToRawListing(
  rawItem: unknown,
  collectedAt = new Date().toISOString(),
): RawListing | null {
  const item = asRecord(rawItem);
  if (!item) return null;

  const productId = asString(item['product_id']) ?? asString(item['id']);
  const title = asString(item['title']) ?? asString(item['name']);
  const url = asString(item['url']);
  if (!title || !url) return null;

  const sellerObj = asRecord(item['seller']);
  const soldBy = asString(item['sold_by']) ?? asString(sellerObj?.['sold_by']);
  const sellerName =
    soldBy === 'rozetka'
      ? 'Rozetka'
      : asString(item['seller_name']) ?? asString(sellerObj?.['name']) ?? 'Rozetka Marketplace';
  const shopSlug =
    soldBy === 'rozetka' ? 'rozetka' : `rozetka-${slugify(sellerName, 'marketplace')}`;

  const categoryObj = asRecord(item['category']);
  const breadcrumbs = Array.isArray(item['breadcrumbs'])
    ? item['breadcrumbs']
        .map((b) => (typeof b === 'string' ? b : asString(asRecord(b)?.['title'])))
        .filter((s): s is string => Boolean(s))
        .join(' > ')
    : null;
  const categoryRaw =
    (breadcrumbs && breadcrumbs.length > 0 ? breadcrumbs : null) ??
    asString(categoryObj?.['title']) ??
    null;

  const attrs = extractCharacteristics(item['characteristics']);
  const shortSpecs = asString(item['short_specs']);
  if (shortSpecs && !attrs['Характеристики']) {
    attrs['Характеристики'] = cleanText(shortSpecs);
  }

  const sellStatus = (asString(item['sell_status']) ?? '').toLowerCase();
  const inStock =
    typeof item['in_stock'] === 'boolean'
      ? item['in_stock']
      : sellStatus === 'available' || sellStatus === 'limited' || sellStatus === '';

  const images = Array.isArray(item['images']) ? item['images'] : [];
  const imageUrl =
    asString(item['image']) ??
    (typeof images[0] === 'string' ? images[0] : asString(asRecord(images[0])?.['url']));

  const rawPrice = item['price'];
  const rawOldPrice = item['old_price'];

  return {
    source: 'rozetka',
    externalId: productId ?? url,
    shopSlug,
    shopName: sellerName === 'Rozetka' ? 'Rozetka' : `${sellerName} (Rozetka)`,
    shopBaseUrl: asString(item['seller_url']) ?? 'https://rozetka.com.ua',
    title,
    brand: asString(item['brand']),
    categoryRaw,
    price: typeof rawPrice === 'number' || typeof rawPrice === 'string' ? rawPrice : null,
    oldPrice:
      typeof rawOldPrice === 'number' || typeof rawOldPrice === 'string' ? rawOldPrice : null,
    currency: asString(item['currency']) ?? 'UAH',
    inStock,
    condition: asString(item['condition']) ?? (item['is_markdown'] === true ? 'markdown' : 'new'),
    city: null,
    productUrl: url,
    imageUrl,
    description: asString(item['description']) ?? shortSpecs,
    modelYear: attrs['Рік'] ?? attrs['Рік випуску'] ?? attrs['Модельний рік'] ?? null,
    sizeRaw: attrs['Розмір рами'] ?? attrs['Ростовка'] ?? attrs['Розмір'] ?? null,
    attributes: attrs,
    collectedAt,
  };
}

/** Maps a ReefAPI `rozetka/v1/search` or `rozetka/v1/product` `data` payload to `RawListing[]`. */
export function parseRozetkaResponseData(
  action: string,
  data: unknown,
  collectedAt = new Date().toISOString(),
): RawListing[] {
  const rec = asRecord(data);
  if (!rec) return [];

  if (action === 'product') {
    const mapped = mapRozetkaItemToRawListing(rec['product'] ?? rec, collectedAt);
    return mapped ? [mapped] : [];
  }

  const results = Array.isArray(rec['results']) ? rec['results'] : [];
  const listings: RawListing[] = [];
  for (const row of results) {
    const mapped = mapRozetkaItemToRawListing(row, collectedAt);
    if (mapped) listings.push(mapped);
  }
  return listings;
}

/**
 * Async Rozetka parser powered by ReefAPI (`POST /rozetka/v1/search`, 3 credits/call, 60 rows/page).
 */
export async function fetchRozetkaListings(
  client: ReefApiClient,
  options: RozetkaSearchOptions,
): Promise<RawListing[]> {
  const maxPages = Math.max(1, options.maxPages ?? 1);
  const lang = options.lang ?? 'ua';
  const collectedAt = options.collectedAt ?? new Date().toISOString();
  const listings: RawListing[] = [];

  for (const query of options.queries) {
    for (let page = 1; page <= maxPages; page += 1) {
      const requestBody: Record<string, unknown> = {
        query,
        page,
        lang,
        ...(options.category !== undefined ? { category: options.category } : {}),
        ...(options.seller !== undefined ? { seller: options.seller } : {}),
        ...(options.minPrice !== undefined ? { min_price: options.minPrice } : {}),
        ...(options.maxPrice !== undefined ? { max_price: options.maxPrice } : {}),
        ...(options.sort !== undefined ? { sort: options.sort } : {}),
      };

      const envelope = await client.call<Record<string, unknown>>('rozetka', 'search', requestBody);
      if (!envelope?.data) {
        break;
      }

      listings.push(...parseRozetkaResponseData('search', envelope.data, collectedAt));

      const dataRec = asRecord(envelope.data);
      if (!dataRec?.['has_more']) {
        break;
      }
    }
  }

  return listings;
}
