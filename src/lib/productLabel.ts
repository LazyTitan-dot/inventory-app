/** Suggestions are never writes. The editor applies only fields reviewed by the user. */
export interface ProductLabelSuggestions {
  brand?: string;
  model?: string;
  category?: string;
  variantName?: string;
  barcode?: string;
}

export interface ProductLabelResult {
  suggestions: ProductLabelSuggestions;
  barcodes: string[];
}

const simplify = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase();

/** GTIN-8/12/13/14, including the check digit. Leading zeros remain significant. */
export function isValidProductGtin(value: string): boolean {
  if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(value) || /^0+$/.test(value)) return false;
  const body = value.slice(0, -1);
  let sum = 0;
  for (let i = body.length - 1, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3)
    sum += Number(body[i]) * weight;
  return (10 - sum % 10) % 10 === Number(value.at(-1));
}

const brands = ['Hisense', 'Samsung', 'Whirlpool', 'Midea', 'TCL', 'LG', 'Daewoo', 'Frigidaire', 'Electrolux', 'Panasonic', 'Haier', 'Oster', 'Black+Decker', 'General Electric', 'GE', 'Bosch', 'Maytag'];
const categoryPatterns: [string, RegExp][] = [
  ['air_conditioner', /\b(?:AIR CONDITIONER|AIRE ACONDICIONADO|INDOOR UNIT|UNIDAD INTERIOR|MINI\s*SPLIT)\b/],
  ['refrigerator', /\b(?:REFRIGERATOR|REFRIGERADOR|NEVERA)\b/],
  ['washing_machine', /\b(?:WASHING MACHINE|LAVADORA)\b/],
  ['tv', /\b(?:TELEVISION|TELEVISOR|SMART TV)\b/],
  ['freezer', /\b(?:FREEZER|CONGELADOR)\b/],
  ['microwave', /\b(?:MICROWAVE|MICROONDAS)\b/],
  ['dryer', /\b(?:TUMBLE DRYER|SECADORA)\b/],
  ['stove', /\b(?:ESTUFA|COOKING RANGE)\b/],
];

/** Extract only commercial essentials from explicit text, never model-number guesses. */
export function parseProductLabel(raw: string, decodedBarcodes: readonly string[] = []): ProductLabelResult {
  const text = raw.slice(0, 20_000).replace(/\p{Cc}/gu, (character) => /[\n\r\t]/.test(character) ? character : '');
  const upper = simplify(text);
  const suggestions: ProductLabelSuggestions = {};
  const brandLabel = text.match(/(?:^|\n)\s*(?:marca|brand)\s*[:：]\s*([^\n]{2,100})/i)?.[1]?.trim();
  if (brandLabel && !/modelo|model|serial|batch|lote/i.test(brandLabel)) suggestions.brand = brandLabel;
  else {
    const found = brands.find((brand) => new RegExp(`(?:^|[^A-Z0-9])${simplify(brand).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^A-Z0-9])`).test(upper));
    if (found) suggestions.brand = found;
  }
  const model = text.match(/(?:^|\n)\s*(?:modelo|model)(?:\s*(?:no\.?|number|n[°º]))?\s*[:：#]?\s*\n?\s*([A-Z0-9][A-Z0-9._/ -]{1,159})/i)?.[1]?.trim();
  if (model && /[A-Z]/i.test(model) && /\d/.test(model) && !/\b(?:SERIAL|BATCH|LOTE|COLOR|BTU|REFRIGERANTE)\b/i.test(model)) suggestions.model = model;
  const category = categoryPatterns.find(([, pattern]) => pattern.test(upper));
  if (category) suggestions.category = category[0];

  const colors: [string, RegExp][] = [
    ['Blanco', /(?:COLOR\s*[:：]?\s*)\b(?:BLANCO|WHITE)\b/],
    ['Negro', /(?:COLOR\s*[:：]?\s*)\b(?:NEGRO|BLACK)\b/],
    ['Gris', /(?:COLOR\s*[:：]?\s*)\b(?:GRIS|GREY|GRAY)\b/],
    ['Plata', /(?:COLOR\s*[:：]?\s*)\b(?:PLATA|SILVER)\b/],
    ['Inoxidable', /(?:COLOR\s*[:：]?\s*)\b(?:INOXIDABLE|STAINLESS STEEL|INOX)\b/],
  ];
  let color: string | undefined;
  if (/\bCOLOR\b/.test(upper)) {
    // OCR often reads a table's headers together before its next row of values.
    const candidates = colors.filter(([, pattern]) => new RegExp(pattern.source.replace('(?:COLOR\\s*[:：]?\\s*)', '')).test(upper));
    if (candidates.length === 1) color = candidates[0]![0];
  }
  const capacityMatch = upper.match(/\b([1-9]\d{0,2}(?:[,. ]\d{3})?|[1-9]\d{3,5})\s*BTU(?:\s*\/\s*H)?\b/);
  const capacity = capacityMatch ? Number(capacityMatch[1]?.replace(/[,. ]/g, '')) : 0;
  const capacityName = capacity >= 4_000 && capacity <= 100_000 ? `${new Intl.NumberFormat('en-US').format(capacity)} BTU` : '';
  const variantName = [capacityName, color].filter(Boolean).join(' · ');
  if (variantName) suggestions.variantName = variantName;

  const printedCodes = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^[\d\s]{8,24}$/.test(line)).map((line) => line.replace(/\s/g, ''));
  const barcodes = [...new Set([...decodedBarcodes, ...printedCodes].map((code) => code.trim()).filter(isValidProductGtin))];
  // Multiple valid product codes need an explicit selection in the review.
  if (barcodes.length === 1) suggestions.barcode = barcodes[0];
  return { suggestions, barcodes };
}
