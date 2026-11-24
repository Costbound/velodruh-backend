import type {
  BikeCategoryType,
  BrakeType,
  FrameMaterialType,
  RiderGenderType,
} from '../../schemas/wizard.schema.js';
import type { OfferCondition } from '../types.js';
import { getBrandAliases } from './brand.normalizer.js';
import { cleanText, escapeRegExp, slugify } from './text.utils.js';

const MIN_MODEL_YEAR = 2005;
const MAX_MODEL_YEAR = 2028;

/** Tokens identifying accessories/spare parts that are NOT complete bicycles. */
const ACCESSORY_TITLE_PATTERNS: RegExp[] = [
  /^\s*(?:вело)?(?:шолом|шлем|фляг|насос|замок|крил[ао]|багажник|фара|ліхтар|фонар|сідл|седл|педал|покришк|шини|камер[аи]|ланцюг|цеп[ьи]|касет|шатун|винос|керм[оа]|руль|грипс|гріпс|обмотк|вісь|втулк|обід|обод|спиц|гальм|тормоз|перемикач|переключат|манетк|ротор|колодк|чохол|велосумк|сумка|тримач|кріплен|дзеркал|дзвінок|велокомп|рукавичк|велоформу|велошорт|веловзутт|окуляр|мастил|олив|ключ|інструмент|мультитул|стійка|підніжк|вилка\s+для|рама\s+(?:велосипед|від|на\s+продаж|карбонова\s+окремо))/i,
  /\b(?:spare\s+part|helmet|pump|inner\s+tube|tire|tyre|brake\s+pad|chain\s+lube|bottle\s+cage|pannier|saddle|jersey|bib\s+shorts|bike\s+lock|kickstand)\b/i,
  /(?:біговел|беговел|самокат|велотренажер|електросамокат|моноколес|дитяч[іеий].{0,20}крісл)/i,
  /(?:запчастин[аи]|комплектуюч[іе]|продаж\s+рами|продам\s+раму|продам\s+вилку|продам\s+колес[ао])/i,
  /(?<![\p{L}\p{N}])(?:веловзутт\p{L}*|велотуфл\p{L}*|кросівк\p{L}*|взуття)(?![\p{L}\p{N}])/iu,
];

const COMPLETE_BIKE_POSITIVE_PATTERN =
  /(?<![\p{L}\p{N}])(?:велосипед|вело|байк|гравійник|шосейник|хардтейл|двопідвіс|фетбайк|bicycle|bike)(?![\p{L}\p{N}])/iu;

export function isAccessoryOrNonBike(title: string, categoryRaw?: string | null): boolean {
  const cleanedTitle = cleanText(title);
  if (!cleanedTitle) {
    return true;
  }
  const catText = cleanText(categoryRaw);
  if (
    catText &&
    /(?:аксесуар|запчастин|одяг|взуття|шолом|інструмент|велокомп|освітлен|шини|камери|accessories|parts)/i.test(
      catText,
    ) &&
    !COMPLETE_BIKE_POSITIVE_PATTERN.test(cleanedTitle)
  ) {
    return true;
  }
  return ACCESSORY_TITLE_PATTERNS.some((re) => re.test(cleanedTitle));
}

