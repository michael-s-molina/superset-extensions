import { useMemo } from "react";
import { dashboard, views } from "@apache-superset/core";

const BUILDING_BLOCKS_LOCATION = "dashboard.buildingBlocks";

export interface ClientTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  // Typed unknown rather than a concrete shape: the model's tool-call
  // arguments only conform to inputSchema at runtime, not statically, so
  // each handler below casts internally (same pattern as useSqlLabMCP.ts).
  handler: (input: unknown) => Promise<unknown> | unknown;
}

const emptyInputSchema = { type: "object" as const, properties: {} };

// Shared placement fields — how a block sits within its *parent's* grid.
// There is exactly one grid in a dashboard: the root's. col_span/col/row are
// only meaningful when the parent IS the root — a 'tabs', 'tab',
// 'collapsible', 'carousel', or 'slide' parent has no grid of its own (its
// children stack and flow, not positioned), so those three are simply
// ignored when adding into one — don't bother setting them in that case.
// col_span defaults to the root's full column count when omitted, so leaving
// it unset always renders something reasonable — set it explicitly only for
// a multi-column layout (e.g. an executive report's side-by-side KPI tiles).
//
// row_span is NOT like the other three: it is never ignored. On the root
// it's a row-track count (defaulting to 1, a single row unit — visually very
// short) — but a flow parent ('tabs'/'tab'/'collapsible'/'carousel'/'slide')
// reads the exact same field as a literal pixel height instead, and when
// it's left unset there, the child flexes to fill whatever room the
// container actually has. Passing a small root-tuned number like 10-14 into
// a flow parent renders a 10-14 *pixel* tall sliver, not a comfortably sized
// block — the single most common way a block placed inside a tab/collapsible/
// carousel ends up looking broken. Leave row_span unset entirely for a block
// whose parent is a 'tabs', 'tab', 'collapsible', 'carousel', or 'slide'.
const placementSchemaProperties = {
  col_span: {
    type: "number" as const,
    description:
      "How many of the root's columns this block spans (the root defaults to 24 " +
      "columns). Defaults to the full column count if omitted, meaning this block " +
      "takes the whole row by itself. To place several blocks side by side in one " +
      "row, give each a col_span that divides the column count between them (e.g. " +
      "three tiles at col_span 8 each fill a 24-column row). Ignored if the parent " +
      "is a 'tabs', 'tab', 'collapsible', 'carousel', or 'slide' block — those have " +
      "no grid to span.",
  },
  row_span: {
    type: "number" as const,
    description:
      "How many row tracks this block spans, but ONLY when the parent is the root " +
      "grid. Defaults to 1 row track if omitted there, which is visually very short " +
      "— set this explicitly for a root-level block that needs real height: roughly " +
      "10-14 for a normal chart, more for a large hero chart or a tall markdown " +
      "block. If the parent is instead a 'tabs', 'tab', 'collapsible', 'carousel', " +
      "or 'slide' block, DO NOT set row_span at all: that parent has no grid, so it " +
      "reads this same field as a literal pixel height rather than a row count, and " +
      "a root-tuned number like 10-14 would render as a 10-14 pixel sliver. Leaving " +
      "row_span unset there makes the block flex to fill the container's own " +
      "available height instead — almost always what you want.",
  },
  col: {
    type: "number" as const,
    description:
      "Explicit 1-based starting column. Omit this (and row) for ordinary " +
      "sequential layout — the grid auto-places the block in the next available " +
      "cell based on col_span. Only set col/row for precise placement (e.g. a " +
      "hero tile spanning multiple rows beside smaller ones). If this collides " +
      "with an existing sibling that also has an explicit col/row, the host " +
      "automatically pushes whichever of the two comes later among the parent's " +
      "children straight down until it no longer overlaps — that's normally " +
      "whichever you added most recently, UNLESS you passed add_dashboard_building_block " +
      "an index placing it earlier than the existing sibling, in which case the " +
      "EXISTING one is what gets pushed. Either way, blocks never end up stuck " +
      "rendering on top of each other. Ignored if the parent is a 'tabs', 'tab', " +
      "'collapsible', 'carousel', or 'slide' block — those have no grid to place " +
      "into.",
  },
  row: {
    type: "number" as const,
    description: "Explicit 1-based starting row. See col.",
  },
};

// The root's own grid config. There is exactly one grid in a dashboard — the
// root's — so these are never passed to add_dashboard_building_block (there
// is nothing left to create one of); they're only ever read/updated on the
// root itself, via update_dashboard_layout with the root's own node id.
const rootGridSchemaProperties = {
  columns: {
    type: "number" as const,
    description:
      "Number of equal columns the root divides itself into for its own " +
      "children. Defaults to 24.",
  },
  gap: {
    type: "number" as const,
    description: "Gap between the root's children, in pixels.",
  },
  row_unit: {
    type: "number" as const,
    description:
      "Pixel height of one row track for the root's own children. Rows are " +
      "created on demand, never predivided from a fixed total, so this only sets " +
      "how tall each one is.",
  },
};

