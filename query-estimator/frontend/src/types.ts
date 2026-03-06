export type ResourceLevel = 'low' | 'medium' | 'high' | 'critical';

export type WarningSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface Warning {
  severity: WarningSeverity;
  title: string;
  description: string;
  recommendation?: string;
  affectedTables?: string[];
}

export interface PlanNode {
  nodeType: string;
  rows?: number;
  cost?: number;
  details?: Record<string, string | number | boolean>;
  children?: PlanNode[];
}

export interface EstimationMetrics {
  // Actual execution time from database (ms)
  executionTimeMs: number | null;
  executionTimeLabel: string;

  // Planning time (ms) - PostgreSQL only
  planningTimeMs: number | null;
  planningTimeLabel: string;

  // Memory usage (bytes) - Trino provides this, PostgreSQL does not
  memoryBytes: number | null;
  memoryLabel: string;

  // Estimated/actual rows
  rowsEstimated: number | null;
  rowsLabel: string;

  // Cost units - PostgreSQL only (relative, not time-based)
  cost: number | null;
  costLabel: string;
}

export interface EstimationResult {
  resourceLevel: ResourceLevel;
  metrics: EstimationMetrics;
  warnings: Warning[];
  rawPlan: string | null;
  planTree: PlanNode | null;
  engineType: string;
}

export interface EstimationState {
  loading: boolean;
  error: string | null;
  result: EstimationResult | null;
}

export type EstimationAction =
  | { type: 'ESTIMATE_START' }
  | { type: 'ESTIMATE_SUCCESS'; payload: EstimationResult }
  | { type: 'ESTIMATE_ERROR'; payload: string }
  | { type: 'RESET' };
