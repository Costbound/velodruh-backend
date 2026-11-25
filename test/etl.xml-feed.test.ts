import { resolve } from 'node:path';
import {
  fetchAndParseXmlFeed,
  parseXmlFeed,
  parseXmlFeedFile,
} from '../src/etl/sources/xml-feed.parser.js';

describe('XML / YML Feed Parser', () => {
  it('parses the sample Ukrainian YML feed file including CDATA, entities, categories, params & USD rate', async () => {
    const fixturePath = resolve(process.cwd(), 'data/fixtures/sample-feed.yml');
    const result = await parseXmlFeedFile(fixturePath, {
      collectedAt: '2026-11-24T10:00:00Z',
    });

    expect(result.shopName).toBe('Velogo');
    expect(result.shopSlug).toBe('velogo');
    expect(result.shopBaseUrl).toBe('https://velogo.com.ua');
    expect(result.categoriesCount).toBe(6);
    expect(result.currencyRates).toEqual({ UAH: 1, USD: 41.5 });
    expect(result.listings).toHaveLength(5);

    const pride = result.listings[0]!;
    expect(pride.externalId).toBe('vg-101');
    expect(pride.categoryRaw).toBe('Велосипеди > Гравійні велосипеди');
    expect(pride.price).toBe('33900');
    expect(pride.oldPrice).toBe('36500');
    expect(pride.inStock).toBe(true);
    expect(pride.description).toContain('гравійник');
    expect(pride.attributes?.['Вага']).toBe('11.4 кг');
    expect(pride.sizeRaw).toBe('M (54 см)');

    // Offer vg-103 was priced 1000 USD -> converted at feed's rate 41.5 to 41500 UAH
    const trek = result.listings[2]!;
    expect(trek.currency).toBe('UAH');
    expect(trek.price).toBe(41500);
    expect(trek.description).toContain('RockShox Judy & трансмісією');

    // Offer vg-104 has available="false"
    const merida = result.listings[3]!;
    expect(merida.inStock).toBe(false);
  });

  it('handles UTF-8 BOM, comments, duplicate param names, stock_quantity=0, and missing URL warnings', () => {
    const xml = `\uFEFF<?xml version="1.0" encoding="utf-8"?>
    <!-- feed comment -->
    <yml_catalog date="2026-11-24">
      <shop>
        <name>VeloShop</name>
        <url>https://veloshop.ua</url>
        <offers>
          <offer id="ok-1" available="true">
            <name>Велосипед Cannondale Topstone 3 2025</name>
            <vendor>Cannondale</vendor>
            <url>https://veloshop.ua/topstone-3</url>
            <price>47900</price>
            <stock_quantity>0</stock_quantity>
            <param name="Колір">Чорний</param>
          </offer>
          <offer id="no-url" available="true">
            <name>Incomplete Offer</name>
            <price>15000</price>
          </offer>
        </offers>
      </shop>
    </yml_catalog>`;

    const parsed = parseXmlFeed(xml);
    expect(parsed.listings).toHaveLength(1);
    expect(parsed.listings[0]!.inStock).toBe(false);
    expect(parsed.warnings.some((w) => w.includes('no-url'))).toBe(true);
  });

  it('throws cleanly on empty or non-XML content', () => {
    expect(() => parseXmlFeed('not xml at all')).toThrow(/Invalid XML/);
    expect(() => parseXmlFeed('   ')).toThrow(/Invalid XML/);
  });

  it('fetches remote XML feeds and enforces HTTP status and maxBytes limits', async () => {
    const xmlBody = `<yml_catalog><shop><name>TestShop</name><offers><offer id="1"><name>Bike Trek Marlin 7 2025</name><price>39000</price><url>https://test.ua/1</url></offer></offers></shop></yml_catalog>`;
    const mockFetch = (async () =>
      new Response(xmlBody, { status: 200, headers: { 'content-type': 'application/xml' } })) as unknown as typeof fetch;

    const ok = await fetchAndParseXmlFeed('https://example.com/feed.xml', { fetchImpl: mockFetch });
    expect(ok.listings).toHaveLength(1);

    await expect(
      fetchAndParseXmlFeed('https://example.com/feed.xml', {
        fetchImpl: mockFetch,
        maxBytes: 10,
      }),
    ).rejects.toThrow(/exceeds max size/i);

    const errFetch = (async () =>
      new Response('Not Found', { status: 404, statusText: 'Not Found' })) as unknown as typeof fetch;
    await expect(
      fetchAndParseXmlFeed('https://example.com/missing.xml', { fetchImpl: errFetch }),
    ).rejects.toThrow(/HTTP 404/);
  });
});
