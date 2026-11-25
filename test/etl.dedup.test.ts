import { deduplicateListings } from '../src/etl/dedup/deduplicator.js';
import { normalizeListings } from '../src/etl/normalizers/index.js';
import type { RawListing } from '../src/etl/types.js';

describe('ETL Deduplicator (Brand + Model + Year)', () => {
  it('merges duplicate listings across XML feed, Rozetka, Prom.ua, and OLX into one canonical bike', () => {
    const raw: RawListing[] = [
      // B2C XML feed (rich metadata, size M)
      {
        source: 'xml_feed',
        externalId: 'xml-1',
        shopSlug: 'velogo',
        shopName: 'Velogo',
        shopBaseUrl: 'https://velogo.com.ua',
        title: 'Велосипед гравійний PRIDE Rocx 8.2 28" 2025 M чорний',
        brand: 'PRIDE',
        categoryRaw: 'Гравійні велосипеди',
        price: 33900,
        oldPrice: 36500,
        currency: 'UAH',
        inStock: true,
        productUrl: 'https://velogo.com.ua/ua/pride-rocx-8-2?utm_source=xml',
        imageUrl: 'https://velogo.com.ua/img/rocx.jpg',
        description: 'Повний опис гравійного велосипеда Pride Rocx 8.2 з бонками під багажник і крила.',
        attributes: {
          'Розмір рами': 'M (54 см)',
          'Рік випуску': '2025',
          'Тип гальм': 'Механічні дискові TRP Spyre',
          'Трансмісія': 'Shimano Sora 2x9',
          'Вага': '11.4 кг',
        },
        collectedAt: '2026-11-24T09:00:00Z',
      },
      // Duplicate exact same offer (re-scraped with different UTM + fresher price)
      {
        source: 'xml_feed',
        externalId: 'xml-1-dup',
        shopSlug: 'velogo',
        shopName: 'Velogo',
        shopBaseUrl: 'https://velogo.com.ua',
        title: 'Pride Rocx 8.2 2025 M',
        brand: 'Pride',
        categoryRaw: 'Gravel',
        price: 33500,
        oldPrice: 36500,
        currency: 'UAH',
        inStock: true,
        productUrl: 'https://velogo.com.ua/ua/pride-rocx-8-2?utm_campaign=blackfriday',
        collectedAt: '2026-11-24T12:00:00Z',
      },
      // Rozetka listing for the SAME bike, size L
      {
        source: 'rozetka',
        externalId: 'rz-42',
        shopSlug: 'rozetka',
        shopName: 'Rozetka',
        shopBaseUrl: 'https://rozetka.com.ua',
        title: 'Велосипед Pride ROCX 8,2 (2025) 28" L',
        brand: 'Pride',
        categoryRaw: 'Велосипеди > Гравійні',
        price: 34200,
        currency: 'UAH',
        inStock: true,
        productUrl: 'https://rozetka.com.ua/p42/',
        sizeRaw: 'L',
        collectedAt: '2026-11-24T10:00:00Z',
      },
      // Used OLX listing for the SAME bike, size M (no explicit brand/weight/category)
      {
        source: 'olx',
        externalId: 'olx-999',
        shopSlug: 'olx-ua',
        shopName: 'OLX (Київ)',
        shopBaseUrl: 'https://www.olx.ua',
        title: 'Продам гравійник ПРАЙД Rocx 8.2 2025 р. рама 54 см в ідеальному стані',
        price: '26 500 грн',
        condition: 'used',
        city: 'Київ',
        productUrl: 'https://www.olx.ua/d/uk/obyavlenie/pride-rocx-8-2-999.html',
        collectedAt: '2026-11-24T10:30:00Z',
      },
      // Different model year (2024) -> MUST stay a SEPARATE bike record!
      {
        source: 'prom',
        externalId: 'prom-77',
        shopSlug: 'prom-bikestore',
        shopName: 'BikeStore (Prom.ua)',
        shopBaseUrl: 'https://prom.ua',
        title: 'Велосипед гравійний Pride Rocx 8.2 2024 M',
        brand: 'Pride',
        price: 29900,
        currency: 'UAH',
        productUrl: 'https://prom.ua/ua/p77-pride-rocx-8-2.html',
        collectedAt: '2026-11-24T10:00:00Z',
      },
    ];

    const { normalized, rejected } = normalizeListings(raw);
    expect(rejected).toHaveLength(0);
    expect(normalized).toHaveLength(5);

    const { bikes, stats } = deduplicateListings(normalized);

    expect(bikes).toHaveLength(2);
    expect(stats.inputListings).toBe(5);
    expect(stats.uniqueBikes).toBe(2);
    expect(stats.mergedBikeDuplicates).toBe(3);
    expect(stats.deduplicatedOffers).toBe(1);
    expect(stats.crossSourceMatches).toBe(1);

    const rocx2025 = bikes.find((b) => b.modelYear === 2025)!;
    expect(rocx2025.dedupKey).toBe('pride::rocx-8-2::2025');
    expect(rocx2025.slug).toBe('pride-rocx-8-2-2025');
    expect(rocx2025.category).toBe('GRAVEL');
    // Structured metadata preserved from XML feed despite noisy OLX listing
    expect(rocx2025.weightKg).toBe(11.4);
    expect(rocx2025.drivetrain).toBe('Shimano Sora 2x9');
    expect(rocx2025.brakeType).toBe('MECHANICAL_DISC');
    expect(rocx2025.sources).toEqual(expect.arrayContaining(['xml_feed', 'rozetka', 'olx']));
    expect(rocx2025.bestPriceUah).toBe(26500);

    // Should have 2 variants: M (2 offers: OLX + updated Velogo) and L (1 offer: Rozetka)
    expect(rocx2025.variants.map((v) => v.sizeLabel)).toEqual(['M', 'L']);
    const variantM = rocx2025.variants.find((v) => v.sizeLabel === 'M')!;
    expect(variantM.offers).toHaveLength(2);
    expect(variantM.offers[0]!.priceUah).toBe(26500); // OLX
    expect(variantM.offers[1]!.priceUah).toBe(33500); // Newer Velogo price replaced 33900

    const rocx2024 = bikes.find((b) => b.modelYear === 2024)!;
    expect(rocx2024.dedupKey).toBe('pride::rocx-8-2::2024');
    expect(rocx2024.slug).toBe('pride-rocx-8-2-2024');
  });

  it('prefers in-stock offers for bestPriceUah when cheaper offer is out of stock', () => {
    const raw: RawListing[] = [
      {
        source: 'xml_feed',
        externalId: 'a',
        shopSlug: 'shop-a',
        shopName: 'Shop A',
        shopBaseUrl: 'https://a.ua',
        title: 'Trek Marlin 7 2025 M',
        brand: 'Trek',
        price: 30000,
        inStock: false,
        productUrl: 'https://a.ua/marlin-7',
      },
      {
        source: 'xml_feed',
        externalId: 'b',
        shopSlug: 'shop-b',
        shopName: 'Shop B',
        shopBaseUrl: 'https://b.ua',
        title: 'Trek Marlin 7 2025 M',
        brand: 'Trek',
        price: 41900,
        inStock: true,
        productUrl: 'https://b.ua/marlin-7',
      },
    ];

    const { normalized } = normalizeListings(raw);
    const { bikes } = deduplicateListings(normalized);
    expect(bikes).toHaveLength(1);
    expect(bikes[0]!.bestPriceUah).toBe(41900);
  });
});
