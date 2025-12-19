import type { core } from '@apache-superset/core';

// Re-export Column type for convenience
export type Column = core.Column;

export interface QueryResult {
  columns: Column[];
  data: Array<Record<string, unknown>>;
}

export interface SchemaChange {
  type: 'added' | 'removed' | 'type_changed';
  column: string;
  leftType?: string;
  rightType?: string;
}

export interface RowDiff {
  rowIndex: number;
  type: 'added' | 'removed' | 'modified';
  leftRow?: Record<string, unknown>;
  rightRow?: Record<string, unknown>;
  changedColumns?: string[];
}

export interface CompareResult {
  schemaChanges: SchemaChange[];
  rowDiffs: RowDiff[];
  summary: {
    totalLeft: number;
    totalRight: number;
    addedRows: number;
    removedRows: number;
    modifiedRows: number;
    unchangedRows: number;
  };
}

function compareSchemas(left: Column[], right: Column[]): SchemaChange[] {
  const changes: SchemaChange[] = [];
  const leftMap = new Map(left.map((c) => [c.column_name, c.type]));
  const rightMap = new Map(right.map((c) => [c.column_name, c.type]));

  // Check for removed columns (in left but not in right)
  for (const [colName, colType] of leftMap) {
    if (!rightMap.has(colName)) {
      changes.push({
        type: 'removed',
        column: colName,
        leftType: colType,
      });
    }
  }

  // Check for added columns and type changes
  for (const [colName, colType] of rightMap) {
    if (!leftMap.has(colName)) {
      changes.push({
        type: 'added',
        column: colName,
        rightType: colType,
      });
    } else if (leftMap.get(colName) !== colType) {
      changes.push({
        type: 'type_changed',
        column: colName,
        leftType: leftMap.get(colName),
        rightType: colType,
      });
    }
  }

  return changes;
}

function rowsEqual(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
  columns: string[]
): { equal: boolean; changedColumns: string[] } {
  const changedColumns: string[] = [];

  for (const col of columns) {
    const leftVal = left[col];
    const rightVal = right[col];

    if (JSON.stringify(leftVal) !== JSON.stringify(rightVal)) {
      changedColumns.push(col);
    }
  }

  return { equal: changedColumns.length === 0, changedColumns };
}

export function compareResults(
  left: QueryResult,
  right: QueryResult
): CompareResult {
  const schemaChanges = compareSchemas(left.columns, right.columns);

  // Get common columns for comparison
  const leftColNames = new Set(left.columns.map((c) => c.column_name));
  const rightColNames = new Set(right.columns.map((c) => c.column_name));
  const commonColumns = [...leftColNames].filter((c) => rightColNames.has(c));

  const rowDiffs: RowDiff[] = [];
  const maxRows = Math.max(left.data.length, right.data.length);

  let addedRows = 0;
  let removedRows = 0;
  let modifiedRows = 0;
  let unchangedRows = 0;

  for (let i = 0; i < maxRows; i++) {
    const leftRow = left.data[i];
    const rightRow = right.data[i];

    if (!leftRow && rightRow) {
      // Row added in right
      rowDiffs.push({
        rowIndex: i,
        type: 'added',
        rightRow,
      });
      addedRows++;
    } else if (leftRow && !rightRow) {
      // Row removed from left
      rowDiffs.push({
        rowIndex: i,
        type: 'removed',
        leftRow,
      });
      removedRows++;
    } else if (leftRow && rightRow) {
      // Both exist, check for modifications
      const { equal, changedColumns } = rowsEqual(leftRow, rightRow, commonColumns);

      if (!equal) {
        rowDiffs.push({
          rowIndex: i,
          type: 'modified',
          leftRow,
          rightRow,
          changedColumns,
        });
        modifiedRows++;
      } else {
        unchangedRows++;
      }
    }
  }

  return {
    schemaChanges,
    rowDiffs,
    summary: {
      totalLeft: left.data.length,
      totalRight: right.data.length,
      addedRows,
      removedRows,
      modifiedRows,
      unchangedRows,
    },
  };
}
