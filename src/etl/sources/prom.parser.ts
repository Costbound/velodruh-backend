import type { RawListing } from '../types.js';
import { cleanText, slugify } from '../normalizers/text.utils.js';
import { mapWithConcurrency, type ReefApiClient } from './reefapi.client.js';

export interface PromSearchOptions {
  queries: string[];
  /** Optional Prom.ua category id. */
  category?: string;
  /** Optional condition (`new`, `used`, `refurbished`, `markdown`). */
  condition?: 'new' | 'used' | 'refurbished' | 'markdown';
  inStockOnly?: boolean;
  minPrice?: number;
  maxPrice?: number;
  /** Pages per query (default 1 = 2 credits/query for `prom-ua/v1/search`). */
  maxPages?: number;
  /** Rows per page (up to 60, default 48). */
  pageSize?: number;
  lang?: 'uk' | 'ru';
  /** Optional cap on extra `/prom-ua/v1/product` enrichment calls (1 credit each). Default: 0. */
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

function asBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lowered = value.toLowerCase();
    if (lowered === 'avail' || lowered === 'true' || lowered === 'in_stock') return true;
    if (lowered === 'not_avail' || lowered === 'false' || lowered === 'out_of_stock') return false;
  }
  return fallback;
}

function extractPromAttributes(rawAttrs: unknown): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (!Array.isArray(rawAttrs)) return attrs;
  for (const item of rawAttrs) {
    const rec = asRecord(item);
    if (!rec) continue;
    const name = asString(rec['name']);
    const val = asString(rec['value']);
    if (name && val) {
      attrs[cleanText(name)] = cleanText(val);
    }
  }
  return attrs;
}

/** Maps a Prom.ua search result row or full product item into `RawListing`. */
export function mapPromItemToRawListing(
  rawItem: unknown,
  defaultCondition?: string,
  collectedAt = new Date().toISOString(),
): RawListing | null {
  const item = asRecord(rawItem);
  if (!item) return null;

  // Drop weak matches flagged by Prom's own search engine
  if (item['weak_match'] === true || item['is_adult'] === true) {
    return null;
  }

  const productId = asString(item['product_id']) ?? asString(item['id']);
  const name = asString(item['name']) ?? asString(item['title']);
  const url = asString(item['url']);
  if (!name || !url) return null;

  const seller = asRecord(item['seller']);
  const sellerName = asString(seller?.['name']) ?? 'Prom.ua';
  const sellerId = asString(seller?.['seller_id']);
  const sellerCity = asString(seller?.['city']);
  const sellerUrl = asString(seller?.['url']) ?? 'https://prom.ua';
  const shopSlug = sellerId ? `prom-${slugify(sellerName, sellerId)}` : 'prom-ua';

  const attrs = extractPromAttributes(item['attributes']);

  const images = Array.isArray(item['images']) ? item['images'] : [];
  const imageUrl =
    asString(item['image']) ??
    (typeof images[0] === 'string' ? images[0] : null);

  const catObj = asRecord(item['category']);
  const breadcrumbs = Array.isArray(item['breadcrumbs'])
    ? item['breadcrumbs']
        .map((b) => asString(asRecord(b)?.['name']))
        .filter((s): s is string => s !== null)
        .join(' > ')
    : null;
  const categoryRaw =
    (breadcrumbs && breadcrumbs.length > 0 ? breadcrumbs : null) ??
    asString(catObj?.['name']) ??
    asString(item['category_name']) ??
    null;

  const modelObj = asRecord(item['model']);
  const availability = asString(item['availability']);
  const inStock =
    typeof item['in_stock'] === 'boolean'
      ? item['in_stock']
      : asBool(availability, true);

  const rawPrice = item['price'];
  const rawOldPrice = item['price_old'] ?? item['old_price'];

  return {
    source: 'prom',
    externalId: productId ?? url,
    shopSlug,
    shopName: sellerName === 'Prom.ua' ? 'Prom.ua' : `${sellerName} (Prom.ua)`,
    shopBaseUrl: sellerUrl,
    title: name,
    brand: asString(item['brand']) ?? attrs['Виробник'] ?? attrs['Бренд'] ?? null,
    model: asString(modelObj?.['name']) ?? null,
    categoryRaw,
    price: typeof rawPrice === 'number' || typeof rawPrice === 'string' ? rawPrice : null,
    oldPrice:
      typeof rawOldPrice === 'number' || typeof rawOldPrice === 'string' ? rawOldPrice : null,
    currency: asString(item['currency']) ?? 'UAH',
    inStock,
    condition: asString(item['condition']) ?? attrs['Стан'] ?? defaultCondition ?? null,
    city: sellerCity,
    productUrl: url,
    imageUrl,
    description: asString(item['description']),
    modelYear: attrs['Рік випуску'] ?? attrs['Год выпуска'] ?? null,
    sizeRaw:
      attrs['Розмір рами'] ??
      attrs['Размер рамы'] ??
      attrs['Розмір'] ??
      null,
    attributes: attrs,
    collectedAt,
  };
}

