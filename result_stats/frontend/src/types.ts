import { core, sqlLab } from '@apache-superset/core';

export interface NumericStats {
  min: number;
  max: number;
  mean: number;
  p25: number;
  p50: number;
  p75: number;
  stdDev: number;
  zeroCount: number;
  zeroPercent: number;
}

export interface StringStats {
  minLength: number;
  maxLength: number;
  avgLength: number;
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
  falsePercent: number;
}

export interface ColumnStats {
  name: string;
  typeGeneric: core.GenericDataType;
  emptyCount: number;
  emptyPercent: number;
  distinctCount: number;
  distinctPercent: number;
  topFrequent: { value: string | number | null; count: number }[];
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

export type PendingResult = {
  data: sqlLab.QueryResultContext['result']['data'];
  columns: sqlLab.QueryResultContext['result']['columns'];
};

export type StatsState = {
  stats: ResultStats | null;
  loading: boolean;
  error: string | null;
  pendingResult: PendingResult | null;
};

export type StatsAction =
  | { type: 'COMPUTE_START' }
  | { type: 'COMPUTE_SUCCESS'; payload: ResultStats }
  | { type: 'COMPUTE_ERROR'; payload: string }
  | { type: 'SET_PENDING'; payload: PendingResult }
  | { type: 'CLEAR' };
