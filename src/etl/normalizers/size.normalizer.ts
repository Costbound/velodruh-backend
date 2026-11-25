import type { BikeCategoryType, FrameSizeLabelType } from '../../schemas/wizard.schema.js';
import type { NormalizedFrameSize } from '../types.js';
import { cleanText } from './text.utils.js';

interface SizeDefaults {
  numericRoadCm: number;
  numericMtbCm: number;
  minRiderHeightCm: number;
  maxRiderHeightCm: number;
  minInseamCm: number;
  maxInseamCm: number;
}

const SIZE_TABLE: Record<FrameSizeLabelType, SizeDefaults> = {
  XS: {
    numericRoadCm: 48,
    numericMtbCm: 38,
    minRiderHeightCm: 148,
    maxRiderHeightCm: 162,
    minInseamCm: 66,
    maxInseamCm: 74,
  },
  S: {
    numericRoadCm: 51,
    numericMtbCm: 41,
    minRiderHeightCm: 158,
    maxRiderHeightCm: 171,
    minInseamCm: 71,
    maxInseamCm: 79,
  },
  M: {
    numericRoadCm: 54,
    numericMtbCm: 45,
    minRiderHeightCm: 168,
    maxRiderHeightCm: 181,
    minInseamCm: 76,
    maxInseamCm: 85,
  },
  L: {
    numericRoadCm: 57,
    numericMtbCm: 49,
    minRiderHeightCm: 178,
    maxRiderHeightCm: 191,
    minInseamCm: 82,
    maxInseamCm: 91,
  },
  XL: {
    numericRoadCm: 60,
    numericMtbCm: 53,
    minRiderHeightCm: 188,
    maxRiderHeightCm: 205,
    minInseamCm: 88,
    maxInseamCm: 98,
  },
};

function isRoadOrGravelCategory(category: BikeCategoryType): boolean {
  return category === 'ROAD' || category === 'GRAVEL' || category === 'TOURING';
}

function buildSize(
  label: FrameSizeLabelType,
  category: BikeCategoryType,
  rawInput: string | null,
  confidence: NormalizedFrameSize['confidence'],
  overrides?: Partial<{
    numericSizeCm: number;
    minRiderHeightCm: number;
    maxRiderHeightCm: number;
  }>,
): NormalizedFrameSize {
  const defaults = SIZE_TABLE[label];
  return {
    sizeLabel: label,
    numericSizeCm:
      overrides?.numericSizeCm ??
      (isRoadOrGravelCategory(category) ? defaults.numericRoadCm : defaults.numericMtbCm),
    minRiderHeightCm: overrides?.minRiderHeightCm ?? defaults.minRiderHeightCm,
    maxRiderHeightCm: overrides?.maxRiderHeightCm ?? defaults.maxRiderHeightCm,
    minInseamCm: defaults.minInseamCm,
    maxInseamCm: defaults.maxInseamCm,
    rawInput,
    confidence,
  };
}

function mapInchesToLabel(inches: number): FrameSizeLabelType {
  if (inches <= 14.5) return 'XS';
  if (inches <= 16.5) return 'S';
  if (inches <= 18.5) return 'M';
  if (inches <= 20.5) return 'L';
  return 'XL';
}

function mapCmToLabel(cm: number, category: BikeCategoryType): FrameSizeLabelType {
  if (isRoadOrGravelCategory(category)) {
    if (cm <= 49) return 'XS';
    if (cm <= 52) return 'S';
    if (cm <= 55) return 'M';
    if (cm <= 58) return 'L';
    return 'XL';
  }
  // MTB / Hybrid / City seat tube length in cm
  if (cm <= 39) return 'XS';
  if (cm <= 43) return 'S';
  if (cm <= 47) return 'M';
  if (cm <= 51) return 'L';
  return 'XL';
}

function mapRiderHeightToLabel(heightCm: number): FrameSizeLabelType {
  if (heightCm < 160) return 'XS';
  if (heightCm < 170) return 'S';
  if (heightCm < 181) return 'M';
  if (heightCm < 191) return 'L';
  return 'XL';
}

function normalizeLetterToken(raw: string): FrameSizeLabelType | null {
  // Replace Cyrillic lookalike single letters used on Ukrainian storefronts / OLX ads
  const replaced = raw
    .trim()
    .toUpperCase()
    .replace(/Х/g, 'X')
    .replace(/М/g, 'M')
    .replace(/Л/g, 'L')
    .replace(/С/g, 'S');

  switch (replaced) {
    case 'XXS':
    case 'XS':
    case 'XS/S':
      return 'XS';
    case 'S':
      return 'S';
    case 'S/M':
    case 'M':
    case 'M/L':
      return 'M';
    case 'ML':
    case 'L':
      return 'L';
    case 'L/XL':
    case 'XL':
    case 'XXL':
    case '2XL':
      return 'XL';
    default:
      return null;
  }
}