/** Maps a ReefAPI `prom-ua/v1/search` or `prom-ua/v1/product` response `data` payload to `RawListing[]`. */
export function parsePromResponseData(
  action: string,
  data: unknown,
  defaultCondition?: string,
  collectedAt = new Date().toISOString(),
): RawListing[] {
  const rec = asRecord(data);
  if (!rec) return [];

  if (action === 'product') {
    const mapped = mapPromItemToRawListing(rec['item'] ?? rec, defaultCondition, collectedAt);
    return mapped ? [mapped] : [];
  }

  const results = Array.isArray(rec['results']) ? rec['results'] : [];
  const listings: RawListing[] = [];
  for (const row of results) {
    const mapped = mapPromItemToRawListing(row, defaultCondition, collectedAt);
    if (mapped) listings.push(mapped);
  }
  return listings;
}

/**
 * Async Prom.ua parser powered by ReefAPI (`POST /prom-ua/v1/search`, 2 credits/call).
 */
export async function fetchPromListings(
  client: ReefApiClient,
  options: PromSearchOptions,
): Promise<RawListing[]> {
  const maxPages = Math.max(1, options.maxPages ?? 1);
  const pageSize = Math.min(60, Math.max(1, options.pageSize ?? 48));
  const lang = options.lang ?? 'uk';
  const collectedAt = options.collectedAt ?? new Date().toISOString();
  const listings: RawListing[] = [];
  const productIds: string[] = [];

  for (const query of options.queries) {
    let offset = 0;
    for (let page = 0; page < maxPages; page += 1) {
      const requestBody: Record<string, unknown> = {
        query,
        lang,
        page_size: pageSize,
        offset,
        ...(options.category !== undefined ? { category: options.category } : {}),
        ...(options.condition !== undefined ? { condition: options.condition } : {}),
        ...(options.inStockOnly !== undefined ? { in_stock: options.inStockOnly } : {}),
        ...(options.minPrice !== undefined ? { min_price: options.minPrice } : {}),
        ...(options.maxPrice !== undefined ? { max_price: options.maxPrice } : {}),
      };

      const envelope = await client.call<Record<string, unknown>>('prom-ua', 'search', requestBody);
      if (!envelope?.data) {
        break;
      }

      const batch = parsePromResponseData('search', envelope.data, options.condition, collectedAt);
      listings.push(...batch);
      for (const item of batch) {
        if (item.externalId) productIds.push(item.externalId);
      }

      const dataRec = asRecord(envelope.data);
      if (!dataRec?.['has_more']) {
        break;
      }
      const nextOffset = dataRec['next_offset'];
      offset =
        typeof nextOffset === 'number' && nextOffset > offset ? nextOffset : offset + pageSize;
    }
  }

  // Optional detail enrichment (`POST /prom-ua/v1/product` — 1 credit/item, default 0)
  const enrichCap = Math.max(0, options.enrichDetailsLimit ?? 0);
  if (enrichCap > 0 && productIds.length > 0) {
    const targets = [...new Set(productIds)].slice(0, enrichCap);
    const enriched = await mapWithConcurrency(
      targets,
      options.concurrency ?? 2,
      async (productId) => {
        const envelope = await client.call<Record<string, unknown>>('prom-ua', 'product', {
          product_id: productId,
          lang,
        });
        if (!envelope?.data) return null;
        const mapped = parsePromResponseData('product', envelope.data, options.condition, collectedAt);
        return mapped[0] ?? null;
      },
    );

    const byId = new Map<string, RawListing>();
    for (const item of enriched) {
      if (item) byId.set(item.externalId, item);
    }
    return listings.map((row) => byId.get(row.externalId) ?? row);
  }

  return listings;
}
