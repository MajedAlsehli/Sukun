import { writeHomeownersCsv } from '../homeowner.csv';
import { HomeownerRecordDto } from '../homeowner.mapper';

function row(overrides: Partial<HomeownerRecordDto>): HomeownerRecordDto {
  return {
    id: 'user-1',
    name: 'Ahmed Al-Otaibi',
    nationalId: '1234567890',
    email: 'ahmed@example.com',
    phone: '0500000000',
    status: 'ACTIVE',
    unit: { id: 'unit-1', number: '101', buildingName: 'A', projectName: 'Sedra' },
    moveInDate: new Date('2026-01-15T00:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('writeHomeownersCsv', () => {
  it('starts with a UTF-8 BOM so Excel renders Arabic fields correctly', () => {
    const csv = writeHomeownersCsv([row({})]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('renders Arabic name/project/building fields intact', () => {
    const csv = writeHomeownersCsv([
      row({
        name: 'محمد العتيبي',
        unit: { id: 'unit-1', number: '101', buildingName: 'مبنى أ', projectName: 'مشروع سدرة' },
      }),
    ]);
    expect(csv).toContain('محمد العتيبي');
    expect(csv).toContain('مبنى أ');
    expect(csv).toContain('مشروع سدرة');
  });

  it('escapes embedded double quotes per RFC 4180', () => {
    const csv = writeHomeownersCsv([row({ name: 'Say "Hello"' })]);
    expect(csv).toContain('"Say ""Hello"""');
  });

  it.each(['=HYPERLINK("http://evil.test","click")', '+cmd|/c calc', '-2+3', '@SUM(1,1)'])(
    'neutralizes formula-injection payloads by prefixing a leading apostrophe: %s',
    (payload) => {
      const csv = writeHomeownersCsv([row({ name: payload })]);
      const dataLine = csv.split('\r\n')[1];
      const nameField = dataLine.split(',')[0];
      expect(nameField.startsWith(`"'${payload.charAt(0)}`)).toBe(true);
      // The raw, un-prefixed payload's leading character must never start
      // the field unescaped - that's the actual formula-injection exposure.
      expect(nameField.startsWith(`"${payload.charAt(0)}`)).toBe(false);
    },
  );

  it('never includes a password hash, token, or activation code field', () => {
    const csv = writeHomeownersCsv([row({})]);
    expect(csv.toLowerCase()).not.toContain('password');
    expect(csv.toLowerCase()).not.toContain('token');
    expect(csv.toLowerCase()).not.toContain('activationcode');
  });

  it('renders an empty unit/moveInDate honestly for a still-pending homeowner', () => {
    const csv = writeHomeownersCsv([row({ unit: null, moveInDate: null, status: 'PENDING' })]);
    const dataLine = csv.split('\r\n')[1];
    expect(dataLine).toBe('"Ahmed Al-Otaibi","1234567890","ahmed@example.com","0500000000","PENDING","","","",""');
  });
});
