import type {
  BikeCategoryType,
  CalculatedFrameSize,
  RecommendedBikeItem,
  RequiredFeatureType,
  WizardEvaluateRequest,
  WizardEvaluateResponse,
  WizardMetaResponse,
} from '../schemas/wizard.schema.js';
import type { BikeDetailDto } from '../schemas/bike.schema.js';
import { CATALOG_BIKES } from './catalog.data.js';

const CATEGORY_METADATA: Record<
  BikeCategoryType,
  { displayName: string; defaultReasoning: string }
> = {
  GRAVEL: {
    displayName: 'Гравійний велосипед (Gravel)',
    defaultReasoning:
      'Ваш баланс асфальту та гравію ідеально покривається гравійником: жорстка вилка дає високий накат, а ширші покришки забезпечують комфорт і стабільність поза містом.',
  },
  ROAD: {
    displayName: 'Шосейний / Ендюранс велосипед (Road)',
    defaultReasoning:
      'Для переважного катання асфальтом та спортивних тренувань шосейник забезпечує максимальну швидкість, мінімальну вагу та високу ефективність педалювання.',
  },
  MTB_HARDTAIL: {
    displayName: 'Гірський хардтейл (MTB Hardtail)',
    defaultReasoning:
      'Висока частка лісового бездоріжжя та пересіченої місцевості вимагає амортизаційної вилки, широких покришок 29" та витривалої геометрії гірського хардтейла.',
  },
  CITY_COMMUTER: {
    displayName: 'Міський ком’ютер / фітнес-байк (City Commuter)',
    defaultReasoning:
      'Для щоденних поїздок містом найкраще підходить легкий ком’ютер із прямим кермом, оглядовою посадкою та кріпленнями під крила і багажник.',
  },
  TOURING: {
    displayName: 'Туринговий велосипед (Touring)',
    defaultReasoning:
      'Для тривалих подорожей і велотуризму з баулами туринговий велосипед пропонує максимальну вантажопідйомність, бонки під багажники та комфорт на далеких дистанціях.',
  },
  HYBRID: {
    displayName: 'Кросовий гібрид (Hybrid / Cross)',
    defaultReasoning:
      'Універсальний гібрид на 28" колесах з амортизаційною вилкою поєднує легкий хід на асфальті та комфорт на паркових і ґрунтових доріжках.',
  },
};

export function getWizardMeta(): WizardMetaResponse {
  return {
    heightRange: { min: 140, max: 215, unit: 'cm' },
    inseamRange: { min: 60, max: 110, unit: 'cm' },
    budgetLimits: {
      min: 10000,
      max: 200000,
      defaultMin: 25000,
      defaultMax: 55000,
      currency: 'UAH',
    },
    ridingSurfaces: [
      { id: 'asphalt', label: 'Асфальт і місто', icon: 'road' },
      { id: 'gravel', label: 'Гравій і ґрунтові стежки', icon: 'gravel' },
      { id: 'offroad', label: 'Лісове бездоріжжя / гори', icon: 'mountain' },
    ],
    ridingGoals: [
      { id: 'commuting', label: 'Щоденні поїздки на роботу / навчання' },
      { id: 'fitness', label: 'Спорт, фітнес і тренування' },
      { id: 'touring', label: 'Туризм і подорожі з баулами' },
      { id: 'recreation', label: 'Вихідні прогулянки в парку' },
    ],
    ridingPositions: [
      { id: 'SPORT', label: 'Спортивна (аеродинамічна)' },
      { id: 'COMFORTABLE', label: 'Збалансована (комфортна)' },
      { id: 'UPRIGHT', label: 'Вертикальна (оглядова)' },
    ],
    availableFeatures: [
      { id: 'RACK_MOUNTS', label: 'Кріплення для багажника' },
      { id: 'FENDER_MOUNTS', label: 'Кріплення для повнорозмірних крил' },
      { id: 'DISC_BRAKES', label: 'Дискові гальма' },
      { id: 'HYDRAULIC_BRAKES', label: 'Гідравлічні гальма' },
      { id: 'SUSPENSION_FORK', label: 'Амортизаційна вилка' },
    ],
  };
}

