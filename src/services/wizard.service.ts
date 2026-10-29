import type {
  BikeCategoryType,
  BrakeType,
  CalculatedFrameSize,
  RecommendedBikeFilters,
  WizardEvaluateRequest,
  WizardEvaluateResponse,
  WizardMetaResponse,
} from '../schemas/wizard.schema.js';

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
