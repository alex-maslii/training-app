import { describe, expect, it } from 'vitest';

import { expandUpcE, gtinCheckDigit, normalizeBarcode } from './barcode.ts';

describe('gtinCheckDigit', () => {
  it('matches known EAN-13 and UPC-A codes', () => {
    expect(gtinCheckDigit('400638133393')).toBe(1); // 4006381333931
    expect(gtinCheckDigit('03600029145')).toBe(2); // UPC-A 036000291452
  });
});

describe('expandUpcE', () => {
  it('expands the reference example', () => {
    expect(expandUpcE('04252614')).toBe('042100005264');
  });

  it('rejects a wrong check digit', () => {
    expect(expandUpcE('04252615')).toBeNull();
  });
});

describe('normalizeBarcode', () => {
  it('keeps a valid EAN-13', () => {
    expect(normalizeBarcode('4006381333931')).toEqual({ code: '4006381333931', mayBeInStore: false });
  });

  it('strips spaces and dashes', () => {
    expect(normalizeBarcode('4 006381-333931')?.code).toBe('4006381333931');
  });

  it('turns UPC-A into EAN-13 with a leading zero', () => {
    expect(normalizeBarcode('036000291452', 'upc_a')?.code).toBe('0036000291452');
  });

  it('turns a 14-digit GTIN with a leading zero into EAN-13', () => {
    expect(normalizeBarcode('04006381333931')?.code).toBe('4006381333931');
  });

  it('expands UPC-E when the scanner says so', () => {
    expect(normalizeBarcode('04252614', 'upc_e')?.code).toBe('0042100005264');
  });

  it('keeps a valid EAN-8 as 8 digits', () => {
    const body = '9638507';
    const code = `${body}${gtinCheckDigit(body)}`;
    expect(normalizeBarcode(code, 'ean8')).toEqual({ code, mayBeInStore: false });
  });

  it('flags possible in-store codes', () => {
    const body = '200123400150';
    expect(normalizeBarcode(`${body}${gtinCheckDigit(body)}`)?.mayBeInStore).toBe(true);
  });

  it('flags but still accepts retailer own-brand EAN-8 codes (Lidl Alesto)', () => {
    expect(normalizeBarcode('20724696', 'ean8')).toEqual({ code: '20724696', mayBeInStore: true });
  });

  it('does not flag Polish product codes (590)', () => {
    const body = '590123412345';
    expect(normalizeBarcode(`${body}${gtinCheckDigit(body)}`)?.mayBeInStore).toBe(false);
  });

  it('rejects a wrong check digit or length', () => {
    expect(normalizeBarcode('4006381333932')).toBeNull();
    expect(normalizeBarcode('12345')).toBeNull();
  });
});