const nodeIdSchema = {
  type: "object" as const,
  properties: {
    node_id: { type: "string" as const, description: "The id of the dashboard node" },
  },
  required: ["node_id"],
};

// Required when block_type is 'echarts'. Deliberately generic (no
// viz_type) — it always hits the same query path Superset falls back to
// when a form_data's viz_type has no registered chart plugin, so it works
// for any chart shape without per-chart-type integration work.
const adhocMetricSchema = {
  type: "object" as const,
  description:
    "An ad hoc aggregate over a column — use this for anything like 'total X' or " +
    "'average Y' rather than guessing at a saved metric name.",
  properties: {
    expressionType: { type: "string" as const, enum: ["SIMPLE"] },
    column: {
      type: "object" as const,
      properties: {
        column_name: { type: "string" as const, description: "The column to aggregate" },
      },
      required: ["column_name"],
    },
    aggregate: {
      type: "string" as const,
      enum: ["SUM", "AVG", "COUNT", "COUNT_DISTINCT", "MIN", "MAX"],
    },
    label: { type: "string" as const, description: "Optional display label, e.g. 'Total Sales'" },
  },
  required: ["expressionType", "column", "aggregate"],
};

const dataBindingSchema = {
  type: "object" as const,
  description:
    "What data to query for an 'echarts', 'vega-lite', 'ag-grid-table', or " +
    "'metric-tile' block.",
  properties: {
    dataset_id: { type: "number" as const, description: "Id of the dataset to query" },
    metrics: {
      type: "array" as const,
      items: { oneOf: [{ type: "string" as const }, adhocMetricSchema] },
      description:
        "Each entry is EITHER a string naming an EXISTING saved metric on the dataset " +
        "(only use this if you already know that exact metric exists — e.g. from a " +
        "prior get_dashboard_node/list-metrics lookup), OR an ad hoc aggregate object " +
        "(see the nested schema). For a request like 'total sales' or 'average price', " +
        "use the ad hoc object form. Do NOT pass a raw SQL-like string such as " +
        "'SUM(sales)' — Superset interprets any plain string here as a saved-metric " +
        "NAME lookup, not an expression to compute, and it will fail with " +
        "\"Metric 'SUM(sales)' does not exist\".",
    },
    dimensions: {
      type: "array" as const,
      items: { type: "string" as const },
      description: "Column names to group by",
    },
    row_limit: { type: "number" as const },
  },
  required: ["dataset_id", "metrics"],
};

// Required when block_type is 'echarts'. A near-raw ECharts `option` — see
// https://echarts.apache.org/en/option.html. Anywhere a literal value would
// normally go, a {"$bind": {...}} marker can be used instead to splice in
// queried data or a theme token:
//   {"$bind": {"source": "metric", "alias": "<metric name>"}}      -> one array of that column's values, one entry per row
//   {"$bind": {"source": "dimension", "alias": "<column name>"}}   -> same, for a groupby column
//   {"$bind": {"source": "metric", "alias": "<metric name>", "single": true}}
//                                                                    -> just that one value, unwrapped — for a single-aggregate
//                                                                       query (no dimensions), use this wherever the field wants a
//                                                                       plain number/string, not a one-element array (e.g. a gauge's
//                                                                       series[].data[].value, or a graphic[].style.text label)
//   {"$bind": {"source": "records", "fields": {"name": "<col>", "value": "<col>"}}}
//                                                                    -> one array of {name, value, ...} objects, one per row —
//                                                                       use this for pie's series[].data, which needs {name,value} pairs,
//                                                                       not two parallel arrays
//   {"$bind": {"source": "theme", "token": "<theme token>"}}       -> a single Superset theme value (e.g. a color)
const echartsOptionsSchema = {
  type: "object" as const,
  description:
    "A near-raw ECharts `option` object " +
    "(https://echarts.apache.org/en/option.html) — author it the same way you would " +
    "for any ECharts chart (series, xAxis, yAxis, tooltip, legend, color, etc.). " +
    'Anywhere a literal value would normally go, use {"$bind": {"source": "metric", ' +
    '"alias": "<metric name>"}} or {"$bind": {"source": "dimension", "alias": ' +
    '"<column name>"}} to splice in the queried data (resolved as one array of that ' +
    "column's values, one per row — even when the query has only one row, e.g. a " +
    'single-aggregate "big number"/gauge query with no dimensions). Add `"single": ' +
    'true` inside the $bind object — e.g. {"$bind": {"source": "metric", "alias": ' +
    '"<metric name>", "single": true}} — to get that one row\'s value unwrapped ' +
    "instead of a one-element array, for any field that wants a plain number/string " +
    "rather than an array: a gauge's series[].data[].value, a graphic[].style.text " +
    "label, a formatter argument, etc. For chart types needing {name, value} pairs " +
    'per data point (e.g. pie\'s series[].data), use {"$bind": {"source": "records", ' +
    '"fields": {"name": "<column>", "value": "<column>"}}} instead — this zips ' +
    'multiple columns into one array of objects, one per row. Use {"$bind": ' +
    '{"source": "theme", "token": "<theme token>"}} for a Superset theme color/token. ' +
    'The "$bind" wrapper is required in every case — {"source": ..., ...} on its own, ' +
    "without the wrapper, is not recognized and silently passes through as a literal " +
    "object instead of the value it names. This option is JSON — it can never contain " +
    "a JavaScript function, so never set a field ECharts documents as accepting " +
    '*only* a function, most commonly tooltip.valueFormatter (use tooltip.formatter ' +
    'instead — a plain string template like "{b}: ${c}" — which does the same job ' +
    "and IS supported as a string) or series[].labelLayout. Fields that accept EITHER " +
    "a function OR a string template — axisLabel.formatter, series[].label.formatter, " +
    "tooltip.formatter itself — are fine to use with a string.",
};