function parseExplicitSizeString(
  raw: string,
  category: BikeCategoryType,
): NormalizedFrameSize | null {
  const cleaned = cleanText(raw);
  if (!cleaned) {
    return null;
  }

  // Optional embedded rider height range (e.g. "M (170-182 см)" or "17\" (165-178 см)")
  const heightRangeMatch = cleaned.match(
    /(?:зріст|рост|height)?\s*(1[4-9]\d|20\d|21[0-5])\s*[-–—]\s*(1[4-9]\d|20\d|21[0-5])\s*(?:см|cm)?/i,
  );
  const heightRange = heightRangeMatch
    ? {
        minRiderHeightCm: Number.parseInt(heightRangeMatch[1]!, 10),
        maxRiderHeightCm: Number.parseInt(heightRangeMatch[2]!, 10),
      }
    : undefined;

  // Direct inches ("17\"", "19.5\"", "18 дюймів", bare "17".."22")
  const inchMatch = cleaned.match(
    /(?<![\p{L}\p{N}])(1[2-9](?:[.,]5)?|2[0-3](?:[.,]5)?)\s*(?:"|″|''|in|inch|дюйм\p{L}*)?(?![\p{L}\p{N}])/iu,
  );
  const cmMatch = cleaned.match(/(?<![\p{L}\p{N}])([3-6]\d)\s*(?:см|cm)(?![\p{L}\p{N}])/iu);
  const mmMatch = cleaned.match(/(?<![\p{L}\p{N}])([3-6]\d0)\s*(?:мм|mm)(?![\p{L}\p{N}])/iu);
  const bareCmMatch = cleaned.match(/^\s*([3-6]\d)\s*$/);

  // 1. Compound / standalone letter token ("M", "L (19\")", "S/M", "ML", "XL", "XS", "М")
  const letterTokenMatch = cleaned.match(
    /(?:^|[\s(/,])(XXS|XS\/S|XS|S\/M|M\/L|L\/XL|XXL|2XL|ML|S|M|L|XL|М|Л|ХС|ХЛ)(?=$|[\s),/-])/i,
  );
  if (letterTokenMatch) {
    const rawTok = letterTokenMatch[1]!.toUpperCase();
    let label: FrameSizeLabelType | null;
    if (rawTok === 'ХС') label = 'XS';
    else if (rawTok === 'ХЛ') label = 'XL';
    else if (rawTok === 'М') label = 'M';
    else if (rawTok === 'Л') label = 'L';
    else label = normalizeLetterToken(rawTok);

    if (label) {
      let numericSizeCm: number | undefined;
      if (cmMatch) {
        numericSizeCm = Number.parseInt(cmMatch[1]!, 10);
      } else if (mmMatch) {
        numericSizeCm = Math.round(Number.parseInt(mmMatch[1]!, 10) / 10);
      } else if (inchMatch && /(?:"|″|''|in|inch|дюйм)/i.test(inchMatch[0])) {
        numericSizeCm = Math.round(Number.parseFloat(inchMatch[1]!.replace(',', '.')) * 2.54);
      }
      return buildSize(label, category, cleaned, 'EXACT', {
        ...(numericSizeCm !== undefined ? { numericSizeCm } : {}),
        ...(heightRange ?? {}),
      });
    }
  }

  // 2. Explicit cm size (35..64 cm)
  const cmSource = cmMatch ?? bareCmMatch;
  if (cmSource) {
    const cm = Number.parseInt(cmSource[1]!, 10);
    if (cm >= 34 && cm <= 65) {
      const label = mapCmToLabel(cm, category);
      return buildSize(label, category, cleaned, 'EXACT', {
        numericSizeCm: cm,
        ...(heightRange ?? {}),
      });
    }
  }

  // 3. Explicit mm frame size (e.g. 540mm -> 54 cm)
  if (mmMatch) {
    const cm = Math.round(Number.parseInt(mmMatch[1]!, 10) / 10);
    if (cm >= 34 && cm <= 65) {
      return buildSize(mapCmToLabel(cm, category), category, cleaned, 'EXACT', {
        numericSizeCm: cm,
        ...(heightRange ?? {}),
      });
    }
  }

  // 4. Explicit inch size (12..23.5", never matching wheel sizes 24..29")
  if (inchMatch) {
    const inches = Number.parseFloat(inchMatch[1]!.replace(',', '.'));
    if (inches >= 12 && inches <= 23.5) {
      const numericSizeCm = Math.round(inches * 2.54);
      const label = mapInchesToLabel(inches);
      return buildSize(label, category, cleaned, 'EXACT', {
        numericSizeCm,
        ...(heightRange ?? {}),
      });
    }
  }

  // 5. Rider height range alone (e.g. "170-182 см")
  if (heightRange && heightRange.maxRiderHeightCm >= heightRange.minRiderHeightCm) {
    const mid = Math.round((heightRange.minRiderHeightCm + heightRange.maxRiderHeightCm) / 2);
    const label = mapRiderHeightToLabel(mid);
    return buildSize(label, category, cleaned, 'ESTIMATED', heightRange);
  }

  return null;
}

/**
 * Extracts a frame size hint from a free-text listing title or description
 * without confusing wheel sizes (`26"`, `27.5"`, `28"`, `29"`) or model years (`2024`, `2025`).
 */
function parseSizeFromTitle(
  text: string,
  category: BikeCategoryType,
): NormalizedFrameSize | null {
  const cleaned = cleanText(text);
  if (!cleaned) {
    return null;
  }

  // Frame size explicitly annotated: "рама M", "рама 19\"", "розмір рами L", "frame 54", "size M"
  const labeledFrame = cleaned.match(
    /(?:рама|розмір(?:\s+рами)?|размер(?:\s+рамы)?|ростовка|frame|size)\s*[:=-]?\s*([A-ZА-ЯІЇЄ]{1,3}(?:\/[A-Z]{1,2})?|\d{2}(?:[.,]5)?\s*(?:"|″|''|см|cm|мм|mm|дюйм\p{L}*)?)/iu,
  );
  if (labeledFrame) {
    const parsed = parseExplicitSizeString(labeledFrame[1]!, category);
    if (parsed) {
      return parsed;
    }
  }

  // Inches marked right with quote inside bike title in valid frame-size range 13"..22"
  const inlineInch = cleaned.match(/(?:^|[\s(/,])(1[3-9](?:[.,]5)?|2[0-2](?:[.,]5)?)(?:"|″|'')/);
  if (inlineInch) {
    const inches = Number.parseFloat(inlineInch[1]!.replace(',', '.'));
    return buildSize(mapInchesToLabel(inches), category, inlineInch[0].trim(), 'EXACT', {
      numericSizeCm: Math.round(inches * 2.54),
    });
  }

  // Road/gravel cm size like "54 см", "56cm"
  const inlineCm = cleaned.match(/(?:^|[\s(/,])(4[4-9]|5\d|6[0-3])\s*(?:см|cm)(?=$|[\s),/])/i);
  if (inlineCm) {
    const cm = Number.parseInt(inlineCm[1]!, 10);
    return buildSize(mapCmToLabel(cm, category), category, inlineCm[0].trim(), 'EXACT', {
      numericSizeCm: cm,
    });
  }

  // Standalone letter label wrapped in parens or preceded by whitespace/comma e.g. `28" L`, `(M)`, `- XL`
  // Only match standard uppercase Latin tokens to avoid capturing random words like "s" in specs.
  const inlineLetter = cleaned.match(
    /(?:^|[\s(/,-])(XXS|XS|XXL|XL|S\/M|M\/L|ML|S|M|L)(?=$|[\s),/]|-\s|\s+(?:20[0-2]\d|чорн|синій|сір|зелен|біл|черв|black|grey|gray|green|blue|red|white|silver|matt))/u,
  );
  if (inlineLetter) {
    const token = inlineLetter[1]!;
    // Avoid catching single-letter model suffixes like "X", "S" right after digits like "Trek 8 S" unless isolated from decimals
    const label = normalizeLetterToken(token);
    if (label) {
      return buildSize(label, category, token, 'ESTIMATED');
    }
  }

  // Rider height hint in title/description: "на зріст 170-185 см"
  const riderHeight = cleaned.match(
    /(?:зріст|рост|ріст|на\s+рост)\s*[:=-]?\s*(1[4-9]\d|20\d)\s*[-–—]\s*(1[4-9]\d|20\d|21[0-5])/i,
  );
  if (riderHeight) {
    const minH = Number.parseInt(riderHeight[1]!, 10);
    const maxH = Number.parseInt(riderHeight[2]!, 10);
    if (maxH >= minH) {
      const mid = Math.round((minH + maxH) / 2);
      return buildSize(mapRiderHeightToLabel(mid), category, riderHeight[0], 'ESTIMATED', {
        minRiderHeightCm: minH,
        maxRiderHeightCm: maxH,
      });
    }
  }

  return null;
}

/**
 * Unifies letter (`XS..XL`, `S/M`, `ML`, Cyrillic `М`), inch (`15"`..`22"`),
 * centimeter (`46..62 cm`), millimeter (`540 mm`), and rider-height size strings
 * into the canonical `FrameSizeLabelType` (`XS | S | M | L | XL`).
 */
export function normalizeFrameSize(input: {
  rawSize?: string | null;
  category: BikeCategoryType;
  title?: string | null;
  description?: string | null;
}): NormalizedFrameSize {
  if (input.rawSize) {
    const parsed = parseExplicitSizeString(input.rawSize, input.category);
    if (parsed) {
      return parsed;
    }
  }

  if (input.title) {
    const fromTitle = parseSizeFromTitle(input.title, input.category);
    if (fromTitle) {
      return fromTitle;
    }
  }

  if (input.description) {
    const fromDesc = parseSizeFromTitle(input.description, input.category);
    if (fromDesc) {
      return fromDesc;
    }
  }

  // Default fallback when an OLX/Prom listing omits frame size entirely
  return buildSize('M', input.category, null, 'FALLBACK');
}
