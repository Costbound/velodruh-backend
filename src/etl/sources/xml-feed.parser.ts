import { readFile } from 'node:fs/promises';
import type { RawListing } from '../types.js';
import { cleanText, decodeXmlEntities, slugify } from '../normalizers/text.utils.js';

export interface XmlFeedParseOptions {
  /** Override detected `<shop><name>` slug. */
  shopSlug?: string;
  /** Override detected `<shop><name>` display name. */
  shopName?: string;
  /** Override detected `<shop><url>`. */
  shopBaseUrl?: string;
  /** Override timestamp stored on extracted offers. */
  collectedAt?: string;
}

export interface XmlFeedParseResult {
  shopName: string;
  shopSlug: string;
  shopBaseUrl: string;
  generatedAt: string | null;
  currencyRates: Record<string, number>;
  categoriesCount: number;
  listings: RawListing[];
  warnings: string[];
}

export interface XmlFetchOptions extends XmlFeedParseOptions {
  timeoutMs?: number;
  maxBytes?: number;
  fetchImpl?: typeof fetch;
}

interface ParsedXmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: ParsedXmlNode[];
  text: string;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024; // 25 MiB safeguard for MVP feeds

function parseAttributes(attrSource: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRe = /([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = attrRe.exec(attrSource)) !== null) {
    const key = match[1]!;
    const rawVal = match[2] ?? match[3] ?? '';
    attrs[key] = decodeXmlEntities(rawVal).trim();
  }
  return attrs;
}

/**
 * Lightweight, zero-dependency XML tree parser designed for YML/XML product feeds.
 * Safely handles UTF-8 BOM, XML declarations, DOCTYPE headers, comments,
 * `<![CDATA[...]]>`, self-closing tags, and numeric/named XML entities.
 */
function parseXmlDocument(xmlInput: string): ParsedXmlNode {
  const root: ParsedXmlNode = { tag: '__root__', attrs: {}, children: [], text: '' };
  const stack: ParsedXmlNode[] = [root];

  // Strip UTF-8 BOM
  const src = xmlInput.charCodeAt(0) === 0xfeff ? xmlInput.slice(1) : xmlInput;
  const len = src.length;
  let pos = 0;

  while (pos < len) {
    const lt = src.indexOf('<', pos);
    if (lt === -1) {
      const tail = src.slice(pos);
      if (tail.trim()) {
        stack[stack.length - 1]!.text += decodeXmlEntities(tail);
      }
      break;
    }

    if (lt > pos) {
      const chunk = src.slice(pos, lt);
      if (chunk) {
        stack[stack.length - 1]!.text += decodeXmlEntities(chunk);
      }
    }

    // Comment: <!-- ... -->
    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4);
      if (end === -1) break;
      pos = end + 3;
      continue;
    }

    // CDATA: <![CDATA[ ... ]]>
    if (src.startsWith('<![CDATA[', lt)) {
      const end = src.indexOf(']]>', lt + 9);
      if (end === -1) {
        stack[stack.length - 1]!.text += src.slice(lt + 9);
        break;
      }
      stack[stack.length - 1]!.text += src.slice(lt + 9, end);
      pos = end + 3;
      continue;
    }

    // Processing instruction: <?xml ... ?>
    if (src.startsWith('<?', lt)) {
      const end = src.indexOf('?>', lt + 2);
      if (end === -1) break;
      pos = end + 2;
      continue;
    }

    // DOCTYPE / declaration: <!DOCTYPE ...>
    if (src.startsWith('<!', lt)) {
      const end = src.indexOf('>', lt + 2);
      if (end === -1) break;
      pos = end + 1;
      continue;
    }

    // Find closing '>' outside quoted attribute strings
    let gt = lt + 1;
    let inQuote: '"' | "'" | null = null;
    while (gt < len) {
      const ch = src[gt];
      if (inQuote) {
        if (ch === inQuote) inQuote = null;
      } else if (ch === '"' || ch === "'") {
        inQuote = ch;
      } else if (ch === '>') {
        break;
      }
      gt += 1;
    }
    if (gt >= len) break;

    const rawTag = src.slice(lt + 1, gt).trim();
    pos = gt + 1;

    if (!rawTag) continue;

    // Closing tag: </tag>
    if (rawTag.startsWith('/')) {
      const closeName = rawTag.slice(1).trim().toLowerCase();
      for (let i = stack.length - 1; i >= 1; i -= 1) {
        if (stack[i]!.tag === closeName) {
          stack.length = i;
          break;
        }
      }
      continue;
    }

    const selfClosing = rawTag.endsWith('/');
    const content = selfClosing ? rawTag.slice(0, -1).trim() : rawTag;
    const spaceIdx = content.search(/\s/);
    const tagName = (spaceIdx === -1 ? content : content.slice(0, spaceIdx)).toLowerCase();
    const attrPart = spaceIdx === -1 ? '' : content.slice(spaceIdx + 1);

    const node: ParsedXmlNode = {
      tag: tagName,
      attrs: attrPart ? parseAttributes(attrPart) : {},
      children: [],
      text: '',
    };

    stack[stack.length - 1]!.children.push(node);
    if (!selfClosing) {
      stack.push(node);
    }
  }

  return root;
}