// Required when block_type is 'vega-lite'. A near-raw Vega-Lite spec — see
// https://vega.github.io/vega-lite/docs/spec.html. Unlike echarts_options,
// this needs no $bind markers: Vega-Lite's own `encoding` channels already
// reference column names against a single flat data table, and the queried
// rows are spliced in as `data.values` automatically before rendering — just
// reference the same column names used in data_binding's metrics/dimensions.
const vegaLiteSpecSchema = {
  type: "object" as const,
  description:
    "A near-raw Vega-Lite spec (https://vega.github.io/vega-lite/docs/spec.html) — " +
    "author `mark` and `encoding` the same way you would for any Vega-Lite chart, " +
    "referencing column names directly (e.g. " +
    '{"encoding": {"x": {"field": "order_date", "type": "temporal"}, "y": {"field": ' +
    '"revenue", "type": "quantitative"}}}). Do NOT set `data` — the queried rows are ' +
    "spliced in automatically as `data.values` right before rendering, so this spec " +
    "should only describe `mark`/`encoding`/`transform`/etc. Column names in `encoding` " +
    "must match data_binding's own metrics/dimensions (or their aliases).",
};

// Optional when block_type is 'ag-grid-table'. Omit entirely for the common
// case — columns are derived automatically, one per query result column, in
// the same order, using the column name as both field and header. Only pass
// this to customize headers, widths, or per-column sorting/filtering.
const columnDefsSchema = {
  type: "array" as const,
  description:
    "AG Grid column definitions. Omit this entirely to auto-derive one column per " +
    "query result column (field and header both set to the column name). Only pass " +
    "this to customize headers, widths, or per-column sort/filter behavior — each " +
    "entry's \"field\" must match a metric's label or a dimension's column name from " +
    "data_binding, exactly as it appears in the query result.",
  items: {
    type: "object" as const,
    properties: {
      field: {
        type: "string" as const,
        description: "Must match a metric label or dimension column name from data_binding",
      },
      headerName: {
        type: "string" as const,
        description: "Display header text. Defaults to field if omitted.",
      },
      width: { type: "number" as const, description: "Column width in pixels" },
      sortable: { type: "boolean" as const },
      filter: { type: "boolean" as const },
    },
    required: ["field"],
  },
};

