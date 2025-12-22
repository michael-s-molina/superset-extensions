import { core } from '@apache-superset/core';

export interface NumericStats {
  min: number;
  max: number;
  mean: number;
  median: number;
  stdDev: number;
}

export interface StringStats {
  minLength: number;
  maxLength: number;
  avgLength: number;
  emptyCount: number;
}

export interface TemporalStats {
  min: string;
  max: string;
  rangeDescription: string;
}

export interface BooleanStats {
  trueCount: number;
  falseCount: number;
  truePercent: number;
}

export interface ColumnStats {
  name: string;
  typeGeneric: core.GenericDataType;
  nullCount: number;
  nullPercent: number;
  distinctCount: number;
  distinctPercent: number;
  mostFrequent?: { value: string | number | null; count: number };
  numericStats?: NumericStats;
  stringStats?: StringStats;
  temporalStats?: TemporalStats;
  booleanStats?: BooleanStats;
}

export interface ResultStats {
  rowCount: number;
  columnCount: number;
  columns: ColumnStats[];
}

export type StatsState = {
  stats: ResultStats | null;
  loading: boolean;
  error: string | null;
};

export type StatsAction =
  | { type: 'COMPUTE_START' }
  | { type: 'COMPUTE_SUCCESS'; payload: ResultStats }
  | { type: 'COMPUTE_ERROR'; payload: string }
  | { type: 'CLEAR' };
