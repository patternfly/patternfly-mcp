import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { getReportsPath } from './helpers';

/**
 * Value types stored in a CSV cell.
 *
 * - `string`: For text-based values within a CSV cell.
 * - `number`: For numeric values within a CSV cell.
 * - `boolean`: For true/false values within a CSV cell.
 * - `undefined`: Represents the absence of a value within a CSV cell.
 */
type CsvCellValue = string | number | boolean | undefined;

/**
 * Diff status
 *
 * - `ADDED`: Item exists in the target but not in the source.
 * - `REMOVED`: Item exists in the source but not in the target.
 * - `MODIFIED`: Item exists in both the source and target but has changed.
 * - `UNCHANGED`: Item exists in both the source and the target without any change.
 */
type DiffStatus = 'ADDED' | 'REMOVED' | 'MODIFIED' | 'UNCHANGED';

/**
 * Diff row mapping transformations for each status category.
 */
interface DiffReportRowMappers<TAdded, TRemoved, TModified, TUnchanged> {
  headers: string[];
  added: (item: TAdded) => CsvCellValue[];
  removed: (item: TRemoved) => CsvCellValue[];
  modified: (item: TModified) => CsvCellValue[];
  unchanged: (item: TUnchanged) => CsvCellValue[];
}

/**
 * Generic container for categorized diff sets.
 */
interface GenericDiff<TAdded, TRemoved, TModified, TUnchanged> {
  added: Iterable<TAdded>;
  removed: Iterable<TRemoved>;
  modified: Iterable<TModified>;
  unchanged: Iterable<TUnchanged>;
}

/**
 * Generate a YYYYMMDD date prefix with trailing hyphen for report filenames.
 *
 * @param [date=new Date()] - Target date to format
 * @returns Formatted date prefix (e.g., "20261009-")
 */
const getReportDatePrefix = (date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}${month}${day}-`;
};

/**
 * Resolve the default absolute path for a CSV report with a YYYYMMDD- prefix.
 *
 * @param filename - Base report filename
 * @param [date=new Date()] - Date to use for the timestamp prefix
 * @returns Fully resolved filesystem path in the reports directory
 */
const getDefaultReportPath = (filename: string, date = new Date()): string => {
  const prefix = getReportDatePrefix(date);

  return getReportsPath(`${prefix}${filename}`);
};

/**
 * Safely escape and format a field for standard RFC 4180 CSV output.
 *
 * @note **CSV / Formula Injection:** By default (`sanitizeFormulas = true`), leading formula
 * trigger characters are prefixed with a single quote to prevent spreadsheet execution. Pass
 * `false` to preserve strict raw string fidelity for automated downstream parsers.
 *
 * @param field - Value to format for CSV
 * @param [sanitizeFormulas=true] - Whether to prefix formula trigger characters with a single quote
 * @returns RFC 4180 compliant CSV cell string
 */
const escapeCsvField = (field: unknown, sanitizeFormulas = true): string => {
  if (field === null || field === undefined) {
    return '';
  }

  let str = String(field);

  if (sanitizeFormulas && /^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
};

/**
 * Format rows and headers into standard CSV string.
 *
 * @param headers - Column headers
 * @param rows - Table rows
 * @returns Formatted RFC 4180 CSV string
 */
const formatCsv = (
  headers: string[],
  rows: CsvCellValue[][]
): string => {
  const headerLine = headers.map(header => escapeCsvField(header)).join(',');
  const rowLines = rows.map(row => row.map(cell => escapeCsvField(cell)).join(','));

  return [headerLine, ...rowLines].join('\n') + '\n';
};

/**
 * Generic CSV generator for collection diff reports.
 * Handles iteration across status buckets, prepends status tags, and formats RFC 4180 CSV.
 *
 * @param diff - Categorized diff buckets
 * @param mappers - Column headers and row mapping functions
 * @returns RFC 4180 CSV string
 */
const generateDiffCsv = <TAdded, TRemoved, TModified, TUnchanged>(
  diff: GenericDiff<TAdded, TRemoved, TModified, TUnchanged>,
  mappers: DiffReportRowMappers<TAdded, TRemoved, TModified, TUnchanged>
): string => {
  const rows: CsvCellValue[][] = [];

  for (const item of diff.added) {
    rows.push(['ADDED', ...mappers.added(item)]);
  }
  for (const item of diff.removed) {
    rows.push(['REMOVED', ...mappers.removed(item)]);
  }
  for (const item of diff.modified) {
    rows.push(['MODIFIED', ...mappers.modified(item)]);
  }
  for (const item of diff.unchanged) {
    rows.push(['UNCHANGED', ...mappers.unchanged(item)]);
  }

  return formatCsv(mappers.headers, rows);
};

/**
 * Standardized helper to persist a CSV report to disk and log output status.
 *
 * @param targetPath - Absolute or relative file path for the CSV report
 * @param csvContent - Pre-formatted CSV string content
 */
const saveCsvReport = async (targetPath: string, csvContent: string): Promise<void> => {
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, csvContent, 'utf-8');
  console.log(`📄 Exported full CSV report: ${targetPath}`);
};

export {
  getDefaultReportPath,
  getReportDatePrefix,
  escapeCsvField,
  formatCsv,
  generateDiffCsv,
  saveCsvReport,
  type CsvCellValue,
  type DiffReportRowMappers,
  type DiffStatus,
  type GenericDiff
};