// Only meaningful when block_type is 'metric-tile' ("big number"). Unlike
// echarts/vega-lite/ag-grid-table, there's no single "spec" object here —
// just a handful of flat display fields alongside data_binding, which
// should resolve to exactly one metric with no dimensions (a tile shows
// one number; the *first* result row is used regardless).
const metricTileSchemaProperties = {
  label: {
    type: "string" as const,
    description:
      "For block_type 'metric-tile': text shown below the number, e.g. 'Revenue'. " +
      "Defaults to the metric's own label/name from data_binding if omitted. " +
      "For block_type 'tab' or 'slide': the pane's own title, e.g. 'Overview' — " +
      "REQUIRED in both cases, since neither has data to name itself from. For " +
      "'slide', this is used for the outline/properties panel only — the carousel's " +
      "own on-canvas navigation is a plain row of dots with no visible labels. For " +
      "'collapsible', an optional title shown in its header; leave unset for no title " +
      "there at all.",
  },
  prefix: {
    type: "string" as const,
    description:
      "Text shown immediately before the number, e.g. '$'. Only used when block_type " +
      "is 'metric-tile'.",
  },
  suffix: {
    type: "string" as const,
    description:
      "Text shown immediately after the number, e.g. '%' or ' users'. Only used when " +
      "block_type is 'metric-tile'.",
  },
  decimals: {
    type: "number" as const,
    description: "Number of decimal places to show. Defaults to 0. Only used when block_type is 'metric-tile'.",
  },
  delta: {
    type: "object" as const,
    description:
      "Optional comparison/trend indicator shown below the number and label — e.g. " +
      '"+12%" in green with an up arrow. Only used when block_type is \'metric-tile\'. ' +
      "This is NOT computed automatically — there's no built-in period-over-period " +
      "comparison. If you want a real comparison, run a second query yourself (e.g. " +
      "another data_binding/execute_sql lookup for the prior period) and compute the " +
      "delta value before passing it here. Omit this entirely if you don't have a " +
      "real comparison value — do not invent one.",
    properties: {
      value: {
        type: "number" as const,
        description:
          "The delta amount, e.g. 12 for \"+12%\". Its sign determines the up/down " +
          "arrow and color unless direction is set explicitly.",
      },
      direction: {
        type: "string" as const,
        enum: ["up", "down", "flat"],
        description: "Controls the arrow/color shown. Defaults to inferring from value's sign.",
      },
      suffix: {
        type: "string" as const,
        description: "Text shown after the delta value, e.g. '%'.",
      },
    },
    required: ["value"],
  },
};

const addBuildingBlockSchema = {
  type: "object" as const,
  properties: {
    parent_id: {
      type: "string" as const,
      description:
        "Id of an existing container node to add this block into — the dashboard root " +
        "(always a grid), a 'tabs' block (to add another tab), a 'tab' pane (to add " +
        "content inside that tab), a 'collapsible' block (to add its one child — meant " +
        "to hold exactly one; nothing stops you from adding a second, but the UI's own " +
        "drag-and-drop only allows one, so don't), a 'carousel' block (to add another " +
        "slide), or a 'slide' pane (to add content inside that slide). There is no way " +
        "to create a second grid — the root is the only one a dashboard ever has.",
    },
    index: {
      type: "number" as const,
      description: "Position among the parent's existing children",
    },
    block_type: {
      type: "string" as const,
      description:
        "'markdown' for a text block, 'echarts' for a chart using an ECharts spec " +
        "(requires data_binding and echarts_options), 'vega-lite' for a chart using a " +
        "Vega-Lite spec (requires data_binding and vega_lite_spec), 'ag-grid-table' for " +
        "a data table (requires data_binding; column_defs is optional — omit it to " +
        "auto-derive one column per query result column), 'metric-tile' for a single " +
        "live \"big number\" (requires data_binding resolving to one metric with no " +
        "dimensions; label/prefix/suffix/decimals/delta are all optional), 'tabs' for a " +
        "block that groups other blocks into switchable tabs (holds no content directly " +
        "— add 'tab' children into it, see below). IMPORTANT: creating a 'tabs' block " +
        "immediately auto-creates one starting tab pane of its own, labeled 'Tab 1', " +
        "with no content — call get_dashboard_node on the new tabs id to find it before " +
        "adding any tabs of your own, then either (a) add your first tab's own content " +
        "directly into that existing pane (its id as parent_id) if a plain first tab " +
        "named 'Tab 1' is acceptable, and only create new 'tab' children for the second " +
        "tab onward, or (b) remove that pane with remove_dashboard_building_block first " +
        "if you need a different label or ordering, then add all of your own tabs fresh. " +
        "Do NOT simply add N new 'tab' children on top of the auto-created one — that " +
        "leaves N+1 tabs total, with an empty extra one duplicating the label 'Tab 1'. " +
        "'tab' for one tab inside a 'tabs' " +
        "block (parent_id must be a 'tabs' node; requires a label; add the tab's actual " +
        "content — a chart, text, etc. — as a separate call with this tab's id as " +
        "parent_id, since a tab is itself a container, not content), 'collapsible' for a " +
        "block that shows or hides a single child behind one show/hide toggle in its own " +
        "header (holds no content directly — add exactly one child into it as a " +
        "separate call with this block's id as parent_id; label is optional and, if " +
        "set, is this block's own title), 'carousel' for a block that groups other " +
        "blocks into slides navigated one at a time through a vertical strip of dots " +
        "(holds no content directly and has no title of its own — add 'slide' children " +
        "into it, see below), or 'slide' for one slide inside a 'carousel' block " +
        "(parent_id must be a 'carousel' node; requires a label, used only for the " +
        "outline/properties panel since the carousel's own dots carry no text; add the " +
        "slide's actual content as a separate call with this slide's id as parent_id, " +
        "since a slide is itself a container, not content). There is no " +
        "'canvas'/grid block_type — the root is the only grid a dashboard has, it " +
        "already exists, and nothing creates another one; to place a few blocks side by " +
        "side in one row, give each a col_span that divides the root's own column count " +
        "between them (see col_span's own description) and add them directly to the " +
        "root. Prefer 'metric-tile' over an echarts gauge or graphic-text hack for a " +
        "single KPI number — it needs no $bind marker and always renders a real number, " +
        "not a one-element array. Other installed extensions may contribute additional " +
        "block types — call list_dashboard_building_block_types first if you need " +
        "something other than these eight, or aren't sure what's available (note that " +
        "'tab' and 'slide' are themselves intentionally not listed there — they are " +
        "private to 'tabs' and 'carousel' respectively, and only ever valid with that " +
        "parent, unlike every other type in this list). Do NOT use 'tabs' or 'carousel' " +
        "just to show one thing at a time by itself — reach for either when the user " +
        "actually wants several alternative views switchable in the same spot (e.g. " +
        "'Overview' vs. 'Detail'); reach for 'collapsible' instead when the user wants " +
        "one thing hidden by default and revealed on demand, not switched between " +
        "several.",
    },
    ...placementSchemaProperties,
    content: {
      type: "string" as const,
      description: "Markdown content — only used when block_type is 'markdown'",
    },
    data_binding: dataBindingSchema,
    echarts_options: {
      ...echartsOptionsSchema,
      description: `Required when block_type is 'echarts'. ${echartsOptionsSchema.description}`,
    },
    vega_lite_spec: {
      ...vegaLiteSpecSchema,
      description: `Required when block_type is 'vega-lite'. ${vegaLiteSpecSchema.description}`,
    },
    column_defs: {
      ...columnDefsSchema,
      description: `Only used when block_type is 'ag-grid-table'. ${columnDefsSchema.description}`,
    },
    ...metricTileSchemaProperties,
  },
  required: ["parent_id", "index", "block_type"],
};

