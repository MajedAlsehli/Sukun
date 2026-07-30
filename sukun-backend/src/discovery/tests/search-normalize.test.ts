import { normalizeArabicSearch } from '../search-normalize';

describe('normalizeArabicSearch', () => {
  it('normalizes Arabic-Indic and Extended Arabic-Indic digits to ASCII', () => {
    expect(normalizeArabicSearch('٥٠٠٠٠٠')).toBe('500000');
    expect(normalizeArabicSearch('۱۲۳')).toBe('123');
  });

  it('normalizes common alef/yeh/teh-marbuta variants', () => {
    expect(normalizeArabicSearch('أحياء')).toBe('احياء');
    expect(normalizeArabicSearch('الرياضى')).toBe('الرياضي');
    expect(normalizeArabicSearch('مدينة')).toBe('مدينه');
  });

  it('leaves already-normalized text unchanged', () => {
    expect(normalizeArabicSearch('الرياض')).toBe('الرياض');
  });
});
