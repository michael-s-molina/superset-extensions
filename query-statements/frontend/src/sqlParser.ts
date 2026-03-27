import { tokenize, Dialect, TokenInfo } from "@polyglot-sql/sdk";

export interface SqlStatement {
  index: number;
  text: string;
  // Zero-based, matching the Position interface from @apache-superset/core
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

/**
 * Splits a SQL string into individual statements using polyglot's tokenizer,
 * which correctly handles string literals, comments, and dialect-specific
 * constructs (e.g. PostgreSQL dollar-quoting).
 *
 * Line and column numbers are zero-based to match the EditorHandle Position
 * interface from @apache-superset/core. endColumn is exclusive (one past the
 * last character), matching Monaco's selection convention.
 */
export function parseStatements(sql: string): SqlStatement[] {
  const result = tokenize(sql, Dialect.Generic);
  if (!result.success || !result.tokens) return [];

  const statements: SqlStatement[] = [];
  let stmtTokens: TokenInfo[] = [];

  for (const token of result.tokens) {
    if (token.text === ";") {
      if (stmtTokens.length > 0) {
        const stmt = buildStatement(sql, stmtTokens, statements.length);
        if (stmt) statements.push(stmt);
        stmtTokens = [];
      }
    } else {
      stmtTokens.push(token);
    }
  }

  // Flush any trailing statement without a terminating semicolon
  if (stmtTokens.length > 0) {
    const stmt = buildStatement(sql, stmtTokens, statements.length);
    if (stmt) statements.push(stmt);
  }

  return statements;
}

function buildStatement(
  sql: string,
  tokens: TokenInfo[],
  index: number,
): SqlStatement | null {
  // Guard against runs of whitespace-only tokens between semicolons
  const meaningful = tokens.filter((t) => t.text.trim().length > 0);
  if (meaningful.length === 0) return null;

  const first = meaningful[0];
  const last = meaningful[meaningful.length - 1];

  // Extract original SQL text between first and last token using character offsets
  const text = sql.slice(first.span.start, last.span.end);
  if (!text.trim()) return null;

  // Derive positions by walking the SQL string up to the character offsets.
  // This avoids relying on span.line / span.column whose base (0 vs 1) is
  // ambiguous across polyglot versions.
  const start = offsetToLineCol(sql, first.span.start);
  const end = offsetToLineCol(sql, last.span.end); // exclusive end

  return {
    index,
    text,
    startLine: start.line,
    startColumn: start.column,
    endLine: end.line,
    endColumn: end.column,
  };
}

/**
 * Walks `sql` up to `offset` and returns the 0-based (line, column) at that
 * position. When passed `span.end` (exclusive), the result is the exclusive
 * end position suitable for Monaco selections.
 */
function offsetToLineCol(sql: string, offset: number): { line: number; column: number } {
  let line = 0;
  let col = 0;
  for (let i = 0; i < offset; i++) {
    if (sql[i] === "\n") {
      line++;
      col = 0;
    } else {
      col++;
    }
  }
  return { line, column: col };
}

export function getStatementType(text: string): string {
  const match = text.match(/^\s*(\w+)/i);
  return match ? match[1].toUpperCase() : "SQL";
}