export function extractModelYear(input: {
  explicitYear?: number | string | null;
  attributes?: Record<string, string>;
  title?: string | null;
  productUrl?: string | null;
  defaultYear: number;
}): { year: number; detected: boolean } {
  const parseValidYear = (raw: string | number | null | undefined): number | null => {
    if (raw === null || raw === undefined) return null;
    const num = typeof raw === 'number' ? raw : Number.parseInt(String(raw).trim(), 10);
    if (Number.isInteger(num) && num >= MIN_MODEL_YEAR && num <= MAX_MODEL_YEAR) {
      return num;
    }
    return null;
  };

  // 1. Explicit year field
  const direct = parseValidYear(input.explicitYear);
  if (direct !== null) {
    return { year: direct, detected: true };
  }

  // 2. Attribute map ("Рік випуску", "Год", "Модельний рік", "Year")
  if (input.attributes) {
    for (const [key, val] of Object.entries(input.attributes)) {
      if (/(?:рік|год|year|модельний)/i.test(key)) {
        const match = val.match(/\b(20[0-2]\d)\b/);
        const parsed = match ? parseValidYear(match[1]) : null;
        if (parsed !== null) {
          return { year: parsed, detected: true };
        }
      }
    }
  }

  // 3. Listing title (e.g. "Pride Rocx 8.2 2025", "Trek Marlin 7 (2024 р.)")
  const title = cleanText(input.title);
  if (title) {
    const matches = [...title.matchAll(/(?:^|[^\d])(20[0-2]\d)(?=$|[^\d])/g)];
    for (let i = matches.length - 1; i >= 0; i -= 1) {
      const parsed = parseValidYear(matches[i]![1]);
      if (parsed !== null) {
        return { year: parsed, detected: true };
      }
    }
  }

  // 4. Product URL slug hint (e.g. ".../pride-rocx-8-2-2025")
  if (input.productUrl) {
    const urlMatch = input.productUrl.match(/[-/_](20[0-2]\d)(?:[-/_.]|$)/);
    if (urlMatch) {
      const parsed = parseValidYear(urlMatch[1]);
      if (parsed !== null) {
        return { year: parsed, detected: true };
      }
    }
  }

  return { year: input.defaultYear, detected: false };
}

const LEADING_NOISE_WORDS =
  /^(?:велосипед|вело|байк|новий|б\/?у|бу|вживаний|продам|продаю|гірський|горный|гравійний|гравийный|гравійник|гревел|шосейний|шоссейный|шосейник|міський|городской|туринговий|туринговый|туринг|гібридний|гибридный|кросовий|кроссовый|дорожній|дорожный|жіночий|женский|чоловічий|мужской|підлітковий|подростковый|складний|складной|універсальний|универсальный|хардтейл|hardtail|gravel|road|mtb|city|urban|hybrid|touring|bicycle|bike)\s+/iu;

const COLOR_TOKENS_RE =
  /(?<![\p{L}\p{N}])(?:чорн\p{L}*|черн\p{L}*|біл\p{L}*|бел\p{L}*|сір\p{L}*|сер\p{L}*|сині\p{L}*|син[ійяю]\p{L}*|голуб\p{L}*|зелен\p{L}*|червон\p{L}*|красн\p{L}*|жовт\p{L}*|желт\p{L}*|помаранч\p{L}*|оранж\p{L}*|коричн\p{L}*|фіолет\p{L}*|рожев\p{L}*|розов\p{L}*|срібн\p{L}*|серебр\p{L}*|золотист\p{L}*|бронз\p{L}*|хак[іи]|оливк\p{L}*|графіт\p{L}*|антрацит\p{L}*|матов\p{L}*|глянц\p{L}*|бірюз\p{L}*|пісочн\p{L}*|black|white|grey|gray|silver|blue|navy|green|olive|red|orange|yellow|purple|violet|pink|brown|beige|sand|matte|matt|gloss|glossy|teal|graphite|turquoise|dark|light|khaki|bronze|gold|cyan|chrome|metallic)(?![\p{L}\p{N}])/giu;

/**
 * Strips storefront clutter (category prefix, duplicate brand, model year, frame size,
 * wheel diameter, color adjectives, condition tags, SKUs) so that heterogeneous titles
 * like `"Велосипед гравійний PRIDE Rocx 8.2 28\" M 2025 чорний"` and
 * `"Pride ROCX 8.2 (2025) - L"` clean down to the exact same model `"Rocx 8.2"`.
 */
