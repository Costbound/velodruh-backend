import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchHotlineListings } from '../src/etl/sources/hotline.parser.js';
import { fetchOlxListings } from '../src/etl/sources/olx.parser.js';
import { fetchPromListings } from '../src/etl/sources/prom.parser.js';
import {
  CreditBudgetExceededError,
  loadSnapshotRecords,
  ReefApiClient,
} from '../src/etl/sources/reefapi.client.js';
import { fetchRozetkaListings } from '../src/etl/sources/rozetka.parser.js';

describe('ReefAPI Client Guardrails & Marketplace Parsers', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'velodruh-reefapi-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('dry-run mode estimates credit costs and NEVER performs HTTP requests', async () => {
    let called = 0;
    const fakeFetch = (async () => {
      called += 1;
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    const client = new ReefApiClient({
      dryRun: true,
      maxCredits: 50,
      fetchImpl: fakeFetch,
    });

    const olx = await fetchOlxListings(client, { queries: ['велосипед гравійний', 'велосипед гірський'] });
    const prom = await fetchPromListings(client, { queries: ['велосипед гравійний'] });
    const rozetka = await fetchRozetkaListings(client, { queries: ['велосипед гравійний'] });

    expect(olx).toEqual([]);
    expect(prom).toEqual([]);
    expect(rozetka).toEqual([]);
    expect(called).toBe(0);

    const stats = client.getStats();
    // 2*1 (olx) + 1*2 (prom) + 1*3 (rozetka) = 7 estimated credits, 0 spent!
    expect(stats.creditsEstimated).toBe(7);
    expect(stats.creditsSpent).toBe(0);
    expect(stats.liveRequests).toBe(0);
    expect(stats.plannedCalls).toHaveLength(4);
  });

  it('enforces maxCredits ceiling BEFORE sending the HTTP request', async () => {
    let calls = 0;
    const fakeFetch = (async () => {
      calls += 1;
      return new Response(
        JSON.stringify({ ok: true, data: { offers: [], has_more: false }, meta: { credits: 1 } }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const client = new ReefApiClient({
      apiKey: 'test-key-never-real',
      maxCredits: 2,
      requestDelayMs: 0,
      fetchImpl: fakeFetch,
    });

    // Costs 1 credit -> allowed (1/2)
    await client.call('olx', 'search', { query: 'gravel', country: 'ua' });
    // Costs 3 credits -> would exceed maxCredits=2 -> blocked BEFORE hitting network!
    await expect(
      client.call('rozetka', 'search', { query: 'gravel' }),
    ).rejects.toThrow(CreditBudgetExceededError);

    expect(calls).toBe(1);
    expect(client.getStats().creditsSpent).toBe(1);
  });

  it('refunds reserved credits when ReefAPI call fails (`ok: false` / HTTP error)', async () => {
    const fakeFetch = (async () =>
      new Response(
        JSON.stringify({ ok: false, error: { code: 'UPSTREAM_BLOCKED', message: 'Temp block' } }),
        { status: 200 },
      )) as unknown as typeof fetch;

    const client = new ReefApiClient({
      apiKey: 'test-key-never-real',
      maxCredits: 5,
      maxRetries: 0,
      requestDelayMs: 0,
      snapshotDir: tempDir,
      fetchImpl: fakeFetch,
    });

    await expect(client.call('prom-ua', 'search', { query: 'test' })).rejects.toThrow(/Temp block/);
    expect(client.getStats().creditsSpent).toBe(0);
    expect(client.getStats().failedRequests).toBe(1);
    expect(client.getStats().savedSnapshots).toHaveLength(0);
  });

  it('caches successful ReefAPI responses on disk and replays subsequent calls for 0 credits', async () => {
    let networkCalls = 0;
    const fakeFetch = (async () => {
      networkCalls += 1;
      return new Response(
        JSON.stringify({
          ok: true,
          meta: { credits: 1 },
          data: {
            has_more: false,
            offers: [
              {
                id: 12345,
                title: 'Велосипед Pride Rocx 8.2 2025 M',
                url: 'https://www.olx.ua/d/uk/obyavlenie/12345.html',
                price: { value: 28000, currency: 'UAH' },
                condition: 'used',
                location: { city: { name: 'Київ' } },
                photos: [{ url: 'https://olx.ua/p1.jpg' }],
                params: [
                  { name: 'Стан', value: { label: 'Вживане' } },
                  { name: 'Розмір рами', value: 'M' },
                ],
              },
            ],
          },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    // 1st run hits mocked API once and saves snapshot
    const client1 = new ReefApiClient({
      apiKey: 'test-key-never-real',
      maxCredits: 10,
      snapshotDir: tempDir,
      requestDelayMs: 0,
      fetchImpl: fakeFetch,
    });
    const first = await fetchOlxListings(client1, { queries: ['pride rocx'] });
    expect(first).toHaveLength(1);
    expect(first[0]!.city).toBe('Київ');
    expect(first[0]!.price).toBe(28000);
    expect(networkCalls).toBe(1);
    expect(client1.getStats().creditsSpent).toBe(1);

    // 2nd run replays from disk cache with ZERO network calls & ZERO credits spent!
    const client2 = new ReefApiClient({
      apiKey: 'test-key-never-real',
      maxCredits: 10,
      snapshotDir: tempDir,
      requestDelayMs: 0,
      fetchImpl: fakeFetch,
    });
    const second = await fetchOlxListings(client2, { queries: ['pride rocx'] });
    expect(second).toHaveLength(1);
    expect(networkCalls).toBe(1);
    expect(client2.getStats().cacheHits).toBe(1);
    expect(client2.getStats().creditsSpent).toBe(0);

    const saved = await loadSnapshotRecords(tempDir);
    expect(saved).toHaveLength(1);
    expect(saved[0]!.engine).toBe('olx');
  });

  it('parses OLX, Prom.ua, Rozetka, and Hotline.ua documented response shapes accurately', async () => {
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};

      if (url.endsWith('/prom-ua/v1/search')) {
        return new Response(
          JSON.stringify({
            ok: true,
            meta: { credits: 2 },
            data: {
              has_more: false,
              results: [
                {
                  product_id: '3026527730',
                  name: 'Велосипед гравійний Merida Silex 400 2025 L',
                  url: 'https://prom.ua/ua/p3026527730-merida-silex.html',
                  image: 'https://images.prom.ua/silex.jpg',
                  price: 58500,
                  price_old: 61000,
                  currency: 'UAH',
                  in_stock: true,
                  brand: 'Merida',
                  seller: {
                    seller_id: '555',
                    name: 'VeloMarket',
                    url: 'https://velomarket.prom.ua',
                    city: 'Львів',
                  },
                  weak_match: false,
                },
                {
                  product_id: '999',
                  name: 'Weak noise item',
                  url: 'https://prom.ua/p999.html',
                  price: 1000,
                  weak_match: true,
                },
              ],
            },
          }),
          { status: 200 },
        );
      }

      if (url.endsWith('/prom-ua/v1/product')) {
        return new Response(
          JSON.stringify({
            ok: true,
            meta: { credits: 1 },
            data: {
              item: {
                product_id: body.product_id,
                name: 'Велосипед гравійний Merida Silex 400 2025 L',
                url: 'https://prom.ua/ua/p3026527730-merida-silex.html',
                price: 58500,
                price_old: 61000,
                currency: 'UAH',
                in_stock: true,
                brand: 'Merida',
                seller: { seller_id: '555', name: 'VeloMarket', city: 'Львів' },
                attributes: [
                  { group: 'Основні', name: 'Розмір рами', value: 'L (53 см)' },
                  { group: 'Основні', name: 'Рік випуску', value: '2025' },
                ],
              },
            },
          }),
          { status: 200 },
        );
      }

      if (url.endsWith('/rozetka/v1/search')) {
        return new Response(
          JSON.stringify({
            ok: true,
            meta: { credits: 3 },
            data: {
              has_more: false,
              results: [
                {
                  product_id: '621368348',
                  title: 'Велосипед Cannondale Topstone 3 28" 2025 M',
                  url: 'https://rozetka.com.ua/p621368348/',
                  brand: 'Cannondale',
                  price: 47900,
                  old_price: 51200,
                  currency: 'UAH',
                  in_stock: true,
                  sold_by: 'rozetka',
                  condition: 'new',
                  category: { id: '83884', title: 'Гравійні велосипеди' },
                  short_specs: 'Рама: алюміній; Shimano Sora 2x9; диски механічні',
                  image: 'https://content.rozetka.com.ua/topstone.jpg',
                },
              ],
            },
          }),
          { status: 200 },
        );
      }

      if (url.endsWith('/hotline-ua/v1/category')) {
        return new Response(
          JSON.stringify({
            ok: true,
            meta: { credits: 2 },
            data: {
              has_more: false,
              results: [
                {
                  product_id: '24927903',
                  title: 'Trek Marlin 7 Gen 3 2025',
                  product_path: '/sport-turizm/velosipedy/trek-marlin-7-gen-3/',
                  brand: 'Trek',
                  category_path: 'Велосипеди > Гірські',
                  lowest_price: 41900,
                  highest_price: 44500,
                  currency: 'UAH',
                  shop_name: 'Veloonline',
                  image: 'https://hotline.ua/img/marlin.jpg',
                },
              ],
            },
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ ok: false, error: { message: `Unhandled ${url}` } }), {
        status: 404,
      });
    }) as unknown as typeof fetch;

    const client = new ReefApiClient({
      apiKey: 'test-key-never-real',
      maxCredits: 20,
      requestDelayMs: 0,
      fetchImpl: fakeFetch,
    });

    const promItems = await fetchPromListings(client, {
      queries: ['велосипед гравійний'],
      enrichDetailsLimit: 1,
    });
    expect(promItems).toHaveLength(1); // weak_match dropped
    expect(promItems[0]!.attributes?.['Розмір рами']).toBe('L (53 см)');
    expect(promItems[0]!.city).toBe('Львів');

    const rozetkaItems = await fetchRozetkaListings(client, {
      queries: ['велосипед гравійний'],
    });
    expect(rozetkaItems).toHaveLength(1);
    expect(rozetkaItems[0]!.shopSlug).toBe('rozetka');
    expect(rozetkaItems[0]!.price).toBe(47900);

    const hotlineItems = await fetchHotlineListings(client, {
      category: 'velosipedy',
    });
    expect(hotlineItems).toHaveLength(1);
    expect(hotlineItems[0]!.productUrl).toBe(
      'https://hotline.ua/sport-turizm/velosipedy/trek-marlin-7-gen-3/',
    );
    expect(hotlineItems[0]!.price).toBe(41900);

    // 2 (prom search) + 1 (prom product) + 3 (rozetka search) + 2 (hotline category) = 8 credits
    expect(client.getStats().creditsSpent).toBe(8);
  });
});