const updateBuildingBlockContentSchema = {
  type: "object" as const,
  properties: {
    node_id: { type: "string" as const },
    content: {
      type: "string" as const,
      description: "New markdown content — only used when the node is a 'markdown' block",
    },
    data_binding: dataBindingSchema,
    echarts_options: echartsOptionsSchema,
    vega_lite_spec: vegaLiteSpecSchema,
    column_defs: columnDefsSchema,
    ...metricTileSchemaProperties,
  },
  required: ["node_id"],
};

const moveBuildingBlockSchema = {
  type: "object" as const,
  properties: {
    node_id: { type: "string" as const },
    new_parent_id: { type: "string" as const, description: "Id of the destination container node" },
    new_index: { type: "number" as const },
  },
  required: ["node_id", "new_parent_id", "new_index"],
};

const updateLayoutSchema = {
  type: "object" as const,
  properties: {
    node_id: { type: "string" as const },
    ...placementSchemaProperties,
    ...rootGridSchemaProperties,
  },
  required: ["node_id"],
};

function errorResult(e: unknown): { success: false; message: string } {
  return { success: false, message: e instanceof Error ? e.message : String(e) };
}

// Catches the model serializing the whole spec as a JSON string (or handing
// back an array/null) instead of a real nested object. Left unchecked, that
// string reaches ECharts' setOption()/vega-embed's render call as-is, which
// throws trying to mutate a property onto a string primitive — a
// render-time crash instead of a correctable tool error here. Shared by
// echarts_options and vega_lite_spec, and by both add/update, since all four
// combinations need the identical check.
function chartSpecError(
  spec: unknown,
  fieldName: string,
): { success: false; message: string } | undefined {
  if (spec !== undefined && (typeof spec !== "object" || spec === null || Array.isArray(spec))) {
    return {
      success: false,
      message:
        `${fieldName} must be a JSON object, not a string, array, or null. Pass it as ` +
        "a real nested object in the tool call, not a JSON-encoded string.",
    };
  }
  return undefined;
}

type DataBindingInput = {
  dataset_id: number;
  metrics: (
    | string
    | {
        expressionType: "SIMPLE";
        column: { column_name: string };
        aggregate: string;
        label?: string;
      }
  )[];
  dimensions?: string[];
  row_limit?: number;
};

function toDataBinding(input: DataBindingInput) {
  return {
    datasetId: input.dataset_id,
    metrics: input.metrics,
    dimensions: input.dimensions,
    rowLimit: input.row_limit,
  };
}

/**
 * Client-side tools that let the chat agent manipulate the Dashboard v2
 * prototype canvas — mirrors the SQL Lab client-tool pattern (name,
 * description, JSON-schema input, a handler calling straight into the
 * relevant `@apache-superset/core` namespace), applied to `dashboard`
 * instead of `sqlLab`. Unlike SQL Lab's tools, these aren't routed through
 * a persistent agent-SDK connection — the chat extension's own send/resume
 * loop (see ChatPanel.tsx) dispatches to them directly, since `dashboard`
 * state lives only in this browser tab.
 */
