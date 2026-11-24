import {
  buildBikeSlug,
  buildDedupKey,
  cleanModelName,
  extractModelYear,
  isAccessoryOrNonBike,
  normalizeBrand,
  normalizeCategory,
  normalizeFrameSize,
  normalizeListing,
  normalizeListings,
  parsePriceToUah,
  slugify,
} from '../src/etl/normalizers/index.js';
import type { RawListing } from '../src/etl/types.js';

describe('ETL Normalizers', () => {
  describe('slugify & parsePriceToUah', () => {
    it('transliterates Ukrainian Cyrillic to valid lowercase ASCII slugs', () => {
      expect(slugify('Велосипед Прайд Rocx 8.2')).toMatch(/^[a-z0-9-]+$/);
      expect(slugify('Pride Rocx 8.2 2025')).toBe('pride-rocx-8-2-2025');
      expect(slugify('Велопланета Київ')).toBe('veloplaneta-kyyiv');
    });

    it('parses formatted UAH, USD, and EUR price strings accurately', () => {
      expect(parsePriceToUah('33 900 грн')).toBe(33900);
      expect(parsePriceToUah('33,900.00')).toBe(33900);
      expect(parsePriceToUah('33.900')).toBe(33900);
      expect(parsePriceToUah('33900,50 грн')).toBe(33901);
      expect(parsePriceToUah(1000, 'USD', { USD: 41.5 })).toBe(41500);
      expect(parsePriceToUah('€800', undefined, { EUR: 44.5 })).toBe(35600);
      expect(parsePriceToUah(0)).toBeNull();
      expect(parsePriceToUah('договірна')).toBeNull();
    });
  });

  describe('normalizeBrand', () => {
    it('normalizes Latin, Cyrillic, and noisy brand names to canonical slugs', () => {
      expect(normalizeBrand('ПРАЙД')).toMatchObject({ slug: 'pride', name: 'Pride', country: 'Ukraine' });
      expect(normalizeBrand('Pride Bikes')).toMatchObject({ slug: 'pride', name: 'Pride' });
      expect(normalizeBrand('Меріда')).toMatchObject({ slug: 'merida', name: 'Merida' });
      expect(normalizeBrand('Канондейл')).toMatchObject({ slug: 'cannondale', name: 'Cannondale' });
      expect(normalizeBrand('Келліс')).toMatchObject({ slug: 'kellys', name: 'Kellys' });
      expect(normalizeBrand('GT Bicycles')).toMatchObject({ slug: 'gt', name: 'GT' });
      expect(normalizeBrand('TREK')).toMatchObject({ slug: 'trek', name: 'Trek', country: 'USA' });
    });

    it('extracts known brand from listing title when explicit vendor is missing', () => {
      const fromTitle = normalizeBrand(null, 'Продам гравійний велосипед Merida Silex 400 M 2024');
      expect(fromTitle.slug).toBe('merida');
      expect(fromTitle.name).toBe('Merida');
      expect(fromTitle.detectedFromTitle).toBe(true);

      const unknown = normalizeBrand('Custom Atelier', 'Custom Atelier Bike');
      expect(unknown.slug).toBe('custom-atelier');
      expect(unknown.name).toBe('Custom Atelier');
      expect(unknown.detectedFromTitle).toBe(false);
    });
  });

  describe('normalizeCategory', () => {
    it('maps MTB, road, gravel, touring, city, and hybrid Ukrainian/Russian/English terms', () => {
      expect(normalizeCategory({ rawCategory: 'Гравійні велосипеди' }).category).toBe('GRAVEL');
      expect(normalizeCategory({ title: 'Шосейник Merida Scultura Endurance 300' }).category).toBe('ROAD');
      expect(normalizeCategory({ rawCategory: 'Горные велосипеды MTB' }).category).toBe('MTB_HARDTAIL');
      expect(normalizeCategory({ title: 'Велосипед міський Cannondale Quick 4' }).category).toBe('CITY_COMMUTER');
      expect(normalizeCategory({ title: 'Pride Rocx Tour 2025' }).category).toBe('TOURING');
      expect(normalizeCategory({ rawCategory: 'Кросовий гібрид' }).category).toBe('HYBRID');
    });

    it('uses well-known model hints when category is omitted (OLX titles)', () => {
      expect(normalizeCategory({ title: 'Merida Silex 400 2025' }).category).toBe('GRAVEL');
      expect(normalizeCategory({ title: 'Trek Marlin 7 Gen 3 2025' }).category).toBe('MTB_HARDTAIL');
      expect(normalizeCategory({ title: 'Kellys Phanatic 30 2025' }).category).toBe('HYBRID');
    });
  });

  describe('normalizeFrameSize', () => {
    it('normalizes letter labels, Cyrillic lookalikes, cm, mm, inches, and height ranges', () => {
      expect(normalizeFrameSize({ rawSize: 'XS', category: 'GRAVEL' }).sizeLabel).toBe('XS');
      expect(normalizeFrameSize({ rawSize: 'М', category: 'GRAVEL' }).sizeLabel).toBe('M');
      expect(normalizeFrameSize({ rawSize: 'L/XL', category: 'MTB_HARDTAIL' }).sizeLabel).toBe('XL');
      expect(normalizeFrameSize({ rawSize: '54 см', category: 'ROAD' })).toMatchObject({
        sizeLabel: 'M',
        numericSizeCm: 54,
        confidence: 'EXACT',
      });
      expect(normalizeFrameSize({ rawSize: '570 мм', category: 'GRAVEL' })).toMatchObject({
        sizeLabel: 'L',
        numericSizeCm: 57,
      });
      expect(normalizeFrameSize({ rawSize: '19.5"', category: 'MTB_HARDTAIL' })).toMatchObject({
        sizeLabel: 'L',
        numericSizeCm: 50,
      });
      expect(normalizeFrameSize({ rawSize: '16"', category: 'MTB_HARDTAIL' }).sizeLabel).toBe('S');
      expect(normalizeFrameSize({ rawSize: '21"', category: 'MTB_HARDTAIL' }).sizeLabel).toBe('XL');
      expect(normalizeFrameSize({ rawSize: 'на зріст 178-190 см', category: 'HYBRID' })).toMatchObject({
        sizeLabel: 'L',
        minRiderHeightCm: 178,
        maxRiderHeightCm: 190,
      });
    });

    it('does not confuse 29"/28" wheel diameter with frame size', () => {
      const mtb = normalizeFrameSize({
        title: 'Велосипед гірський Trek Marlin 7 29" рама 17.5" 2025',
        category: 'MTB_HARDTAIL',
      });
      expect(mtb.sizeLabel).toBe('M');
      expect(mtb.confidence).toBe('EXACT');

      const noSize = normalizeFrameSize({
        title: 'Велосипед гірський Trek Marlin 7 29" 2025',
        category: 'MTB_HARDTAIL',
      });
      expect(noSize.sizeLabel).toBe('M');
      expect(noSize.confidence).toBe('FALLBACK');
    });
  });

  describe('cleanModelName, extractModelYear & accessory filter', () => {
    it('reduces noisy multi-marketplace titles for the same model to one canonical key', () => {
      const year = 2025;
      const a = cleanModelName({
        title: 'Велосипед гравійний PRIDE Rocx 8.2 28" M (2025) чорний матовий',
        brandName: 'Pride',
        brandSlug: 'pride',
        modelYear: year,
      });
      const b = cleanModelName({
        title: 'ПРАЙД ROCX 8,2 2025 р. рама 54 см',
        brandName: 'Pride',
        brandSlug: 'pride',
        modelYear: year,
      });
      const c = cleanModelName({
        title: 'Гравійник Pride Rocx 8.2 L 2025 б/у в ідеальному стані',
        brandName: 'Pride',
        brandSlug: 'pride',
        modelYear: year,
      });

      expect(a.modelSlug).toBe('rocx-8-2');
      expect(b.modelSlug).toBe('rocx-8-2');
      expect(c.modelSlug).toBe('rocx-8-2');
      expect(buildDedupKey('pride', a.modelSlug, 2025)).toBe('pride::rocx-8-2::2025');
      expect(buildBikeSlug('pride', a.modelSlug, 2025)).toBe('pride-rocx-8-2-2025');
    });

    it('extracts model year from attributes, title, or URL', () => {
      expect(
        extractModelYear({
          attributes: { 'Рік випуску': '2024 рік' },
          defaultYear: 2026,
        }),
      ).toEqual({ year: 2024, detected: true });
      expect(
        extractModelYear({
          title: 'Trek Marlin 7 Gen 3 (2025)',
          defaultYear: 2026,
        }),
      ).toEqual({ year: 2025, detected: true });
      expect(
        extractModelYear({
          productUrl: 'https://shop.ua/bikes/merida-silex-400-2023/',
          defaultYear: 2026,
        }),
      ).toEqual({ year: 2023, detected: true });
      expect(
        extractModelYear({
          title: 'Merida Silex 400',
          defaultYear: 2025,
        }),
      ).toEqual({ year: 2025, detected: false });
    });

    it('filters out bike helmets, pumps, spare parts, and scooters', () => {
      expect(isAccessoryOrNonBike('Велошолом Bell Avenue Mips M')).toBe(true);
      expect(isAccessoryOrNonBike('Покришка Schwalbe Marathon 700x38c')).toBe(true);
      expect(isAccessoryOrNonBike('Насос підлоговий Lezyne')).toBe(true);
      expect(isAccessoryOrNonBike('Електросамокат Xiaomi Pro 2')).toBe(true);
      expect(isAccessoryOrNonBike('Велосипед гравійний Pride Rocx 8.2 2025')).toBe(false);
    });
  });

  describe('normalizeListing / normalizeListings', () => {
    it('validates complete listing and rejects invalid/accessory entries cleanly', () => {
      const validRaw: RawListing = {
        source: 'xml_feed',
        externalId: '1',
        shopSlug: 'velogo',
        shopName: 'Velogo',
        shopBaseUrl: 'https://velogo.com.ua',
        title: 'Велосипед гравійний Merida Silex 400 28" 2025 M синій',
        brand: 'MERIDA',
        categoryRaw: 'Гравійні велосипеди',
        price: 58900,
        oldPrice: 62000,
        currency: 'UAH',
        inStock: true,
        productUrl: 'https://velogo.com.ua/ua/merida-silex-400?utm_source=xml&color=blue',
        attributes: {
          'Розмір рами': 'M (50 см)',
          'Тип гальм': 'Гідравлічні дискові Shimano GRX',
          'Трансмісія': 'Shimano GRX 400 2x10',
          'Матеріал рами': 'Алюміній (карбонова вилка)',
          'Вага': '10.6 кг',
        },
      };

      const helmetRaw: RawListing = {
        ...validRaw,
        externalId: '2',
        title: 'Велошолом Giro Fixture',
        price: 2500,
      };

      const cheapRaw: RawListing = {
        ...validRaw,
        externalId: '3',
        title: 'Велосипед старий дитячий',
        price: 500,
      };

      const single = normalizeListing(validRaw, { nowIso: '2026-11-24T10:00:00Z' });
      expect(single.ok).toBe(true);
      if (single.ok) {
        expect(single.value.dedupKey).toBe('merida::silex-400::2025');
        expect(single.value.category).toBe('GRAVEL');
        expect(single.value.brakeType).toBe('HYDRAULIC_DISC');
        expect(single.value.frameMaterial).toBe('ALUMINUM');
        expect(single.value.weightKg).toBe(10.6);
        expect(single.value.size.sizeLabel).toBe('M');
        expect(single.value.offer.productUrl).toBe('https://velogo.com.ua/ua/merida-silex-400?color=blue');
        expect(single.value.offer.affiliateUrl).toContain('utm_source=velodruh');
      }

      const batch = normalizeListings([validRaw, helmetRaw, cheapRaw], { minPriceUah: 2000 });
      expect(batch.normalized).toHaveLength(1);
      expect(batch.rejected).toHaveLength(2);
      expect(batch.rejected.map((r) => r.reason)).toEqual([
        'ACCESSORY_OR_PART',
        'PRICE_OUT_OF_RANGE',
      ]);
    });
  });
});