export function calculateFrameSize(heightCm: number, inseamCm?: number): CalculatedFrameSize {
  const effectiveInseam = inseamCm ?? Math.round(heightCm * 0.465);
  const rawFrameCm = Math.round(effectiveInseam * 0.65);

  let standardLabel: CalculatedFrameSize['standardLabel'];
  let numericSize: number;

  if (heightCm < 160) {
    standardLabel = 'XS';
    numericSize = Math.min(Math.max(rawFrameCm, 46), 49);
  } else if (heightCm < 170) {
    standardLabel = 'S';
    numericSize = Math.min(Math.max(rawFrameCm, 50), 52);
  } else if (heightCm < 181) {
    standardLabel = 'M';
    numericSize = Math.min(Math.max(rawFrameCm, 53), 55);
  } else if (heightCm < 191) {
    standardLabel = 'L';
    numericSize = Math.min(Math.max(rawFrameCm, 56), 58);
  } else {
    standardLabel = 'XL';
    numericSize = Math.min(Math.max(rawFrameCm, 59), 62);
  }

  const confidence: CalculatedFrameSize['confidence'] =
    inseamCm !== undefined ? 'HIGH' : 'MEDIUM';

  const inseamNote =
    inseamCm !== undefined
      ? ` та довжини ноги (inseam) ${inseamCm} см`
      : ' (на основі стандартних пропорцій тіла)';

  return {
    standardLabel,
    numericSize,
    unit: 'cm',
    confidence,
    sizeAdvice: `Для зросту ${heightCm} см${inseamNote} розмір ${standardLabel} (${numericSize} см) забезпечить правильний стендовер і баланс керованості.`,
  };
}

export function determineRecommendedCategory(usage: WizardEvaluateRequest['usage']): {
  type: BikeCategoryType;
  displayName: string;
  reasoning: string;
} {
  const { surfaceProportions, primaryGoal, ridingPosition, featuresRequired } = usage;

  if (surfaceProportions.offroad >= 40) {
    return {
      type: 'MTB_HARDTAIL',
      displayName: CATEGORY_METADATA.MTB_HARDTAIL.displayName,
      reasoning: `Частка бездоріжжя (${surfaceProportions.offroad}%) потребує амортизаційної вилки та чіпких покришок 29" для безпечного проходження коренів і лісових стежок.`,
    };
  }

  if (primaryGoal === 'touring' && featuresRequired.includes('RACK_MOUNTS')) {
    return {
      type: 'TOURING',
      displayName: CATEGORY_METADATA.TOURING.displayName,
      reasoning:
        'Для велотуризму з багажником найкраще підходить спеціалізований туринг або експедиційний гравійник із міцною рамою та бонками під баули.',
    };
  }

  if (surfaceProportions.asphalt >= 80 && primaryGoal === 'fitness' && ridingPosition === 'SPORT') {
    return {
      type: 'ROAD',
      displayName: CATEGORY_METADATA.ROAD.displayName,
      reasoning: `При ${surfaceProportions.asphalt}% асфальту та фокусі на фітнесі й швидкості ендюранс-шосейник дасть найкращу динаміку та мінімальну вагу.`,
    };
  }

  if (
    surfaceProportions.asphalt >= 75 &&
    (primaryGoal === 'commuting' || ridingPosition === 'UPRIGHT') &&
    !featuresRequired.includes('SUSPENSION_FORK')
  ) {
    return {
      type: 'CITY_COMMUTER',
      displayName: CATEGORY_METADATA.CITY_COMMUTER.displayName,
      reasoning: `Для міського трафіку (${surfaceProportions.asphalt}% асфальту) та оглядової посадки легкий сіті-ком’ютер із прямим кермом є найпрактичнішим вибором.`,
    };
  }

  if (
    featuresRequired.includes('SUSPENSION_FORK') ||
    (primaryGoal === 'recreation' && ridingPosition === 'UPRIGHT')
  ) {
    return {
      type: 'HYBRID',
      displayName: CATEGORY_METADATA.HYBRID.displayName,
      reasoning:
        'Кросовий гібрид поєднує вертикальнішу посадку, амортизаційну вилку з блокуванням та швидкі 28" колеса для парків і заміських доріжок.',
    };
  }

  return {
    type: 'GRAVEL',
    displayName: CATEGORY_METADATA.GRAVEL.displayName,
    reasoning: `Ваш баланс ${surfaceProportions.asphalt}% асфальту та ${surfaceProportions.gravel}% гравію ідеально покривається гравійником: жорстка вилка дає накат, а ширші покришки забезпечують комфорт поза містом.`,
  };
}

function bikeHasFeature(bike: BikeDetailDto, feature: RequiredFeatureType): boolean {
  switch (feature) {
    case 'RACK_MOUNTS':
      return bike.specs.hasRackMounts;
    case 'FENDER_MOUNTS':
      return bike.specs.hasFenderMounts;
    case 'DISC_BRAKES':
      return (
        bike.specs.brakeType === 'HYDRAULIC_DISC' || bike.specs.brakeType === 'MECHANICAL_DISC'
      );
    case 'HYDRAULIC_BRAKES':
      return bike.specs.brakeType === 'HYDRAULIC_DISC';
    case 'SUSPENSION_FORK':
      return bike.specs.suspensionFork;
  }
}