function findChild(node: ParsedXmlNode | undefined, ...names: string[]): ParsedXmlNode | undefined {
  if (!node) return undefined;
  const targets = new Set(names.map((n) => n.toLowerCase()));
  return node.children.find((child) => targets.has(child.tag));
}

function findChildren(node: ParsedXmlNode | undefined, ...names: string[]): ParsedXmlNode[] {
  if (!node) return [];
  const targets = new Set(names.map((n) => n.toLowerCase()));
  return node.children.filter((child) => targets.has(child.tag));
}

function childText(node: ParsedXmlNode, ...names: string[]): string | undefined {
  const child = findChild(node, ...names);
  if (!child) return undefined;
  const val = child.text.trim();
  return val.length > 0 ? val : undefined;
}

function parseBoolFlag(raw: string | undefined, fallback = true): boolean {
  if (raw === undefined) return fallback;
  const lowered = raw.trim().toLowerCase();
  if (lowered === 'false' || lowered === '0' || lowered === 'no' || lowered === 'ні') return false;
  if (lowered === 'true' || lowered === '1' || lowered === 'yes' || lowered === 'так') return true;
  return fallback;
}

function buildCategoryPath(
  catId: string | undefined,
  categoryMap: Map<string, { name: string; parentId?: string }>,
): string | null {
  if (!catId) return null;
  const segments: string[] = [];
  const visited = new Set<string>();
  let currentId: string | undefined = catId;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const entry = categoryMap.get(currentId);
    if (!entry) break;
    segments.unshift(entry.name);
    currentId = entry.parentId;
  }

  return segments.length > 0 ? segments.join(' > ') : null;
}

/**
 * Parses a standard Ukrainian YML/XML e-commerce product feed (`<yml_catalog><shop>...`)
 * as well as simpler `<items>/<item>` or `<products>/<product>` XML catalogs.
 */
