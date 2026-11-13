import type { BikeDetailDto, BikeOfferDto, BikeVariantDto } from '../schemas/bike.schema.js';
import type {
  BikeCategoryType,
  BrakeType,
  CalculatedFrameSize,
  RecommendedBikeFilters,
  RecommendedBikeOfferDto,
  RequiredFeatureType,
  ScoreBreakdown,
  WizardEvaluateRequest,
  WizardEvaluateResponse,
  WizardMetaResponse,
  WizardRecommendationsRequest,
  WizardRecommendationsResponse,
} from '../schemas/wizard.schema.js';
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

export function evaluateWizard(input: WizardEvaluateRequest): WizardEvaluateResponse {
  const recommendedCategory = determineRecommendedCategory(input.usage);
  const calculatedFrameSize = calculateFrameSize(input.rider.heightCm, input.rider.inseamCm);

  const reqFeatures = input.usage.featuresRequired;
  let brakeTypes: BrakeType[] | undefined;
  if (reqFeatures.includes('HYDRAULIC_BRAKES')) {
    brakeTypes = ['HYDRAULIC_DISC'];
  } else if (reqFeatures.includes('DISC_BRAKES')) {
    brakeTypes = ['HYDRAULIC_DISC', 'MECHANICAL_DISC'];
  }

  const hasRackMounts =
    reqFeatures.includes('RACK_MOUNTS') || input.usage.primaryGoal === 'touring' ? true : undefined;
  const hasFenderMounts = reqFeatures.includes('FENDER_MOUNTS') ? true : undefined;

  let suspensionFork: boolean | undefined;
  if (
    reqFeatures.includes('SUSPENSION_FORK') ||
    recommendedCategory.type === 'MTB_HARDTAIL' ||
    recommendedCategory.type === 'HYBRID'
  ) {
    suspensionFork = true;
  } else if (
    recommendedCategory.type === 'GRAVEL' ||
    recommendedCategory.type === 'ROAD' ||
    recommendedCategory.type === 'TOURING'
  ) {
    suspensionFork = false;
  }

  const recommendedFilters: RecommendedBikeFilters = {
    category: recommendedCategory.type,
    sizeLabel: calculatedFrameSize.standardLabel,
    riderHeightCm: input.rider.heightCm,
    gender: input.rider.gender,
    minPriceUah: input.budget.minUah,
    maxPriceUah: input.budget.maxUah,
    ridingPosition: input.usage.ridingPosition,
    ...(brakeTypes !== undefined ? { brakeTypes } : {}),
    ...(hasRackMounts !== undefined ? { hasRackMounts } : {}),
    ...(hasFenderMounts !== undefined ? { hasFenderMounts } : {}),
    ...(suspensionFork !== undefined ? { suspensionFork } : {}),
    inStockOnly: true,
  };

  return {
    analysis: {
      recommendedCategory,
      calculatedFrameSize,
    },
    recommendedFilters,
  };
}

const ADJACENT_CATEGORIES: Record<BikeCategoryType, BikeCategoryType[]> = {
  GRAVEL: ['TOURING', 'ROAD', 'CITY_COMMUTER', 'HYBRID'],
  ROAD: ['GRAVEL', 'CITY_COMMUTER'],
  MTB_HARDTAIL: ['HYBRID', 'GRAVEL'],
  CITY_COMMUTER: ['HYBRID', 'GRAVEL', 'ROAD'],
  TOURING: ['GRAVEL', 'HYBRID', 'CITY_COMMUTER'],
  HYBRID: ['CITY_COMMUTER', 'GRAVEL', 'MTB_HARDTAIL'],
};

function getRangeDistance(value: number, min: number, max: number): number {
  if (value < min) return min - value;
  if (value > max) return value - max;
  return 0;
}

