/**
 * Barcode normalisation. Every product barcode is stored in one canonical form
 * so the same product never gets two rows:
 * - EAN-13 stays as is.
 * - UPC-A (12 digits) becomes EAN-13 with a leading 0.
 * - UPC-E is expanded to UPC-A first, then to EAN-13.
 * - EAN-8 stays 8 digits (it is its own numbering space).
 */

export type BarcodeType = 'ean13' | 'ean8' | 'upc_a' | 'upc_e';

export type NormalizedBarcode = {
  code: string;
  /**
   * GS1 restricted-circulation prefix. Shops use these for weighed produce, deli and
   * bakery items (the code encodes price or weight), but retailers such as Lidl also
   * use them for their own brands. So always look the code up; treat it as an
   * in-store code only when no product is found.
   */
  mayBeInStore: boolean;
};

/** GTIN check digit for the digits before the check digit. */
export function gtinCheckDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const digit = Number(body[body.length - 1 - i]);
    sum += i % 2 === 0 ? digit * 3 : digit;
  }
  return (10 - (sum % 10)) % 10;
}

function hasValidCheckDigit(code: string): boolean {
  return gtinCheckDigit(code.slice(0, -1)) === Number(code[code.length - 1]);
}

/** Expand an 8-digit UPC-E code to 12-digit UPC-A. Returns null if not valid UPC-E. */
export function expandUpcE(upcE: string): string | null {
  if (!/^[01]\d{7}$/.test(upcE)) return null;
  const numberSystem = upcE[0];
  const d = upcE.slice(1, 7);
  const check = upcE[7];
  const last = Number(d[5]);
  let body: string;
  if (last <= 2) body = `${d[0]}${d[1]}${d[5]}0000${d[2]}${d[3]}${d[4]}`;
  else if (last === 3) body = `${d[0]}${d[1]}${d[2]}00000${d[3]}${d[4]}`;
  else if (last === 4) body = `${d[0]}${d[1]}${d[2]}${d[3]}00000${d[4]}`;
  else body = `${d[0]}${d[1]}${d[2]}${d[3]}${d[4]}0000${d[5]}`;
  const upcA = `${numberSystem}${body}${check}`;
  return hasValidCheckDigit(upcA) ? upcA : null;
}

/**
 * Normalise a scanned or typed barcode. Returns null when the code is not a
 * valid EAN/UPC (wrong length or check digit).
 */
export function normalizeBarcode(raw: string, type?: BarcodeType): NormalizedBarcode | null {
  let code = raw.replace(/\D/g, '');

  if (type === 'upc_e') {
    const expanded = expandUpcE(code);
    if (!expanded) return null;
    code = expanded;
  } else if (type === undefined && code.length === 8 && !hasValidCheckDigit(code)) {
    // Typed 8-digit code that is not a valid EAN-8: try reading it as UPC-E.
    code = expandUpcE(code) ?? code;
  }

  if (code.length === 14 && code.startsWith('0')) code = code.slice(1);
  if (code.length === 12) code = `0${code}`;
  if (code.length !== 13 && code.length !== 8) return null;
  if (!hasValidCheckDigit(code)) return null;

  // GS1 restricted circulation: EAN-13 prefixes 02 and 20–29, EAN-8 prefixes 0 and 2.
  const mayBeInStore =
    code.length === 13 ? code.startsWith('02') || code.startsWith('2') : /^[02]/.test(code);

  return { code, mayBeInStore };
}