export function evaluateWizard(input: WizardEvaluateRequest): WizardEvaluateResponse {
  const recommendedCategory = determineRecommendedCategory(input.usage);
  const calculatedFrameSize = calculateFrameSize(input.rider.heightCm, input.rider.inseamCm);

  const scoredBikes = CATALOG_BIKES.map((bike) => {
    // 1. Surface affinity score (0 - 40 pts)
    const { asphalt, gravel, offroad } = input.usage.surfaceProportions;
    const weightedSurfaceAffinity =
      (asphalt * bike.surfaceProfile.asphaltScore +
        gravel * bike.surfaceProfile.gravelScore +
        offroad * bike.surfaceProfile.offroadScore) /
      100;
    const surfacePoints = (weightedSurfaceAffinity / 100) * 40;

    // 2. Category match (0 - 25 pts)
    let categoryPoints = 8;
    if (bike.category === recommendedCategory.type) {
      categoryPoints = 25;
    } else if (
      (recommendedCategory.type === 'GRAVEL' && bike.category === 'TOURING') ||
      (recommendedCategory.type === 'TOURING' && bike.category === 'GRAVEL') ||
      (recommendedCategory.type === 'CITY_COMMUTER' && bike.category === 'HYBRID') ||
      (recommendedCategory.type === 'HYBRID' && bike.category === 'CITY_COMMUTER')
    ) {
      categoryPoints = 18;
    }

    // 3. Budget fit (0 - 20 pts)
    const { minUah, maxUah } = input.budget;
    let budgetPoints: number;
    if (bike.bestPriceUah >= minUah && bike.bestPriceUah <= maxUah) {
      budgetPoints = 20;
    } else if (bike.bestPriceUah < minUah) {
      const diffRatio = (minUah - bike.bestPriceUah) / minUah;
      budgetPoints = Math.max(8, Math.round(16 * (1 - diffRatio)));
    } else {
      const overRatio = (bike.bestPriceUah - maxUah) / maxUah;
      budgetPoints = Math.max(0, Math.round(15 * (1 - overRatio * 2.5)));
    }

    // 4. Riding position & required features (0 - 15 pts)
    let featurePoints = bike.specs.ridingPosition === input.usage.ridingPosition ? 5 : 2;
    const reqFeatures = input.usage.featuresRequired;
    if (reqFeatures.length === 0) {
      featurePoints += 10;
    } else {
      const matchedCount = reqFeatures.filter((f) => bikeHasFeature(bike, f)).length;
      featurePoints += Math.round((matchedCount / reqFeatures.length) * 10);
    }

    // Find matching variant for rider height or closest variant
    const matchingVariant =
      bike.variants.find(
        (v) =>
          input.rider.heightCm >= v.minRiderHeightCm && input.rider.heightCm <= v.maxRiderHeightCm,
      ) ??
      bike.variants.find((v) => v.sizeLabel === calculatedFrameSize.standardLabel) ??
      bike.variants[0]!;

    const allInStockOffers = matchingVariant.offers
      .filter((o) => o.inStock)
      .sort((a, b) => a.priceUah - b.priceUah);

    const bestOffer = allInStockOffers[0] ?? matchingVariant.offers[0]!;
    const totalOffersCount = bike.variants.reduce((acc, v) => acc + v.offers.length, 0);

    const matchScore = Math.min(
      99,
      Math.max(40, Math.round(surfacePoints + categoryPoints + budgetPoints + featurePoints)),
    );

    return {
      bike,
      matchingVariant,
      bestOffer,
      totalOffersCount,
      matchScore,
    };
  });

  scoredBikes.sort((a, b) => b.matchScore - a.matchScore || a.bestOffer.priceUah - b.bestOffer.priceUah);

  const recommendations: RecommendedBikeItem[] = scoredBikes.slice(0, 5).map((entry, idx) => ({
    bikeId: entry.bike.slug,
    rank: idx + 1,
    matchScore: entry.matchScore,
    name: entry.bike.name,
    brand: {
      name: entry.bike.brand.name,
      logoUrl: entry.bike.brand.logoUrl,
    },
    category: entry.bike.category,
    frameSize: `${entry.matchingVariant.sizeLabel} (${entry.matchingVariant.numericSizeCm})`,
    keyHighlights: entry.bike.keyHighlights,
    bestPriceUah: entry.bestOffer.priceUah,
    currency: 'UAH',
    imageUrl: entry.bike.imageUrl,
    offersCount: entry.totalOffersCount,
    bestOffer: {
      shopName: entry.bestOffer.shopName,
      priceUah: entry.bestOffer.priceUah,
      inStock: entry.bestOffer.inStock,
      affiliateLink: entry.bestOffer.affiliateUrl,
    },
  }));

  return {
    analysis: {
      recommendedCategory,
      calculatedFrameSize,
    },
    recommendations,
  };
}
