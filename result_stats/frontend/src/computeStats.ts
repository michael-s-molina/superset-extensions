import { core } from '@apache-superset/core';
import {
  ColumnStats,
  ResultStats,
  NumericStats,
  StringStats,
  TemporalStats,
  BooleanStats,
} from './types';

type QueryResultRow = Record<string, unknown>;

const percentile = (sorted: number[], p: number): number => {
  const index = p * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return sorted[lower] + (index - lower) * (sorted[upper] - sorted[lower]);
};

const getNumericStats = (values: unknown[], rowCount: number): NumericStats | undefined => {
  const numbers = values
    .filter((v): v is number | string => v !== null && v !== undefined)
    .map(v => (typeof v === 'number' ? v : Number(v)))
    .filter(n => !isNaN(n) && isFinite(n));

  if (numbers.length === 0) return undefined;

  const min = Math.min(...numbers);
  const max = Math.max(...numbers);

  const sum = numbers.reduce((acc, n) => acc + n, 0);
  const mean = sum / numbers.length;

  const sorted = [...numbers].sort((a, b) => a - b);

  const squaredDiffs = numbers.map(n => Math.pow(n - mean, 2));
  const avgSquaredDiff =
    squaredDiffs.reduce((acc, n) => acc + n, 0) / numbers.length;
  const stdDev = Math.sqrt(avgSquaredDiff);

  const zeroCount = numbers.filter(n => n === 0).length;
  const zeroPercent = (zeroCount / rowCount) * 100;

  return { min, max, mean, p25: percentile(sorted, 0.25), p50: percentile(sorted, 0.5), p75: percentile(sorted, 0.75), stdDev, zeroCount, zeroPercent };
};

const getStringStats = (values: unknown[]): StringStats | undefined => {
  const strings = values
    .filter((v): v is string => typeof v === 'string' && v.trim() !== '');

  if (strings.length === 0) return undefined;

  const lengths = strings.map(s => s.length);
  const minLength = Math.min(...lengths);
  const maxLength = Math.max(...lengths);
  const avgLength = lengths.reduce((acc, l) => acc + l, 0) / lengths.length;

  return { minLength, maxLength, avgLength };
};

const formatDateRange = (minDate: Date, maxDate: Date): string => {
  const diffMs = maxDate.getTime() - minDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'same day';
  if (diffDays === 1) return '1 day';
  if (diffDays < 30) return `${diffDays} days`;

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) {
    return diffMonths === 1 ? '1 month' : `${diffMonths} months`;
  }

  const diffYears = Math.floor(diffDays / 365);
  const remainingMonths = Math.floor((diffDays % 365) / 30);

  if (remainingMonths === 0) {
    return diffYears === 1 ? '1 year' : `${diffYears} years`;
  }

  const yearStr = diffYears === 1 ? '1 year' : `${diffYears} years`;
  const monthStr = remainingMonths === 1 ? '1 month' : `${remainingMonths} months`;
  return `${yearStr}, ${monthStr}`;
};

const getTemporalStats = (values: unknown[]): TemporalStats | undefined => {
  const dates = values
    .filter(v => v !== null && v !== undefined)
    .map(v => new Date(String(v)))
    .filter(d => !isNaN(d.getTime()));

  if (dates.length === 0) return undefined;

  dates.sort((a, b) => a.getTime() - b.getTime());

  const minDate = dates[0];
  const maxDate = dates[dates.length - 1];

  return {
    min: minDate.toISOString(),
    max: maxDate.toISOString(),
    rangeDescription: formatDateRange(minDate, maxDate),
  };
};

const getBooleanStats = (
  values: unknown[],
): BooleanStats | undefined => {
  const booleanLike = values.filter(
    (v): v is boolean | number =>
      typeof v === 'boolean' || v === 0 || v === 1,
  );

  if (booleanLike.length === 0) return undefined;

  let trueCount = 0;
  let falseCount = 0;
  for (const b of booleanLike) {
    if (b === true || b === 1) trueCount++;
    else falseCount++;
  }
  const total = trueCount + falseCount;

  return {
    trueCount,
    falseCount,
    truePercent: total > 0 ? (trueCount / total) * 100 : 0,
    falsePercent: total > 0 ? (falseCount / total) * 100 : 0,
  };
};

const getTopFrequent = (
  values: unknown[],
  n: number,
): ColumnStats['topFrequent'] => {
  const frequency = new Map<string, { original: string | number | null; count: number }>();

  for (const value of values) {
    const key =
      value === null || value === undefined ? '__null__' : String(value);
    const existing = frequency.get(key);
    if (existing) {
      existing.count++;
    } else {
      const original: string | number | null =
        value === null || value === undefined
          ? null
          : typeof value === 'string' || typeof value === 'number'
          ? value
          : String(value);
      frequency.set(key, { original, count: 1 });
    }
  }

  return Array.from(frequency.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, n)
    .map(({ original, count }) => ({ value: original, count }));
};

export const computeStats = (
  data: QueryResultRow[],
  columns: core.Column[],
): ResultStats => {
  if (data.length === 0) {
    return {
      rowCount: 0,
      columnCount: 0,
      columns: [],
    };
  }

  const rowCount = data.length;
  const columnCount = columns.length;

  const columnStats: ColumnStats[] = columns.map(col => {
    const values = data.map(row => row[col.name]);
    const isString = col.type_generic === core.GenericDataType.String;
    const isEmpty = (v: unknown) =>
      v === null || v === undefined || (isString && typeof v === 'string' && v.trim() === '');
    const emptyCount = values.filter(isEmpty).length;
    const nonEmptyValues = values.filter(v => !isEmpty(v));
    const distinctValues = new Set(nonEmptyValues.map(String));

    const typeGeneric = col.type_generic;
    const topFrequent = getTopFrequent(values, 1);

    let numericStats: NumericStats | undefined;
    let stringStats: StringStats | undefined;
    let temporalStats: TemporalStats | undefined;
    let booleanStats: BooleanStats | undefined;

    switch (typeGeneric) {
      case core.GenericDataType.Numeric:
        numericStats = getNumericStats(values, rowCount);
        break;
      case core.GenericDataType.String:
        stringStats = getStringStats(values);
        break;
      case core.GenericDataType.Temporal:
        temporalStats = getTemporalStats(values);
        break;
      case core.GenericDataType.Boolean:
        booleanStats = getBooleanStats(values);
        break;
    }

    return {
      name: col.name,
      typeGeneric,
      emptyCount,
      emptyPercent: (emptyCount / rowCount) * 100,
      distinctCount: distinctValues.size,
      distinctPercent: (distinctValues.size / rowCount) * 100,
      topFrequent,
      numericStats,
      stringStats,
      temporalStats,
      booleanStats,
    };
  });

  return {
    rowCount,
    columnCount,
    columns: columnStats,
  };
};
