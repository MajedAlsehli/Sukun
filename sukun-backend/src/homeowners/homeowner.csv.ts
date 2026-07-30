import { HomeownerRecordDto } from './homeowner.mapper';

// Task 5 (decisions.md F13): CSV export security. RFC 4180 field escaping
// plus formula-injection mitigation - any cell whose first character is
// =, +, -, or @ gets a leading apostrophe before quoting, the standard
// mitigation spreadsheet apps honor so a value like `=HYPERLINK(...)` never
// executes when the file is opened in Excel/Numbers/Sheets.
const FORMULA_PREFIX_CHARS = ['=', '+', '-', '@'];

function escapeCsvField(value: string): string {
  let v = value;
  if (FORMULA_PREFIX_CHARS.includes(v.charAt(0))) {
    v = `'${v}`;
  }
  const escaped = v.replace(/"/g, '""');
  return `"${escaped}"`;
}

const HEADERS = ['name', 'nationalId', 'email', 'phone', 'status', 'project', 'building', 'unit', 'moveInDate'] as const;

// UTF-8 BOM so Excel/Numbers render Arabic fields correctly rather than as
// mojibake - a real interop requirement for RTL/Arabic CSV consumers, not a
// stylistic choice.
const UTF8_BOM = '﻿';

export function writeHomeownersCsv(rows: HomeownerRecordDto[]): string {
  const lines = [HEADERS.join(',')];
  for (const row of rows) {
    const fields = [
      row.name,
      row.nationalId ?? '',
      row.email,
      row.phone,
      row.status,
      row.unit?.projectName ?? '',
      row.unit?.buildingName ?? '',
      row.unit?.number ?? '',
      row.moveInDate ? row.moveInDate.toISOString().slice(0, 10) : '',
    ];
    lines.push(fields.map(escapeCsvField).join(','));
  }
  return UTF8_BOM + lines.join('\r\n');
}
