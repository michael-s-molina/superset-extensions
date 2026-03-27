import { init } from "@polyglot-sql/sdk";
import { parseStatements } from "./sqlParser";

beforeAll(async () => {
  await init();
});

function stmts(sql: string) {
  return parseStatements(sql);
}

// ─── Single statements ────────────────────────────────────────────────────────

test("single statement: simple SELECT", () => {
  const result = stmts("SELECT 1");
  expect(result).toHaveLength(1);
  expect(result[0].type).toBe("SELECT");
  expect(result[0].kind).toBe("statement");
  expect(result[0].text).toBe("SELECT 1");
  expect(result[0].displayText).toBe("SELECT 1");
  expect(result[0].indented).toBe(false);
});

test("single statement: trailing semicolon is excluded from text", () => {
  const result = stmts("SELECT 1;");
  expect(result).toHaveLength(1);
  expect(result[0].text).toBe("SELECT 1");
});

test("single statement: INSERT", () => {
  const result = stmts("INSERT INTO t VALUES (1)");
  expect(result[0].type).toBe("INSERT");
  expect(result[0].kind).toBe("statement");
});

test("single statement: UPDATE", () => {
  const result = stmts("UPDATE t SET a = 1 WHERE id = 2");
  expect(result[0].type).toBe("UPDATE");
});

test("single statement: DELETE", () => {
  const result = stmts("DELETE FROM t WHERE id = 1");
  expect(result[0].type).toBe("DELETE");
});

test("single statement: CREATE TABLE", () => {
  const result = stmts("CREATE TABLE foo (id INT)");
  expect(result[0].type).toBe("CREATE");
});

test("single statement: DROP TABLE", () => {
  const result = stmts("DROP TABLE foo");
  expect(result[0].type).toBe("DROP");
});

// ─── Multiple statements ──────────────────────────────────────────────────────

test("multiple statements: two SELECTs separated by semicolon", () => {
  const result = stmts("SELECT 1;\nSELECT 2");
  expect(result).toHaveLength(2);
  expect(result[0].text).toBe("SELECT 1");
  expect(result[1].text).toBe("SELECT 2");
  expect(result[0].index).toBe(0);
  expect(result[1].index).toBe(1);
});

test("multiple statements: indices are sequential across mixed types", () => {
  const result = stmts("SELECT 1;\nINSERT INTO t VALUES (1);\nDELETE FROM t");
  expect(result).toHaveLength(3);
  expect(result.map((s) => s.index)).toEqual([0, 1, 2]);
  expect(result.map((s) => s.type)).toEqual(["SELECT", "INSERT", "DELETE"]);
});

test("multiple statements: consecutive semicolons produce no empty rows", () => {
  const result = stmts("SELECT 1;;\nSELECT 2");
  expect(result).toHaveLength(2);
});

test("multiple statements: whitespace-only content between semicolons is skipped", () => {
  const result = stmts("SELECT 1;\n   \nSELECT 2");
  expect(result).toHaveLength(2);
});

// ─── Line / column positions ──────────────────────────────────────────────────

test("positions: single-line statement starts at line 0, column 0", () => {
  const result = stmts("SELECT 1");
  expect(result[0].startLine).toBe(0);
  expect(result[0].startColumn).toBe(0);
});

test("positions: second statement on new line has correct start", () => {
  const result = stmts("SELECT 1;\nSELECT 2");
  expect(result[1].startLine).toBe(1);
  expect(result[1].startColumn).toBe(0);
});

test("positions: indented statement has correct start column", () => {
  const result = stmts("  SELECT 1");
  expect(result[0].startLine).toBe(0);
  expect(result[0].startColumn).toBe(2);
});

test("positions: multi-line statement has correct end line", () => {
  const result = stmts("SELECT\n  a,\n  b\nFROM t");
  expect(result[0].startLine).toBe(0);
  expect(result[0].endLine).toBe(3);
});

test("positions: endColumn is exclusive — points past the last character", () => {
  const result = stmts("SELECT 1");
  expect(result[0].endColumn).toBe(8);
});

// ─── CTE expansion ────────────────────────────────────────────────────────────

const CTE_SQL = `
WITH orders AS (
  SELECT id, amount FROM raw_orders
),
customers AS (
  SELECT id, name FROM raw_customers
)
SELECT o.id, c.name, o.amount
FROM orders o
JOIN customers c ON o.id = c.id
`.trim();

test("CTE: WITH statement expands into CTE rows + cte-select", () => {
  const result = stmts(CTE_SQL);
  expect(result).toHaveLength(3); // 2 CTEs + 1 cte-select
});

test("CTE: CTE rows have kind=cte, indented=true, type=CTE", () => {
  const cteRows = stmts(CTE_SQL).filter((s) => s.kind === "cte");
  expect(cteRows).toHaveLength(2);
  cteRows.forEach((row) => {
    expect(row.type).toBe("CTE");
    expect(row.indented).toBe(true);
  });
});

test("CTE: displayText is 'name: body'", () => {
  const result = stmts(CTE_SQL);
  expect(result[0].displayText).toContain("orders:");
  expect(result[1].displayText).toContain("customers:");
});

test("CTE: first CTE text wraps only cte1", () => {
  const preview = stmts(CTE_SQL)[0].text;
  expect(preview).toMatch(/^WITH orders AS/);
  expect(preview).toMatch(/SELECT \* FROM orders$/);
  expect(preview).not.toContain("customers");
});