function selectBestVariantAndOffer(
  bike: BikeDetailDto,
  heightCm: number,
  targetSizeLabel: CalculatedFrameSize['standardLabel'],
  inseamCm?: number,
): { variant: BikeVariantDto; bestOffer: BikeOfferDto; heightDistanceCm: number } | null {
  const variantsWithStock = bike.variants.filter((v) => v.offers.some((o) => o.inStock));
  const candidateVariants = variantsWithStock.length > 0 ? variantsWithStock : bike.variants;

  if (candidateVariants.length === 0) {
    return null;
  }

  const scoredVariants = candidateVariants.map((variant) => {
    const heightDistanceCm = getRangeDistance(
      heightCm,
      variant.minRiderHeightCm,
      variant.maxRiderHeightCm,
    );
    const inseamMatches =
      inseamCm !== undefined &&
      inseamCm >= variant.minInseamCm &&
      inseamCm <= variant.maxInseamCm;

    let fitPriority = 0;
    if (heightDistanceCm === 0) fitPriority += 100;
    if (variant.sizeLabel === targetSizeLabel) fitPriority += 40;
    if (inseamMatches) fitPriority += 30;
    fitPriority -= heightDistanceCm * 5;

    const inStockOffers = variant.offers.filter((o) => o.inStock);
    const offerPool = inStockOffers.length > 0 ? inStockOffers : variant.offers;
    const sortedOffers = [...offerPool].sort((a, b) => a.priceUah - b.priceUah);
    const bestOffer = sortedOffers[0]!;

    return {
      variant,
      bestOffer,
      heightDistanceCm,
      fitPriority,
    };
  });

  scoredVariants.sort((a, b) => b.fitPriority - a.fitPriority);
  const top = scoredVariants[0]!;
  return {
    variant: top.variant,
    bestOffer: top.bestOffer,
    heightDistanceCm: top.heightDistanceCm,
  };
}