export default function useDashboardTools(): ClientTool[] {
  return useMemo(
    () => [
      {
        name: "list_dashboard_building_block_types",
        description:
          "Lists every dashboard building block type available as `block_type` for " +
          "add_dashboard_building_block — both the built-in ones (markdown, echarts, " +
          "ag-grid-table, metric-tile, tabs, collapsible, carousel) and any installed " +
          "extension's (e.g. vega-lite). The root grid itself is not in this list — it " +
          "already exists on every dashboard and is not something you add. Call this " +
          "whenever the user asks for something that doesn't obviously map to one of " +
          "the built-in types (e.g. a named component, widget, or feature) before " +
          "assuming it doesn't exist.",
        inputSchema: emptyInputSchema,
        handler: () => ({
          success: true,
          block_types: views.getViews(BUILDING_BLOCKS_LOCATION) ?? [],
        }),
      },
      {
        name: "get_dashboard_root",
        description:
          "Returns the dashboard's root grid node, including its child node ids. " +
          "Use this to see the top-level layout before adding blocks.",
        inputSchema: emptyInputSchema,
        handler: () => ({ success: true, node: dashboard.getRoot() }),
      },
      {
        name: "get_dashboard_node",
        description:
          "Returns a specific dashboard node by id, including its type, layout, " +
          "props, and children (for the root, or a 'tabs'/'tab'/'collapsible'/" +
          "'carousel'/'slide' node).",
        inputSchema: nodeIdSchema,
        handler: (x: unknown) => {
          const input = x as { node_id: string };
          const node = dashboard.getNode(input.node_id);
          if (!node) return { success: false, message: `Node "${input.node_id}" not found` };
          return { success: true, node };
        },
      },
      {
        name: "add_dashboard_building_block",
        description:
          "Adds a new node to the dashboard as a child of an existing container node " +
          "(the root, or a 'tabs'/'tab'/'collapsible'/'carousel'/'slide' node — see " +
          "parent_id). Returns the new node's id. The root is always a grid (24 " +
          "columns by default) — use col_span/row_span to size this block within it; " +
          "leaving them unset makes the block take the whole row at a minimal height, " +
          "so for anything other than a simple top-to-bottom stack (e.g. an executive " +
          "report with multiple tiles per row, or charts with real height), set them " +
          "explicitly. A 'tabs', 'tab', 'collapsible', 'carousel', or 'slide' parent " +
          "has no grid, so col_span/col/row are ignored for a block added into one — " +
          "but row_span is NOT ignored there: leave it unset so the block fills the " +
          "container's available height (see row_span's own description for why " +
          "setting it there is almost always a mistake). For block_type " +
          "'echarts', 'vega-lite', 'ag-grid-table', or 'metric-tile', the data_binding is " +
          "validated by actually running the query before the block is created — if it " +
          "fails (e.g. an unknown column/metric name), no node is created and the error " +
          "is returned so you can correct it and retry.",
        inputSchema: addBuildingBlockSchema,
        handler: async (x: unknown) => {
          const input = x as {
            parent_id: string;
            index: number;
            block_type: string;
            col_span?: number;
            row_span?: number;
            col?: number;
            row?: number;
            columns?: number;
            gap?: number;
            row_unit?: number;
            content?: string;
            data_binding?: DataBindingInput;
            echarts_options?: Record<string, unknown>;
            vega_lite_spec?: Record<string, unknown>;
            column_defs?: Record<string, unknown>[];
            label?: string;
            prefix?: string;
            suffix?: string;
            decimals?: number;
            delta?: { value: number; direction?: string; suffix?: string };
          };

          let props: Record<string, unknown> | undefined;
          if (input.block_type === "markdown") {
            props = { content: input.content ?? "" };
          } else if (input.block_type === "tab" || input.block_type === "slide") {
            if (!input.label) {
              return {
                success: false,
                message: `block_type '${input.block_type}' requires a label`,
              };
            }
            props = { label: input.label };
          } else if (
            input.block_type === "echarts" ||
            input.block_type === "vega-lite" ||
            input.block_type === "ag-grid-table" ||
            input.block_type === "metric-tile"
          ) {
            if (!input.data_binding) {
              return { success: false, message: `block_type '${input.block_type}' requires data_binding` };
            }

            if (input.block_type === "ag-grid-table") {
              if (input.column_defs !== undefined && !Array.isArray(input.column_defs)) {
                return { success: false, message: "column_defs must be an array of column definition objects" };
              }
            } else if (input.block_type === "echarts" || input.block_type === "vega-lite") {
              const specField = input.block_type === "echarts" ? "echarts_options" : "vega_lite_spec";
              const spec = input.block_type === "echarts" ? input.echarts_options : input.vega_lite_spec;
              const optionsError = chartSpecError(spec, specField);
              if (optionsError) return optionsError;
            }
            // metric-tile: label/prefix/suffix/decimals/delta are plain scalar
            // fields with no "spec" object to validate here — inputSchema
            // already constrains their shape.

            const dataBinding = toDataBinding(input.data_binding);
            // Validate by actually running the query — a bad column/metric name
            // otherwise wouldn't surface until the node renders, well after this
            // tool call has already reported success and the model has moved on.
            try {
              await dashboard.fetchQueryData(dataBinding);
            } catch (e) {
              return errorResult(e);
            }

            if (input.block_type === "echarts") {
              props = { dataBinding, echartsOptions: input.echarts_options };
            } else if (input.block_type === "vega-lite") {
              props = { dataBinding, vegaLiteSpec: input.vega_lite_spec };
            } else if (input.block_type === "ag-grid-table") {
              props = {
                dataBinding,
                ...(input.column_defs ? { columnDefs: input.column_defs } : {}),
              };
            } else {
              props = {
                dataBinding,
                ...(input.label !== undefined ? { label: input.label } : {}),
                ...(input.prefix !== undefined ? { prefix: input.prefix } : {}),
                ...(input.suffix !== undefined ? { suffix: input.suffix } : {}),
                ...(input.decimals !== undefined ? { decimals: input.decimals } : {}),
                ...(input.delta !== undefined ? { delta: input.delta } : {}),
              };
            }
          }

          try {
            const nodeId = dashboard.addBuildingBlock(input.parent_id, input.index, {
              type: input.block_type,
              layout: {
                colSpan: input.col_span,
                rowSpan: input.row_span,
                col: input.col,
                row: input.row,
                columns: input.columns,
                gap: input.gap,
                rowUnit: input.row_unit,
              },
              props,
            });
            return { success: true, message: `Added "${input.block_type}" block`, node_id: nodeId };
          } catch (e) {
            return errorResult(e);
          }
        },
      },
      {
        name: "remove_dashboard_building_block",
        description:
          "Removes a node (and, if it holds children — a 'tabs', 'tab', 'collapsible', " +
          "'carousel', or 'slide' node — its entire subtree) from the dashboard.",
        inputSchema: nodeIdSchema,
        handler: (x: unknown) => {
          const input = x as { node_id: string };
          // dashboard.removeBuildingBlock() silently no-ops for an id that
          // doesn't exist (rather than throwing) — check first so a stale
          // or mistaken node_id is reported as a failure instead of a false
          // "Removed" success.
          if (!dashboard.getNode(input.node_id)) {
            return { success: false, message: `Node "${input.node_id}" not found` };
          }
          try {
            dashboard.removeBuildingBlock(input.node_id);
            return { success: true, message: `Removed node "${input.node_id}"` };
          } catch (e) {
            return errorResult(e);
          }
        },
      },
      {
        name: "move_dashboard_building_block",
        description: "Moves an existing node to a new container parent at a given index.",
        inputSchema: moveBuildingBlockSchema,
        handler: (x: unknown) => {
          const input = x as { node_id: string; new_parent_id: string; new_index: number };
          try {
            dashboard.moveBuildingBlock(input.node_id, input.new_parent_id, input.new_index);
            return { success: true, message: `Moved node "${input.node_id}"` };
          } catch (e) {
            return errorResult(e);
          }
        },
      },
      {
        name: "update_dashboard_layout",
        description:
          "Updates layout properties of an existing node — either how it's placed " +
          "within the root's grid (col_span/row_span/col/row) or, if node_id is the " +
          "root itself, the root's own grid config for its children " +
          "(columns/gap/row_unit). Omit fields you don't want to change.",
        inputSchema: updateLayoutSchema,
        handler: (x: unknown) => {
          const input = x as {
            node_id: string;
            col_span?: number;
            row_span?: number;
            col?: number;
            row?: number;
            columns?: number;
            gap?: number;
            row_unit?: number;
          };
          try {
            dashboard.updateLayout(input.node_id, {
              colSpan: input.col_span,
              rowSpan: input.row_span,
              col: input.col,
              row: input.row,
              columns: input.columns,
              gap: input.gap,
              rowUnit: input.row_unit,
            });
            return { success: true, message: `Updated layout for "${input.node_id}"` };
          } catch (e) {
            return errorResult(e);
          }
        },
      },
      {
        name: "update_dashboard_building_block",
        description:
          "Updates an existing block's CONTENT in place — the markdown text for a " +
          "'markdown' node, the data_binding/echarts_options for an 'echarts' node, the " +
          "data_binding/vega_lite_spec for a 'vega-lite' node, the data_binding/column_defs " +
          "for an 'ag-grid-table' node, or the data_binding/label/prefix/suffix/decimals/" +
          "delta for a 'metric-tile' node. Use this instead of " +
          "remove_dashboard_building_block + add_dashboard_building_block whenever you're " +
          "editing something that already exists (e.g. changing a chart's colors, axis " +
          "labels, or series config, or rewording a text block) rather than adding " +
          "something new — updating in place keeps the node's position, layout, and " +
          "identity intact instead of losing them to a delete-and-recreate. Omit " +
          "data_binding to keep the block's existing query and only change how it's " +
          "rendered (e.g. colors/labels/columns) — passing echarts_options/vega_lite_spec/" +
          "column_defs/label/prefix/suffix/decimals/delta alone does not re-run the query. " +
          "When data_binding IS provided, it's validated by actually running the query " +
          "before anything is changed, same as add_dashboard_building_block.",
        inputSchema: updateBuildingBlockContentSchema,
        handler: async (x: unknown) => {
          const input = x as {
            node_id: string;
            content?: string;
            data_binding?: DataBindingInput;
            echarts_options?: Record<string, unknown>;
            vega_lite_spec?: Record<string, unknown>;
            column_defs?: Record<string, unknown>[];
            label?: string;
            prefix?: string;
            suffix?: string;
            decimals?: number;
            delta?: { value: number; direction?: string; suffix?: string };
          };

          const node = dashboard.getNode(input.node_id);
          if (!node) return { success: false, message: `Node "${input.node_id}" not found` };

          if (node.type === "markdown") {
            if (input.content === undefined) {
              return { success: false, message: "content is required to update a markdown block" };
            }
            try {
              dashboard.updateProps(input.node_id, { content: input.content });
              return { success: true, message: `Updated content for "${input.node_id}"` };
            } catch (e) {
              return errorResult(e);
            }
          }

          if (node.type === "metric-tile") {
            const hasDisplayFields =
              input.label !== undefined ||
              input.prefix !== undefined ||
              input.suffix !== undefined ||
              input.decimals !== undefined ||
              input.delta !== undefined;
            if (!input.data_binding && !hasDisplayFields) {
              return {
                success: false,
                message:
                  "Provide data_binding and/or label/prefix/suffix/decimals/delta to update a metric-tile block",
              };
            }

            const props: Record<string, unknown> = {};
            if (input.data_binding) {
              const dataBinding = toDataBinding(input.data_binding);
              try {
                await dashboard.fetchQueryData(dataBinding);
              } catch (e) {
                return errorResult(e);
              }
              props.dataBinding = dataBinding;
            }
            if (input.label !== undefined) props.label = input.label;
            if (input.prefix !== undefined) props.prefix = input.prefix;
            if (input.suffix !== undefined) props.suffix = input.suffix;
            if (input.decimals !== undefined) props.decimals = input.decimals;
            if (input.delta !== undefined) props.delta = input.delta;

            try {
              dashboard.updateProps(input.node_id, props);
              return { success: true, message: `Updated content for "${input.node_id}"` };
            } catch (e) {
              return errorResult(e);
            }
          }

          if (node.type === "echarts" || node.type === "vega-lite" || node.type === "ag-grid-table") {
            const isTable = node.type === "ag-grid-table";
            const specField = isTable
              ? "column_defs"
              : node.type === "echarts"
                ? "echarts_options"
                : "vega_lite_spec";
            const spec = isTable
              ? input.column_defs
              : node.type === "echarts"
                ? input.echarts_options
                : input.vega_lite_spec;

            if (!input.data_binding && spec === undefined) {
              return {
                success: false,
                message: `Provide data_binding and/or ${specField} to update a ${node.type} block`,
              };
            }
            if (isTable) {
              if (spec !== undefined && !Array.isArray(spec)) {
                return { success: false, message: "column_defs must be an array of column definition objects" };
              }
            } else {
              const optionsError = chartSpecError(spec, specField);
              if (optionsError) return optionsError;
            }

            const props: Record<string, unknown> = {};
            if (input.data_binding) {
              const dataBinding = toDataBinding(input.data_binding);
              try {
                await dashboard.fetchQueryData(dataBinding);
              } catch (e) {
                return errorResult(e);
              }
              props.dataBinding = dataBinding;
            }
            if (spec !== undefined) {
              props[isTable ? "columnDefs" : node.type === "echarts" ? "echartsOptions" : "vegaLiteSpec"] = spec;
            }

            try {
              dashboard.updateProps(input.node_id, props);
              return { success: true, message: `Updated content for "${input.node_id}"` };
            } catch (e) {
              return errorResult(e);
            }
          }

          return {
            success: false,
            message: `Node "${input.node_id}" is a "${node.type}" block, which has no content ` +
              "to update this way — use update_dashboard_layout for its col_span/row_span/etc.",
          };
        },
      },
    ],
    [],
  );
}