export function cleanModelName(input: {
  rawModel?: string | null;
  title: string;
  brandName: string;
  brandSlug: string;
  modelYear: number;
}): { modelName: string; modelSlug: string; displayName: string } {
  const source = cleanText(input.rawModel) || cleanText(input.title);
  let text = source;

  // Strip parenthesized tags like "(2025)", "(б/у)", "(54 см)", "(чорний)"
  text = text.replace(/\([^)]*(?:\d{4}|см|cm|мм|mm|дюйм|б\/?у|бу|used|new|р\.|рама|size|чорн|сині|сір|біл|зелен|black|gray|grey|matt|red|blue|white)[^)]*\)/giu, ' ');
  text = text.replace(/\[[^\]]*\]/g, ' ');

  // Normalize comma decimal digits inside model codes (`8,2` -> `8.2`)
  text = text.replace(/(\d),(\d)/g, '$1.$2');

  // Remove bracketed / standalone year and "2025 р." / "2025 року"
  text = text.replace(
    new RegExp(`(?<![\\p{L}\\p{N}])${input.modelYear}(?:\\s*(?:р\\.?|рік|року|г\\.?|года|year))?(?![\\p{L}\\p{N}])`, 'giu'),
    ' ',
  );
  text = text.replace(/(?<![\p{L}\p{N}])20[0-2]\d(?:\s*(?:р\.?|рік|року|г\.?|года))?(?![\p{L}\p{N}])/giu, ' ');

  // Remove repeating leading noise words ("Велосипед гравійний ...")
  let prev = '';
  while (prev !== text) {
    prev = text;
    text = text.replace(LEADING_NOISE_WORDS, '').trim();
  }

  // Remove brand name & known aliases (both Cyrillic & Latin)
  const aliases = new Set<string>([
    input.brandName.toLowerCase(),
    ...getBrandAliases(input.brandSlug),
  ]);
  for (const alias of [...aliases].sort((a, b) => b.length - a.length)) {
    if (!alias || alias === 'unknown') continue;
    const brandRe = new RegExp(`(^|[^a-zа-яіїєґ0-9])${escapeRegExp(alias)}(?=$|[^a-zа-яіїєґ0-9])`, 'giu');
    text = text.replace(brandRe, '$1 ');
  }

  // Strip standalone category/type/condition adjectives left mid-title
  text = text.replace(
    /(?:^|[\s,/|])(?:велосипед|гірський|горный|гравійний|гравийный|гравійник|шосейний|шоссейный|міський|городской|туринговий|туринговый|гібридний|гибридный|кросовий|кроссовый|дорожній|дорожный|б\/?у|новий|терміново|срочно|(?:в|у)\s+(?:ідеал|идеал|відмін|отлич|гарн|хорош|чудов|добр)\p{L}*(?:\s+(?:стані?|состояни\p{L}*))?|(?:ідеальн|идеальн|відмінн|отличн|гарн|хорош)\p{L}*\s+(?:стані?|состояни\p{L}*)|стан\s+нового|без\s+пробіг\p{L}*|з\s+європ\p{L}*|из\s+европ\p{L}*|торг)(?=$|[\s,/|!])/giu,
    ' ',
  );

  // Strip wheel diameter & tire dimension tokens (`29"`, `28"`, `27.5"`, `700c`, `650b`, `29er`, `28 дюймів`)
  text = text.replace(/\b(?:24|26|27[.,]5|28|29)\s*(?:"|″|''|er|дюйм\p{L}*)/giu, ' ');
  text = text.replace(/(?:^|\s)(?:колес[ао]?|wheel[s]?)\s*(?:24|26|27[.,]5|28|29)"?/giu, ' ');
  text = text.replace(/\b(?:700c|700x\d+c?|650b)\b/gi, ' ');

  // Strip explicit frame size tags (`рама M`, `рама 19"`, `розмір L`, `54 см`, `17.5"`, `size M`)
  text = text.replace(
    /(?:рама|розмір(?:\s+рами)?|размер(?:\s+рамы)?|ростовка|frame|size)\s*[:=-]?\s*(?:XXS|XS|S\/M|M\/L|L\/XL|XXL|2XL|ML|S|M|L|XL|М|Л|\d{2}(?:[.,]5)?\s*(?:"|″|''|см|cm|мм|mm|дюйм\p{L}*)?)/giu,
    ' ',
  );
  text = text.replace(/\b(1[3-9](?:[.,]5)?|2[0-2](?:[.,]5)?)(?:"|″|'')/g, ' ');
  text = text.replace(/(?<![\p{L}\p{N}])(4[4-9]|5\d|6[0-3])\s*(?:см|cm)(?![\p{L}\p{N}])/giu, ' ');
  text = text.replace(/(?<![\p{L}\p{N}])[3-6]\d0\s*(?:мм|mm)(?![\p{L}\p{N}])/giu, ' ');
  text = text.replace(
    /(?:^|[\s,/|-])(?:XXS|XS|S\/M|M\/L|L\/XL|XXL|2XL|ML|S|M|L|XL)(?=$|[\s,/|-])/g,
    ' ',
  );

  // Strip trailing SKU/article codes (`арт. 12345`, `SKU-99`, `SKD-12-34`)
  text = text.replace(/(?<![\p{L}\p{N}])(?:арт\.?|sku|код)\s*[:#-]?\s*[a-z0-9-]+/giu, ' ');
  text = text.replace(/\b[A-Z]{2,4}-\d{2,6}(?:-\d{2,4})?\b/g, ' ');

  // Strip colors & surface finish words
  text = text.replace(COLOR_TOKENS_RE, ' ');

  // Strip leftover punctuation separators
  text = text
    .replace(/[|•·,;!()[\]"]/g, ' ')
    .replace(/\s*\/\s*/g, ' ')
    .replace(/(?:^|\s)[-–—]+(?:\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Strip trailing standalone wheel numbers if preceded by model (e.g. "Pride Rocx 8.2 28")
  text = text.replace(/\s+(?:26|27\.5|28|29)$/, '').trim();

  // Remove any leftover generic brand if nothing survived
  if (!text) {
    text = cleanText(input.title).replace(/\s+/g, ' ').slice(0, 60);
  }

  // Format neatly without shouting ALL CAPS
  const formattedModel = text
    .split(' ')
    .filter(Boolean)
    .map((tok) => {
      if (tok.length > 2 && tok === tok.toUpperCase() && /[A-ZА-ЯІЇЄҐ]/.test(tok) && !/^[A-Z]{2,3}\d/.test(tok)) {
        return tok.charAt(0).toUpperCase() + tok.slice(1).toLowerCase();
      }
      if (/^[a-z]/.test(tok)) {
        return tok.charAt(0).toUpperCase() + tok.slice(1);
      }
      return tok;
    })
    .join(' ');

  const modelSlug = slugify(formattedModel, 'model');
  const displayName =
    input.brandSlug === 'unknown' ? formattedModel : `${input.brandName} ${formattedModel}`.trim();

  return {
    modelName: formattedModel,
    modelSlug,
    displayName,
  };
}

export function normalizeBrakeType(text: string): { value: BrakeType; detected: boolean } {
  const lowered = cleanText(text).toLowerCase();
  if (!lowered) {
    return { value: 'MECHANICAL_DISC', detected: false };
  }
  if (
    /(?:гідравл|гидравл|hydraulic|mineral\s*oil|mt200|mt400|mt410|br-m|tektro\s*hd|grx\s*(?:400|600|810|820)|tiagra\s*4720|105\s*r7020|shimano\s*deore.*disc|sram\s*(?:level|rival|apex\s*hdr))/i.test(
      lowered,
    )
  ) {
    return { value: 'HYDRAULIC_DISC', detected: true };
  }
  if (
    /(?:механ\p{L}*\s*диск|диск\p{L}*\s*механ|mechanical\s*disc|trp\s*spyre|avid\s*bb[57]|promax|tektro\s*(?:md|mira|aries)|zoom\s*db|disk|дисков)/iu.test(
      lowered,
    )
  ) {
    return { value: 'MECHANICAL_DISC', detected: true };
  }
  if (/(?:v-?brake|вібрейк|обідн|ободн|кліщов|клещев|rim\s*brake|caliper|ножн)/i.test(lowered)) {
    return { value: 'RIM', detected: true };
  }
  return { value: 'MECHANICAL_DISC', detected: false };
}

export function normalizeFrameMaterial(text: string): {
  value: FrameMaterialType;
  detected: boolean;
} {
  const lowered = cleanText(text).toLowerCase();
  if (!lowered) {
    return { value: 'ALUMINUM', detected: false };
  }
  if (/(?:карбон|carbon|вуглепласт|cf[2345]|оclv|fact\s*\d+r|ballistec\s*carbon)/i.test(lowered)) {
    // Be careful not to trigger on "карбонова вилка" alone when frame says aluminum
    const hasAluFrame = /(?:алюміні|алюмини|alloy|6061|6066|aluminum|aluminium|smartform)/i.test(lowered);
    const carbonForkOnly = /(?:карбонов\p{L}*\s+вилк|carbon\s+fork)/iu.test(lowered);
    if (hasAluFrame && carbonForkOnly) {
      return { value: 'ALUMINUM', detected: true };
    }
    return { value: 'CARBON', detected: true };
  }
  if (/(?:хромол|cr-?mo|4130|сталь|сталев|hi-?ten|steel|chromoly|reynolds)/i.test(lowered)) {
    return { value: 'STEEL', detected: true };
  }
  if (/(?:алюм|alloy|aluminum|aluminium|alu\b|6061|6066|7005|smartform)/i.test(lowered)) {
    return { value: 'ALUMINUM', detected: true };
  }
  return { value: 'ALUMINUM', detected: false };
}

export function normalizeWheelSize(
  text: string,
  category: BikeCategoryType,
): { value: string; detected: boolean } {
  const cleaned = cleanText(text);
  if (/\b29\s*(?:"|″|''|er|дюйм)?/i.test(cleaned) && /(?:29"|29″|29er|29\s*дюйм|колес\p{L}*\s*29|29\s*x)/iu.test(cleaned)) {
    return { value: '29"', detected: true };
  }
  if (/(?:27[.,]5|650b)/i.test(cleaned)) {
    return { value: '27.5"', detected: true };
  }
  if (/(?:700\s*c|700x\d+|28"|28″|28\s*дюйм|колес\p{L}*\s*28)/iu.test(cleaned)) {
    return { value: '28"', detected: true };
  }
  if (/(?:26"|26″|26\s*дюйм|колес\p{L}*\s*26)/iu.test(cleaned)) {
    return { value: '26"', detected: true };
  }
  if (/(?:24"|24″|24\s*дюйм|колес\p{L}*\s*24)/iu.test(cleaned)) {
    return { value: '24"', detected: true };
  }
  if (/^\s*(24|26|27[.,]5|28|29)\s*(?:"|″)?\s*$/i.test(cleaned)) {
    const val = cleaned.replace(',', '.').replace(/[^\d.]/g, '');
    return { value: `${val}"`, detected: true };
  }
  return {
    value: category === 'MTB_HARDTAIL' ? '29"' : '28"',
    detected: false,
  };
}

export function normalizeWeightKg(raw: string | null | undefined): number | null {
  const cleaned = cleanText(raw);
  if (!cleaned) {
    return null;
  }
  const kgMatch = cleaned.match(/(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:кг|kg)(?![\p{L}\p{N}])/iu);
  if (kgMatch) {
    const kg = Number.parseFloat(kgMatch[1]!.replace(',', '.'));
    if (kg >= 5 && kg <= 28) {
      return Math.round(kg * 10) / 10;
    }
  }
  const gMatch = cleaned.match(/(?<![\p{L}\p{N}])(\d{4,5})\s*(?:г|g|гр)(?![\p{L}\p{N}])/iu);
  if (gMatch) {
    const kg = Number.parseInt(gMatch[1]!, 10) / 1000;
    if (kg >= 5 && kg <= 28) {
      return Math.round(kg * 10) / 10;
    }
  }
  // Plain numeric value from explicit `Вага` attribute
  const bareMatch = cleaned.match(/^(\d{1,2}(?:[.,]\d{1,2})?)$/);
  if (bareMatch) {
    const kg = Number.parseFloat(bareMatch[1]!.replace(',', '.'));
    if (kg >= 5 && kg <= 28) {
      return Math.round(kg * 10) / 10;
    }
  }
  return null;
}

export function normalizeGender(text: string): RiderGenderType {
  const cleaned = cleanText(text).toLowerCase();
  if (/(?:жіноч|женск|woman|women|lady|ladies|\bwsd\b|\bliv\b|дамськ)/i.test(cleaned)) {
    return 'FEMALE';
  }
  if (/(?:чоловіч|мужск|\bmale\b|\bmen'?s\b)/i.test(cleaned) && !/(?:унісекс|унисекс|unisex)/i.test(cleaned)) {
    return 'MALE';
  }
  return 'UNISEX';
}

export function normalizeDrivetrain(
  explicit: string | null | undefined,
  text: string,
): { value: string; detected: boolean } {
  const direct = cleanText(explicit);
  if (direct && direct.length >= 3 && direct.length <= 80 && !/^unknown$/i.test(direct)) {
    return { value: direct, detected: true };
  }

  const hay = cleanText(text);
  const groupMatch = hay.match(
    /\b((?:shimano|sram|microshift|l-?twoo|campagnolo|sensah)\s+(?:tourney|altus|acera|alivio|deore|slx|xt|xtr|cues|claris|sora|tiagra|105|ultegra|dura-?ace|grx(?:\s*\d{3})?|sx|nx|gx|x01|apex|rival|force|red|advent(?:\s*x)?|sword|acolyte|r\d+)(?:\s+[123]x\d{1,2})?)/i,
  );
  if (groupMatch) {
    return { value: cleanText(groupMatch[1]), detected: true };
  }

  const speedMatch = hay.match(/\b([123]x(?:7|8|9|10|11|12))\b/i);
  if (speedMatch) {
    return { value: `${speedMatch[1]!.toLowerCase()} швидкостей`, detected: true };
  }

  return { value: 'Не вказано', detected: false };
}

export function normalizeCondition(
  rawCondition?: string | null,
  source?: string,
  title?: string | null,
): OfferCondition {
  const raw = cleanText(rawCondition).toLowerCase();
  if (raw) {
    if (/(?:used|б\/?у|бу|вживан|вторин|second|pre-?owned)/.test(raw)) return 'USED';
    if (/(?:refurb|markdown|уцін|віднов|оцін|open.?box)/.test(raw)) return 'REFURBISHED';
    if (/(?:new|нов)/.test(raw)) return 'NEW';
  }
  const t = cleanText(title).toLowerCase();
  if (/(?:^|\s)(?:б\/?у|б\.у\.|вживан|used)(?:$|\s|[),!])/.test(t)) {
    return 'USED';
  }
  if (source === 'xml_feed' || source === 'rozetka' || source === 'hotline') {
    return 'NEW';
  }
  if (source === 'olx') {
    return 'USED';
  }
  return 'UNKNOWN';
}

export function detectMountsAndFork(
  text: string,
  category: BikeCategoryType,
  defaultSuspensionFork: boolean,
): { hasRackMounts: boolean; hasFenderMounts: boolean; suspensionFork: boolean } {
  const hay = cleanText(text).toLowerCase();
  const hasRackMounts =
    category === 'TOURING' ||
    /(?:багажник|бонки|rack\s*mount|кріплен\p{L}*\s+під\s+багажник)/iu.test(hay);
  const hasFenderMounts =
    category === 'TOURING' ||
    category === 'CITY_COMMUTER' ||
    /(?:крила|крило|болотник|fender\s*mount|mudguard)/i.test(hay);

  let suspensionFork = defaultSuspensionFork;
  if (
    /(?:амортизаційн\p{L}*\s+вилк|пружин\p{L}*-?еластом|повітрян\p{L}*\s+вилк|rockshox|suntour|fox\s*3[2468]|manitou|хід\s*(?:вилки\s*)?\d{2,3}\s*мм|suspension\s*fork)/iu.test(
      hay,
    )
  ) {
    suspensionFork = true;
  } else if (/(?:ригід|жорстк\p{L}*\s+вилк|карбонов\p{L}*\s+вилк|rigid\s*fork)/iu.test(hay)) {
    suspensionFork = false;
  }

  return { hasRackMounts, hasFenderMounts, suspensionFork };
}