export function parseXmlFeed(
  xmlContent: string,
  options: XmlFeedParseOptions = {},
): XmlFeedParseResult {
  const trimmed = xmlContent.trim();
  if (!trimmed || !trimmed.includes('<')) {
    throw new Error('Invalid XML/YML feed: empty or missing XML tags');
  }

  const doc = parseXmlDocument(trimmed);
  const warnings: string[] = [];

  const catalogNode = findChild(doc, 'yml_catalog', 'price', 'catalog', 'feed', 'rss');
  const shopNode =
    findChild(catalogNode, 'shop', 'channel') ??
    findChild(doc, 'shop') ??
    catalogNode ??
    doc;

  const rawShopName =
    options.shopName ??
    childText(shopNode, 'name', 'company', 'title') ??
    'XML Feed Shop';
  const shopName = cleanText(rawShopName) || 'XML Feed Shop';
  const shopSlug = slugify(options.shopSlug ?? shopName, 'xml-feed-shop');
  const shopBaseUrl =
    options.shopBaseUrl ??
    childText(shopNode, 'url', 'link') ??
    'https://velodruh.ua';
  const generatedAt = catalogNode?.attrs['date'] ?? null;

  // Currencies: <currencies><currency id="USD" rate="41.5"/></currencies>
  const currencyRates: Record<string, number> = { UAH: 1 };
  const currenciesNode = findChild(shopNode, 'currencies');
  for (const curNode of findChildren(currenciesNode, 'currency')) {
    const id = (curNode.attrs['id'] ?? '').trim().toUpperCase();
    const rateRaw = curNode.attrs['rate'];
    if (!id || !rateRaw) continue;
    const rate = Number.parseFloat(rateRaw.replace(',', '.'));
    if (Number.isFinite(rate) && rate > 0) {
      currencyRates[id] = rate;
    }
  }

  // Categories: <categories><category id="1" parentId="0">Велосипеди</category></categories>
  const categoryMap = new Map<string, { name: string; parentId?: string }>();
  const categoriesNode = findChild(shopNode, 'categories');
  for (const catNode of findChildren(categoriesNode, 'category')) {
    const id = (catNode.attrs['id'] ?? '').trim();
    const name = cleanText(catNode.text);
    if (!id || !name) continue;
    const parentId = (catNode.attrs['parentId'] ?? catNode.attrs['parentid'] ?? '').trim() || undefined;
    categoryMap.set(id, { name, ...(parentId ? { parentId } : {}) });
  }

  // Offers container: <offers><offer ...> or <items><item> or <products><product>
  const offersContainer =
    findChild(shopNode, 'offers', 'items', 'products') ?? shopNode;
  const offerNodes = findChildren(offersContainer, 'offer', 'item', 'product');

  if (offerNodes.length === 0) {
    warnings.push('No <offer>, <item>, or <product> nodes found in XML feed');
  }

  const collectedAt = options.collectedAt ?? new Date().toISOString();
  const listings: RawListing[] = [];

  for (let i = 0; i < offerNodes.length; i += 1) {
    const offer = offerNodes[i]!;
    const externalId =
      offer.attrs['id'] ??
      childText(offer, 'id', 'sku', 'vendorcode', 'barcode') ??
      `row-${i + 1}`;

    const attributes: Record<string, string> = {};
    for (const param of findChildren(offer, 'param', 'attribute', 'feature')) {
      const paramName = cleanText(param.attrs['name'] ?? param.attrs['key']);
      const unit = cleanText(param.attrs['unit']);
      const paramVal = cleanText(param.text);
      if (paramName && paramVal) {
        const composed = unit ? `${paramVal} ${unit}` : paramVal;
        attributes[paramName] = attributes[paramName]
          ? `${attributes[paramName]}, ${composed}`
          : composed;
      }
    }

    const vendor = childText(offer, 'vendor', 'brand', 'manufacturer');
    const model = childText(offer, 'model');
    const typePrefix = childText(offer, 'typeprefix');
    const explicitName = childText(offer, 'name', 'title', 'name_ua');

    const title =
      cleanText(explicitName) ||
      cleanText([typePrefix, vendor, model].filter(Boolean).join(' '));

    if (!title) {
      warnings.push(`Skipped offer "${externalId}": missing <name>/<title>`);
      continue;
    }

    const productUrl = cleanText(childText(offer, 'url', 'link') ?? '');
    if (!productUrl) {
      warnings.push(`Skipped offer "${externalId}": missing <url>`);
      continue;
    }

    const rawPrice = childText(offer, 'price', 'priceuah', 'price_uah');
    const rawOldPrice = childText(offer, 'oldprice', 'price_old', 'old_price');
    const currency = (childText(offer, 'currencyid', 'currency') ?? 'UAH').toUpperCase();

    const rate = currencyRates[currency];
    let convertedPrice: number | string | null = rawPrice ?? null;
    let convertedOldPrice: number | string | null = rawOldPrice ?? null;
    let finalCurrency = currency;

    // When a feed declares a custom exchange rate (e.g. USD rate="42"), apply it here
    if (currency !== 'UAH' && rate !== undefined && rate > 0 && rawPrice) {
      const num = Number.parseFloat(rawPrice.replace(',', '.').replace(/\s+/g, ''));
      if (Number.isFinite(num) && num > 0) {
        convertedPrice = Math.round(num * rate);
        finalCurrency = 'UAH';
      }
      if (rawOldPrice) {
        const oldNum = Number.parseFloat(rawOldPrice.replace(',', '.').replace(/\s+/g, ''));
        if (Number.isFinite(oldNum) && oldNum > 0) {
          convertedOldPrice = Math.round(oldNum * rate);
        }
      }
    }

    const categoryId = childText(offer, 'categoryid', 'category_id');
    const categoryRaw =
      buildCategoryPath(categoryId, categoryMap) ??
      childText(offer, 'category', 'category_name') ??
      typePrefix ??
      null;

    const picture = childText(offer, 'picture', 'image', 'image_url') ?? null;
    const description = childText(offer, 'description', 'description_ua') ?? null;

    const availableAttr = offer.attrs['available'] ?? childText(offer, 'available', 'in_stock', 'stock');
    const stockQuantityRaw = childText(offer, 'stock_quantity', 'quantity_in_stock');
    let inStock = parseBoolFlag(availableAttr, true);
    if (stockQuantityRaw !== undefined) {
      const qty = Number.parseInt(stockQuantityRaw, 10);
      if (Number.isFinite(qty) && qty <= 0) {
        inStock = false;
      }
    }

    const condition = childText(offer, 'state', 'condition') ?? 'new';
    const sizeRaw =
      attributes['Розмір рами'] ??
      attributes['Размер рамы'] ??
      attributes['Розмір'] ??
      attributes['Size'] ??
      childText(offer, 'size');

    const modelYear =
      attributes['Рік випуску'] ??
      attributes['Год выпуска'] ??
      attributes['Рік'] ??
      childText(offer, 'year', 'model_year');

    listings.push({
      source: 'xml_feed',
      externalId,
      shopSlug,
      shopName,
      shopBaseUrl,
      title,
      brand: vendor ?? null,
      model: model ?? null,
      categoryRaw,
      price: convertedPrice,
      oldPrice: convertedOldPrice,
      currency: finalCurrency,
      inStock,
      condition,
      city: null,
      productUrl,
      imageUrl: picture,
      description,
      modelYear: modelYear ?? null,
      sizeRaw: sizeRaw ?? null,
      attributes,
      collectedAt,
    });
  }

  return {
    shopName,
    shopSlug,
    shopBaseUrl,
    generatedAt,
    currencyRates,
    categoriesCount: categoryMap.size,
    listings,
    warnings,
  };
}

