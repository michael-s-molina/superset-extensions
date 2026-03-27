import { tokenize, parse, Dialect, TokenInfo } from "@polyglot-sql/sdk";

export interface SqlStatement {
  index: number;
  text: string;            // SQL to execute for this row alone
  cumulativeText: string;  // SQL for "execute up to here" (includes all prior CTEs)
  displayText: string;     // text shown in the panel preview
  type: string;            // first keyword: SELECT, INSERT, CTE, etc.
  kind: "statement" | "cte" | "cte-select";
  indented: boolean;
  // Zero-based, matching the Position interface from @apache-superset/core
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

/**
 * Splits a SQL string into individual statements using polyglot's tokenizer,
 * which correctly handles string literals, comments, and dialect-specific
 * constructs (e.g. PostgreSQL dollar-quoting). WITH statements that contain
 * CTEs are expanded into one row per CTE plus a final cte-select row.
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
        const stmts = buildStatements(sql, stmtTokens, statements.length);
        if (stmts) statements.push(...stmts);
        stmtTokens = [];
      }
    } else {
      stmtTokens.push(token);
    }
  }

  // Flush any trailing statement without a terminating semicolon
  if (stmtTokens.length > 0) {
    const stmts = buildStatements(sql, stmtTokens, statements.length);
    if (stmts) statements.push(...stmts);
  }

  return statements;
}

function buildStatements(
  sql: string,
  tokens: TokenInfo[],
  baseIndex: number,
): SqlStatement[] | null {
  const meaningful = tokens.filter((t) => t.text.trim().length > 0);
  if (meaningful.length === 0) return null;

  const first = meaningful[0];
  const last = meaningful[meaningful.length - 1];

  const text = sql.slice(first.span.start, last.span.end);
  if (!text.trim()) return null;

  // Polyglot's span convention: (line, column) is the 1-based EXCLUSIVE END position
  // of the token (not its start). To get the start position:
  //   startLine   = span.line - 1              (0-based; same line for single-line tokens)
  //   startColumn = (span.column - 1) - tokenLength  (0-based; works for ASCII tokens)
  // For the exclusive end: endLine = span.line - 1, endColumn = span.column - 1
  const start = {
    line: first.span.line - 1,
    column: (first.span.column - 1) - (first.span.end - first.span.start),
  };
  const end = {
    line: last.span.line - 1,
    column: last.span.column - 1,
  };

  const expanded = tryExpandCtes(text, start, baseIndex, end);
  if (expanded) return expanded;

  return [{
    index: baseIndex,
    text,
    cumulativeText: text,
    displayText: text,
    type: first.text.toUpperCase(),
    kind: "statement",
    indented: false,
    startLine: start.line,
    startColumn: start.column,
    endLine: end.line,
    endColumn: end.column,
  }];
}

/**
 * If stmtText is a SELECT with CTEs, returns one SqlStatement row per CTE
 * (each with a cumulative preview SQL: `WITH ... SELECT * FROM cte_name`)
 * plus a final cte-select row for the main SELECT. Returns null if no CTEs
 * are found or parsing fails (caller falls back to a plain statement row).
 */
function tryExpandCtes(
  stmtText: string,
  stmtStart: { line: number; column: number },
  baseIndex: number,
  stmtEnd: { line: number; column: number },
): SqlStatement[] | null {
  try {
    const parsed = parse(stmtText, Dialect.Generic);
    if (!parsed.success || !parsed.ast) return null;

    const expressions: any[] = Array.isArray(parsed.ast) ? parsed.ast : [parsed.ast];
    // CTEs live on select.with for simple queries and on union.with for UNION ALL/INTERSECT/EXCEPT
    const expr = expressions.find(
      (e) => e?.select?.with?.ctes?.length > 0 || e?.union?.with?.ctes?.length > 0,
    );
    if (!expr) return null;

    const ctes: any[] = (expr.select ?? expr.union).with.ctes;

    // Tokenize the statement so we can locate CTE body boundaries via token spans.
    // This correctly handles string literals, comments, and dollar-quoted strings.
    const tokenResult = tokenize(stmtText, Dialect.Generic);
    if (!tokenResult.success || !tokenResult.tokens) return null;
    const tokens = tokenResult.tokens;

    // Converts a token's start position (stmtText-relative, 0-based) to an absolute
    // position in the full SQL document.
    const toAbsStart = (token: TokenInfo) => {
      const localCol = (token.span.column - 1) - (token.span.end - token.span.start);
      return {
        line: stmtStart.line + token.span.line - 1,
        column: token.span.line === 1 ? stmtStart.column + localCol : localCol,
      };
    };

    // Converts a token's exclusive end position to an absolute position.
    const toAbsEnd = (token: TokenInfo) => {
      const localEndCol = token.span.column - 1;
      return {
        line: stmtStart.line + token.span.line - 1,
        column: token.span.line === 1 ? stmtStart.column + localEndCol : localEndCol,
      };
    };

    // Scan the token stream from WITH, navigating each CTE: name [(...)] AS (body) [,]
    let ti = tokens.findIndex((t) => t.text.toUpperCase() === "WITH");
    if (ti === -1) return null;
    ti++;
    ti = skipWs(tokens, ti);

    const cteBodies: {
      name: string;
      bodyText: string;
      aliasToken: TokenInfo;
      bodyCloseToken: TokenInfo;
    }[] = [];
    let lastBodyCloseTi = -1;

    for (const cte of ctes) {
      // Expect alias token
      if (tokens[ti]?.text !== cte.alias.name) return null;
      const aliasToken = tokens[ti];
      ti++;
      ti = skipWs(tokens, ti);

      // Optional column alias list: cte_name(col1, col2) AS (body)
      if (tokens[ti]?.text === "(") {
        let colDepth = 1;
        ti++;
        while (ti < tokens.length && colDepth > 0) {
          if (tokens[ti].text === "(") colDepth++;
          else if (tokens[ti].text === ")") colDepth--;
          ti++;
        }
        ti = skipWs(tokens, ti);
      }

      // Expect AS keyword
      if (tokens[ti]?.text.toUpperCase() !== "AS") return null;
      ti++;
      ti = skipWs(tokens, ti);

      // Expect opening paren of the CTE body
      if (tokens[ti]?.text !== "(") return null;
      const bodyOpenToken = tokens[ti];
      ti++;

      // Count paren tokens to find the matching closing paren
      let depth = 1;
      while (ti < tokens.length && depth > 0) {
        if (tokens[ti].text === "(") depth++;
        else if (tokens[ti].text === ")") depth--;
        if (depth > 0) ti++;
      }
      if (depth !== 0) return null;
      const bodyCloseToken = tokens[ti];
      lastBodyCloseTi = ti;

      cteBodies.push({
        name: cte.alias.name as string,
        bodyText: stmtText.slice(bodyOpenToken.span.end, bodyCloseToken.span.start),
        aliasToken,
        bodyCloseToken,
      });

      // Skip past closing paren, optional comma, whitespace to reach next alias or SELECT
      ti++;
      ti = skipWs(tokens, ti);
      if (tokens[ti]?.text === ",") {
        ti++;
        ti = skipWs(tokens, ti);
      }
    }

    const rows: SqlStatement[] = [];

    // One row per CTE with a cumulative preview: WITH cte1, ..., cteN SELECT * FROM cteN
    for (let i = 0; i < cteBodies.length; i++) {
      const { name, bodyText, aliasToken, bodyCloseToken } = cteBodies[i];

      const singleDef = `${name} AS (\n${bodyText}\n)`;
      const singlePreview = `WITH ${singleDef}\nSELECT * FROM ${name}`;

      const cumulativeDefs = cteBodies
        .slice(0, i + 1)
        .map((c) => `${c.name} AS (\n${c.bodyText}\n)`)
        .join(",\n");
      const cumulativePreview = `WITH ${cumulativeDefs}\nSELECT * FROM ${name}`;

      const rowStart = toAbsStart(aliasToken);
      const rowEnd = toAbsEnd(bodyCloseToken);

      rows.push({
        index: baseIndex + rows.length,
        text: singlePreview,
        cumulativeText: cumulativePreview,
        displayText: `${name}: ${bodyText}`,
        type: "CTE",
        kind: "cte",
        indented: true,
        startLine: rowStart.line,
        startColumn: rowStart.column,
        endLine: rowEnd.line,
        endColumn: rowEnd.column,
      });
    }

    // Find the SELECT token that follows the last CTE body
    const selectTi = skipWs(tokens, lastBodyCloseTi + 1);
    const selectToken = tokens[selectTi];
    if (!selectToken) return null;

    const selectStart = toAbsStart(selectToken);

    rows.push({
      index: baseIndex + rows.length,
      text: stmtText,
      cumulativeText: stmtText,
      displayText: stmtText.slice(selectToken.span.start),
      type: selectToken.text.toUpperCase(),
      kind: "cte-select",
      indented: true,
      startLine: selectStart.line,
      startColumn: selectStart.column,
      endLine: stmtEnd.line,
      endColumn: stmtEnd.column,
    });

    return rows;
  } catch {
    return null;
  }
}

function skipWs(tokens: TokenInfo[], ti: number): number {
  while (ti < tokens.length && tokens[ti].text.trim() === "") ti++;
  return ti;
}