test("CTE: second CTE text wraps only cte2", () => {
  const preview = stmts(CTE_SQL)[1].text;
  expect(preview).toMatch(/^WITH customers AS/);
  expect(preview).toMatch(/SELECT \* FROM customers$/);
  expect(preview).not.toContain("orders");
});

test("CTE: first CTE cumulativeText wraps only cte1", () => {
  const preview = stmts(CTE_SQL)[0].cumulativeText;
  expect(preview).toMatch(/^WITH orders AS/);
  expect(preview).toMatch(/SELECT \* FROM orders$/);
  expect(preview).not.toContain("customers");
});

test("CTE: second CTE cumulativeText wraps cte1 and cte2 cumulatively", () => {
  const preview = stmts(CTE_SQL)[1].cumulativeText;
  expect(preview).toMatch(/^WITH orders AS/);
  expect(preview).toContain("customers AS");
  expect(preview).toMatch(/SELECT \* FROM customers$/);
});

test("CTE: cte-select row has kind=cte-select and full statement as text and cumulativeText", () => {
  const selectRow = stmts(CTE_SQL).find((s) => s.kind === "cte-select")!;
  expect(selectRow.type).toBe("SELECT");
  expect(selectRow.indented).toBe(true);
  expect(selectRow.text).toBe(CTE_SQL);
  expect(selectRow.cumulativeText).toBe(CTE_SQL);
});

test("CTE: cte-select displayText starts with SELECT", () => {
  const selectRow = stmts(CTE_SQL).find((s) => s.kind === "cte-select")!;
  expect(selectRow.displayText.trimStart()).toMatch(/^SELECT/i);
});

test("CTE: indices are sequential", () => {
  expect(stmts(CTE_SQL).map((s) => s.index)).toEqual([0, 1, 2]);
});

test("CTE: row starts at alias position, not at WITH keyword", () => {
  const result = stmts(CTE_SQL);
  // 'orders' is at column 5 after 'WITH ' — not column 0 where WITH lives
  expect(result[0].startColumn).toBeGreaterThan(0);
});

// ─── CTE + regular statements mixed ──────────────────────────────────────────

const MIXED_SQL = [
  "CREATE TABLE staging AS SELECT 1",
  "WITH enriched AS (\n  SELECT * FROM staging\n)\nSELECT * FROM enriched",
  "DROP TABLE staging",
].join(";\n");

test("mixed: correct total row count across regular and CTE rows", () => {
  // 1 CREATE + 1 CTE + 1 cte-select + 1 DROP = 4
  expect(stmts(MIXED_SQL)).toHaveLength(4);
});

test("mixed: indices are sequential across regular and CTE rows", () => {
  expect(stmts(MIXED_SQL).map((s) => s.index)).toEqual([0, 1, 2, 3]);
});

test("mixed: kinds are in expected order", () => {
  expect(stmts(MIXED_SQL).map((s) => s.kind)).toEqual([
    "statement",
    "cte",
    "cte-select",
    "statement",
  ]);
});

// ─── CTE edge cases ───────────────────────────────────────────────────────────

test("CTE edge case: single CTE expands into cte + cte-select", () => {
  const result = stmts("WITH t AS (SELECT 1) SELECT * FROM t");
  expect(result).toHaveLength(2);
  expect(result[0].kind).toBe("cte");
  expect(result[1].kind).toBe("cte-select");
});

test("CTE edge case: nested subquery inside CTE body", () => {
  const result = stmts(
    "WITH t AS (SELECT * FROM (SELECT id FROM raw) sub) SELECT * FROM t",
  );
  expect(result).toHaveLength(2);
  expect(result[0].kind).toBe("cte");
});

test("CTE edge case: string literal with parens inside CTE body", () => {
  const result = stmts(
    "WITH t AS (SELECT '(not a paren)' AS s) SELECT * FROM t",
  );
  expect(result).toHaveLength(2);
  expect(result[0].kind).toBe("cte");
});

test("CTE edge case: UNION ALL as the final select", () => {
  const sql =
    "WITH a AS (SELECT 1 AS n), b AS (SELECT 2 AS n)\nSELECT n FROM a\nUNION ALL\nSELECT n FROM b";
  const result = stmts(sql);
  expect(result).toHaveLength(3); // 2 CTEs + 1 cte-select
  expect(result[0].kind).toBe("cte");
  expect(result[1].kind).toBe("cte");
  expect(result[2].kind).toBe("cte-select");
});

test("edge case: plain SELECT is not expanded", () => {
  const result = stmts("SELECT * FROM t");
  expect(result).toHaveLength(1);
  expect(result[0].kind).toBe("statement");
});

test("edge case: empty input returns empty array", () => {
  expect(stmts("")).toHaveLength(0);
});

test("edge case: whitespace-only input returns empty array", () => {
  expect(stmts("   \n\n  ")).toHaveLength(0);
});

test("edge case: comment-only input returns empty array", () => {
  expect(stmts("-- just a comment")).toHaveLength(0);
});

test("edge case: statement with leading comment is parsed correctly", () => {
  const result = stmts("-- get users\nSELECT * FROM users");
  expect(result).toHaveLength(1);
  expect(result[0].type).toBe("SELECT");
});