/** Reads and parses a local XML/YML feed file. */
export async function parseXmlFeedFile(
  filePath: string,
  options: XmlFeedParseOptions = {},
): Promise<XmlFeedParseResult> {
  const xml = await readFile(filePath, 'utf8');
  return parseXmlFeed(xml, options);
}

/** Downloads and parses a remote HTTP/HTTPS XML/YML feed with timeout & byte-size limits. */
export async function fetchAndParseXmlFeed(
  url: string,
  options: XmlFetchOptions = {},
): Promise<XmlFeedParseResult> {
  const fetchFn = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchFn(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/xml, text/xml, */*;q=0.8',
        'User-Agent': 'VeloDruh-ETL/1.0 (+https://velodruh.ua)',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch XML feed "${url}": HTTP ${response.status} ${response.statusText}`);
    }

    const contentLength = response.headers.get('content-length');
    if (contentLength && Number.parseInt(contentLength, 10) > maxBytes) {
      throw new Error(`XML feed "${url}" exceeds max size of ${maxBytes} bytes`);
    }

    const xml = await response.text();
    if (Buffer.byteLength(xml, 'utf8') > maxBytes) {
      throw new Error(`XML feed "${url}" payload exceeds max size of ${maxBytes} bytes`);
    }

    return parseXmlFeed(xml, options);
  } finally {
    clearTimeout(timer);
  }
}