function doesBikeMatchFeature(bike: BikeDetailDto, feature: RequiredFeatureType): boolean {
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

export function getWizardRecommendations(
  input: WizardRecommendationsRequest,
): WizardRecommendationsResponse {
  const evaluation = evaluateWizard(input);
  const { recommendedCategory, calculatedFrameSize } = evaluation.analysis;
  const { surfaceProportions, ridingPosition, featuresRequired } = input.usage;
  const { minUah, maxUah } = input.budget;
  const { heightCm, inseamCm, gender } = input.rider;

  const genderCompatibleBikes = CATALOG_BIKES.filter(
    (bike) => bike.gender === gender || bike.gender === 'UNISEX' || gender === 'UNISEX',
  );

  const scoredCandidates: Array<Omit<RecommendedBikeOfferDto, 'rank'>> = [];

  for (const bike of genderCompatibleBikes) {
    const selected = selectBestVariantAndOffer(
      bike,
      heightCm,
      calculatedFrameSize.standardLabel,
      inseamCm,
    );
    if (!selected) {
      continue;
    }

    const { variant, bestOffer, heightDistanceCm } = selected;

    // 1. Category score (0..30)
    let categoryScore = 8;
    if (bike.category === recommendedCategory.type) {
      categoryScore = 30;
    } else if (ADJACENT_CATEGORIES[recommendedCategory.type].includes(bike.category)) {
      categoryScore = 20;
    }

    // 2. Surface profile alignment score (0..25)
    const weightedSurface =
      (surfaceProportions.asphalt * bike.surfaceProfile.asphaltScore +
        surfaceProportions.gravel * bike.surfaceProfile.gravelScore +
        surfaceProportions.offroad * bike.surfaceProfile.offroadScore) /
      100;
    const surfaceScore = Math.min(25, Math.max(0, Math.round((weightedSurface / 100) * 25)));

    // 3. Size & anthropometry fit score (0..20)
    let sizeFitScore: number;
    if (heightDistanceCm === 0) {
      const inseamFits =
        inseamCm === undefined ||
        (inseamCm >= variant.minInseamCm && inseamCm <= variant.maxInseamCm);
      sizeFitScore = inseamFits ? 20 : 18;
    } else if (heightDistanceCm <= 3 || variant.sizeLabel === calculatedFrameSize.standardLabel) {
      sizeFitScore = 15;
    } else {
      sizeFitScore = Math.max(5, 12 - heightDistanceCm);
    }

    // 4. Budget fit score (0..15)
    let budgetScore = 0;
    if (bestOffer.priceUah >= minUah && bestOffer.priceUah <= maxUah) {
      budgetScore = 15;
    } else if (bestOffer.priceUah < minUah) {
      budgetScore = 12;
    } else if (bestOffer.priceUah <= maxUah * 1.15) {
      budgetScore = 9;
    } else if (bestOffer.priceUah <= maxUah * 1.3) {
      budgetScore = 4;
    }

    // 5. Riding position & required features score (0..10)
    let positionPoints = 0;
    if (bike.specs.ridingPosition === ridingPosition) {
      positionPoints = 4;
    } else if (
      bike.specs.ridingPosition === 'COMFORTABLE' ||
      ridingPosition === 'COMFORTABLE'
    ) {
      positionPoints = 2;
    }

    let featurePoints = 6;
    if (featuresRequired.length > 0) {
      const matchedFeaturesCount = featuresRequired.filter((f) =>
        doesBikeMatchFeature(bike, f),
      ).length;
      featurePoints = Math.round((matchedFeaturesCount / featuresRequired.length) * 6);
    } else if (
      evaluation.recommendedFilters.suspensionFork !== undefined &&
      bike.specs.suspensionFork !== evaluation.recommendedFilters.suspensionFork
    ) {
      featurePoints = 4;
    }

    const featuresScore = positionPoints + featurePoints;

    const scoreBreakdown: ScoreBreakdown = {
      categoryScore,
      surfaceScore,
      sizeFitScore,
      budgetScore,
      featuresScore,
    };

    const matchScore = Math.min(
      100,
      categoryScore + surfaceScore + sizeFitScore + budgetScore + featuresScore,
    );

    const matchReasons: string[] = [];

    if (bike.category === recommendedCategory.type) {
      matchReasons.push(
        `Пряме влучання в рекомендовану категорію «${CATEGORY_METADATA[bike.category].displayName}» (профіль покриття: ${Math.round(weightedSurface)}% сумісності)`,
      );
    } else {
      matchReasons.push(
        `Близька альтернатива (${CATEGORY_METADATA[bike.category].displayName}) із сумісністю покриття ${Math.round(weightedSurface)}%`,
      );
    }

    if (heightDistanceCm === 0) {
      matchReasons.push(
        `Ростовка ${variant.sizeLabel} (${variant.numericSizeCm} см, на зріст ${variant.minRiderHeightCm}–${variant.maxRiderHeightCm} см) точно підходить під ваші ${heightCm} см`,
      );
    } else {
      matchReasons.push(
        `Найближча доступна ростовка ${variant.sizeLabel} (${variant.numericSizeCm} см, розрахована на ${variant.minRiderHeightCm}–${variant.maxRiderHeightCm} см)`,
      );
    }

    if (bestOffer.priceUah >= minUah && bestOffer.priceUah <= maxUah) {
      matchReasons.push(
        `Оптимальна ціна в межах бюджету: ${bestOffer.priceUah} грн у магазині «${bestOffer.shopName}»`,
      );
    } else if (bestOffer.priceUah < minUah) {
      matchReasons.push(
        `Економія бюджету: ${bestOffer.priceUah} грн у магазині «${bestOffer.shopName}» (нижче запланованого порогу ${minUah} грн)`,
      );
    } else {
      matchReasons.push(
        `Пропозиція за ${bestOffer.priceUah} грн у «${bestOffer.shopName}» — вищий рівень комплектації (${bike.specs.drivetrain})`,
      );
    }

    const recommendedVariant: Omit<BikeVariantDto, 'offers'> = {
      sizeLabel: variant.sizeLabel,
      numericSizeCm: variant.numericSizeCm,
      minRiderHeightCm: variant.minRiderHeightCm,
      maxRiderHeightCm: variant.maxRiderHeightCm,
      minInseamCm: variant.minInseamCm,
      maxInseamCm: variant.maxInseamCm,
      stackMm: variant.stackMm,
      reachMm: variant.reachMm,
    };

    scoredCandidates.push({
      matchScore,
      scoreBreakdown,
      matchReasons,
      bike,
      recommendedVariant,
      bestOffer,
    });
  }

  scoredCandidates.sort((a, b) => {
    if (b.matchScore !== a.matchScore) {
      return b.matchScore - a.matchScore;
    }
    if (b.scoreBreakdown.budgetScore !== a.scoreBreakdown.budgetScore) {
      return b.scoreBreakdown.budgetScore - a.scoreBreakdown.budgetScore;
    }
    return a.bestOffer.priceUah - b.bestOffer.priceUah;
  });

  const targetLimit = Math.min(Math.max(input.limit ?? 5, 3), 5);
  const shortlist: RecommendedBikeOfferDto[] = scoredCandidates
    .slice(0, targetLimit)
    .map((candidate, index) => ({
      rank: index + 1,
      ...candidate,
    }));

  return {
    ...evaluation,
    shortlist,
    totalCandidatesEvaluated: genderCompatibleBikes.length,
  };
}

