import { mkdir, writeFile } from 'node:fs/promises';
import {
  escapeCsvField,
  formatCsv,
  generateDiffCsv,
  getDefaultReportPath,
  getReportDatePrefix,
  saveCsvReport
} from '../csv';

jest.mock('node:fs/promises', () => ({
  ...jest.requireActual('node:fs/promises'),
  mkdir: jest.fn(),
  writeFile: jest.fn()
}));

const mockMkdir = mkdir as jest.MockedFunction<typeof mkdir>;
const mockWriteFile = writeFile as jest.MockedFunction<typeof writeFile>;

describe('getReportDatePrefix', () => {
  it('should format a given date into YYYYMMDD- prefix format', () => {
    const fixedDate = new Date(2026, 9, 9); // Oct 9, 2026

    expect(getReportDatePrefix(fixedDate)).toBe('20261009-');
  });

  it('should properly zero-pad single digit months and days', () => {
    const singleDigitDate = new Date(2026, 0, 5); // Jan 5, 2026

    expect(getReportDatePrefix(singleDigitDate)).toBe('20260105-');
  });

  it('should generate a valid 9-character prefix matching /^[0-9]{8}-$/ when using current date', () => {
    expect(getReportDatePrefix()).toMatch(/^[0-9]{8}-$/);
  });
});

describe('getDefaultReportPath', () => {
  it('should resolve default path containing the timestamp prefix and filename', () => {
    const fixedDate = new Date(2026, 9, 9);
    const apiFileName = 'loremIpsum.report.csv';
    const docFileName = 'dolorSit.report.csv';
    const apiPath = getDefaultReportPath(apiFileName, fixedDate);
    const docsPath = getDefaultReportPath(docFileName, fixedDate);

    expect(apiPath).toMatch(new RegExp(`reports/20261009-${apiFileName}$`));
    expect(docsPath).toMatch(new RegExp(`reports/20261009-${docFileName}$`));
  });
});

describe('escapeCsvField', () => {
  it.each([
    { description: 'plain string', input: 'normal', expected: 'normal' },
    { description: 'integer number', input: 123, expected: '123' },
    { description: 'zero', input: 0, expected: '0' },
    { description: 'boolean true', input: true, expected: 'true' },
    { description: 'boolean false', input: false, expected: 'false' },
    { description: 'null', input: null, expected: '' },
    { description: 'undefined', input: undefined, expected: '' },
    { description: 'comma delimiter', input: 'with,comma', expected: '"with,comma"' },
    { description: 'double quotes', input: 'with "quotes"', expected: '"with ""quotes"""' },
    { description: 'newline character', input: 'with\nnewline', expected: '"with\nnewline"' },
    { description: 'carriage return character', input: 'with\rreturn', expected: '"with\rreturn"' },
    { description: 'CRLF characters', input: 'with\r\nboth', expected: '"with\r\nboth"' },
    { description: 'combined quotes, commas, and newlines', input: 'all "in, one"\nline', expected: '"all ""in, one""\nline"' },
    { description: 'formula injection (=)', input: '=SUM(1+1)', expected: "'=SUM(1+1)" },
    { description: 'formula injection (+)', input: '+123', expected: "'+123" },
    { description: 'formula injection (-)', input: '-456', expected: "'-456" },
    { description: 'formula injection (@)', input: '@lookup', expected: "'@lookup" },
    { description: 'formula injection (tab)', input: '\ttabPrefix', expected: "'\ttabPrefix" },
    { description: 'formula injection (carriage return prefix)', input: '\rreturnPrefix', expected: '"\'\rreturnPrefix"' }
  ])('should correctly escape field value, $description', ({ input, expected }) => {
    expect(escapeCsvField(input)).toBe(expected);
  });

  it.each([
    { description: 'equals formula', input: '=SUM(1+1)', expected: '=SUM(1+1)' },
    { description: 'plus prefix', input: '+123', expected: '+123' },
    { description: 'minus prefix', input: '-456', expected: '-456' },
    { description: 'at symbol prefix', input: '@lookup', expected: '@lookup' },
    { description: 'tab character prefix', input: '\ttabPrefix', expected: '\ttabPrefix' }
  ])('should preserve raw characters when sanitizeFormulas is false, $description', ({ input, expected }) => {
    expect(escapeCsvField(input, false)).toBe(expected);
  });
});

describe('formatCsv', () => {
  it.each([
    {
      description: 'standard headers and escaped row lines',
      headers: ['col1', 'col2'],
      rows: [
        ['val1', 'val2'],
        ['val3,with,comma', 'val4 "quoted"']
      ],
      expected: 'col1,col2\nval1,val2\n"val3,with,comma","val4 ""quoted"""\n'
    },
    {
      description: 'header with empty rows',
      headers: ['header1'],
      rows: [],
      expected: 'header1\n'
    },
    {
      description: 'empty headers and empty rows',
      headers: [],
      rows: [],
      expected: '\n'
    },
    {
      description: 'mixed data types (numbers, booleans, undefined)',
      headers: ['id', 'name', 'score', 'active'],
      rows: [
        [1, 'Alice', 98.5, true],
        [2, 'Bob, Jr.', undefined, undefined]
      ],
      expected: 'id,name,score,active\n1,Alice,98.5,true\n2,"Bob, Jr.",,\n'
    }
  ])('should format CSV output correctly, $description', ({ headers, rows, expected }) => {
    expect(formatCsv(headers, rows)).toBe(expected);
  });
});

describe('generateDiffCsv', () => {
  it('should format all diff categories with status column prepended', () => {
    const diff = {
      added: [{ id: 'a1', val: 'Added Item' }],
      removed: [{ id: 'r1', val: 'Removed Item' }],
      modified: [{ id: 'm1', val: 'Modified Item' }],
      unchanged: [{ id: 'u1', val: 'Unchanged Item' }]
    };

    const csv = generateDiffCsv(diff, {
      headers: ['status', 'id', 'val'],
      added: item => [item.id, item.val],
      removed: item => [item.id, item.val],
      modified: item => [item.id, item.val],
      unchanged: item => [item.id, item.val]
    });

    const lines = csv.trim().split('\n');

    expect(lines[0]).toBe('status,id,val');
    expect(lines[1]).toBe('ADDED,a1,Added Item');
    expect(lines[2]).toBe('REMOVED,r1,Removed Item');
    expect(lines[3]).toBe('MODIFIED,m1,Modified Item');
    expect(lines[4]).toBe('UNCHANGED,u1,Unchanged Item');
  });
});

describe('saveCsvReport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should recursively create directories, write CSV content to disk, and log completion', async () => {
    mockMkdir.mockResolvedValue(undefined as never);
    mockWriteFile.mockResolvedValue(undefined as never);
    const mockLog = jest.spyOn(console, 'log').mockImplementation(() => {});

    const targetPath = '/path/to/nested/reports/summary.csv';
    const csvContent = 'status,id,name\nADDED,1,Button\n';

    await saveCsvReport(targetPath, csvContent);

    expect(mockMkdir).toHaveBeenCalledWith('/path/to/nested/reports', { recursive: true });
    expect(mockWriteFile).toHaveBeenCalledWith(targetPath, csvContent, 'utf-8');
    expect(mockLog).toHaveBeenCalledWith(`📄 Exported full CSV report: ${targetPath}`);
  });
});
