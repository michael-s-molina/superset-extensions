import { useMemo } from "react";
import { dashboard } from "@apache-superset/core";
import type { dashboard as dashboardApi } from "@apache-superset/core";

type DataBindingSpec = dashboardApi.DataBindingSpec;

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

// Shared placement fields — how a widget sits within its *parent's* grid.
// This is the dashboard tree's fixed grammar (not per-widget-type content),
// so it stays inline here rather than coming from a widget's own schema.
// col_span/row_span default to the parent's full column count / 1 row when
// omitted, so leaving them unset always renders something, but that default is
// a full-width, single-row-tall widget — set them explicitly for anything that
// needs real height or a multi-column layout (e.g. side-by-side KPI tiles).
//
// A 'tabs', 'tab', 'collapsible', 'carousel', or 'slide' parent has no grid of
// its own (its children stack and flow, not positioned) — col_span/col/row are
// simply ignored when adding into one. row_span is the exception: it's never
// ignored — that same parent reads it as a literal pixel height instead of a
// row-track count, and when left unset there, the child flexes to fill
// whatever room the container has. Leave row_span unset entirely for a widget
// whose parent is one of those five.
const placementSchemaProperties = {
  col_span: {
    type: "number" as const,
    description:
      "How many of the parent canvas's columns this widget spans (parent canvases " +
      "default to 24 columns). Defaults to the parent's full column count if " +
      "omitted, meaning this widget takes the whole row by itself. To place several " +
      "widgets side by side in one row, give each a col_span that divides the " +
      "parent's column count between them (e.g. three tiles at col_span 8 each " +
      "fill a 24-column row). Ignored if the parent is a 'tabs', 'tab', " +
      "'collapsible', 'carousel', 'slide', or 'filter.bar' widget — none of those " +
      "have a grid to span.",
  },
  row_span: {
    type: "number" as const,
    description:
      "How many row tracks this widget spans. Defaults to 1 if omitted (3 for " +
      "widget_type 'filter.select'/'filter.bar' — still compact, but the least " +
      "that clears the ~130px a filter's own control needs to avoid clipping), " +
      "which is visually very short for anything else — set this explicitly for " +
      "any widget that needs real height: roughly 10-14 for a normal chart, more " +
      "for a large hero chart or a tall text/content widget. EXCEPTION: if the " +
      "parent is a 'tabs', 'tab', 'collapsible', 'carousel', or 'slide' widget, DO " +
      "NOT set row_span at all — that parent has no grid, so it reads this same " +
      "field as a literal pixel height rather than a row count, and a grid-tuned " +
      "number like 10-14 would render as a 10-14 pixel sliver. Leaving row_span " +
      "unset there makes the widget flex to fill the container's own available " +
      "height instead — almost always what you want. A 'filter.bar' parent is " +
      "different again: it fixes every filter's size itself, so row_span (like " +
      "col_span) is simply ignored for a 'filter.select' child of one — there's " +
      "nothing useful to set either way.",
  },
  col: {
    type: "number" as const,
    description:
      "Explicit 1-based starting column. Omit this (and row) for ordinary " +
      "sequential layout — the grid auto-places the widget in the next available " +
      "cell based on col_span. Only set col/row for precise placement. Ignored if " +
      "the parent is a 'tabs', 'tab', 'collapsible', 'carousel', 'slide', or " +
      "'filter.bar' widget — none of those have a grid to place into.",
  },
  row: {
    type: "number" as const,
    description: "Explicit 1-based starting row. See col.",
  },
};

// Container grid config — only meaningful when widget_type is 'canvas', since
// only a canvas holds children of its own to lay out. 'tabs', 'tab',
// 'collapsible', 'carousel', and 'slide' are flow containers with no grid of
// their own, so none of these apply to them either.
const containerSchemaProperties = {
  columns: {
    type: "number" as const,
    description:
      "Number of equal columns this canvas divides itself into for its own " +
      "children. Only used when widget_type is 'canvas'. Defaults to 24.",
  },
  gap: {
    type: "number" as const,
    description: "Gap between this canvas's children, in pixels. Only used when widget_type is 'canvas'.",
  },
  row_unit: {
    type: "number" as const,
    description:
      "Pixel height of one row track for this canvas's own children. Only used " +
      "when widget_type is 'canvas'. Leave unset unless you need a different row " +
      "height than the parent's.",
  },
};

const nodeIdSchema = {
  type: "object" as const,
  properties: {
    node_id: { type: "string" as const, description: "The id of the widget (dashboard node)" },
  },
  required: ["node_id"],
};

// Generic content payload. A widget's content is an instance of that widget
// type's OWN published JSON Schema — discovered from the backend, not
// hard-coded here (that schema is the single source of truth, per the Widget
// Framework). The model is told to fetch it before filling this in; we
// deliberately do NOT enumerate per-widget-type shapes here, so the model has
// to use progressive disclosure rather than guessing from a crib sheet.
const propsSchema = {
  type: "object" as const,
  additionalProperties: true,
  description:
    "The widget's content: an object matching the widget type's published control " +
    "schema. Discover the fields before filling this in — call " +
    "get_widget_control_schema(widget_type) for the required (minimum-viable) shape, " +
    "then call it again with `paths` (each an x-path from an x-collapsed marker) to " +
    "expand branches you need; you can expand several at once. Only expand/set the " +
    "branches the user's request actually needs — the required shape alone is enough " +
    "to create a valid widget, so leave optional branches collapsed and unset unless " +
    "the request calls for them. A marker flagged x-dynamic changes with the query " +
    "(re-fetch it after changing the query); one without is static. Read field names " +
    "and nesting from the schema rather than assuming them. If props includes a " +
    "`dataBinding`, it is validated by running the query before the widget is " +
    "created/updated. Do NOT put layout/placement here — col_span/row_span/col/row " +
    "(and columns/gap/row_unit for a canvas) are separate parameters.",
};

const addWidgetSchema = {
  type: "object" as const,
  properties: {
    parent_id: {
      type: "string" as const,
      description:
        "Id of an existing container widget to add this one into — the dashboard " +
        "root or a 'canvas' widget (both grids), a 'tabs' widget (to add another " +
        "'tab' child), a 'tab' pane (to add content inside that tab), a " +
        "'collapsible' widget (to add its one child — meant to hold exactly one; " +
        "nothing stops you from adding a second, but the UI's own drag-and-drop " +
        "only allows one, so don't), a 'carousel' widget (to add another 'slide' " +
        "child), a 'slide' pane (to add content inside that slide), or a " +
        "'filter.bar' widget (to add another filter into it — a 'filter.select' " +
        "child, same as any other widget_type).",
    },
    index: {
      type: "number" as const,
      description: "Position among the parent's existing children",
    },
    widget_type: {
      type: "string" as const,
      description:
        "The kind of widget to add. Call the server tool list_widget_types to see the " +
        "available types (built-ins plus any contributed by installed extensions), and " +
        "get_widget_control_schema(widget_type) to learn what `props` that type takes. " +
        "A 'canvas' is a layout container that holds other widgets in its own nested " +
        "grid — but do NOT use one just to place widgets side by side (that's what " +
        "col_span is for); only nest a 'canvas' when you need an independent sub-grid. " +
        "'tabs' groups widgets into switchable tabs and holds no content directly — add " +
        "'tab' children into it. IMPORTANT: creating a 'tabs' widget immediately " +
        "auto-creates one starting tab pane of its own, labeled 'Tab 1', with no " +
        "content — call get_widget on the new tabs id to find it before adding any tabs " +
        "of your own, then either (a) add your first tab's own content directly into " +
        "that existing pane (its id as parent_id) if a plain first tab named 'Tab 1' is " +
        "acceptable, and only create new 'tab' children for the second tab onward, or " +
        "(b) remove that pane with remove_widget first if you need a different label or " +
        "ordering, then add all of your own tabs fresh. Do NOT simply add N new 'tab' " +
        "children on top of the auto-created one — that leaves N+1 tabs total, with an " +
        "empty extra one duplicating the label 'Tab 1'. 'collapsible' shows or hides a " +
        "single child behind one show/hide toggle in its own header — holds no content " +
        "directly; add exactly one child into it as a separate call. 'carousel' groups " +
        "widgets into slides navigated one at a time through a vertical strip of dots — " +
        "holds no content directly and has no title of its own; add 'slide' children " +
        "into it. 'tab' and 'slide' are private to 'tabs' and 'carousel' respectively " +
        "(parent_id must be that container, not any other node) and both require a " +
        "`label` prop — for 'tab' this is the pane's own title (e.g. 'Overview'); for " +
        "'slide' it's used only in the outline/properties panel, since the carousel's " +
        "own on-canvas dots carry no visible text. Add the tab's/slide's actual content " +
        "— a chart, text, etc. — as a separate call with that pane's id as parent_id, " +
        "since a tab/slide is itself a container, not content. Do NOT use 'tabs' or " +
        "'carousel' just to show one thing at a time by itself — reach for either when " +
        "the user actually wants several alternative views switchable in the same spot " +
        "(e.g. 'Overview' vs. 'Detail'); reach for 'collapsible' instead when the user " +
        "wants one thing hidden by default and revealed on demand, not switched between " +
        "several. 'filter.bar' groups one or more dashboard filters into a single " +
        "control strip — it holds no content of its own; add 'filter.select' children " +
        "into it (parent_id = the filter.bar's id), one add_widget call per filter. Call " +
        "get_widget_control_schema('filter.bar') for its own props (e.g. whether its " +
        "filters lay out side by side or stacked) rather than assuming a field name or " +
        "values. IMPORTANT: adding a filter bar is an ordinary add_widget call like any " +
        "other widget — do NOT wrap it (or anything else) in a new 'canvas', and do NOT " +
        "move or resize any existing widget to 'make room' for it. Add it as a normal " +
        "child of the same parent the user is already looking at (e.g. index 0 of the " +
        "root, so it appears first) with its own col_span/row_span (a bar meant to look " +
        "like a stacked left/right rail still just needs its OWN row_span/col_span set " +
        "large enough — e.g. a tall row_span and a small col_span — not a change to any " +
        "other widget); every other existing widget keeps its current placement " +
        "untouched. A user asking for a filter bar 'on the left' or 'on top' is " +
        "describing this one widget's own position among its siblings, not " +
        "asking for the rest of the dashboard to be restructured around it.",
    },
    ...placementSchemaProperties,
    ...containerSchemaProperties,
    props: propsSchema,
  },
  required: ["parent_id", "index", "widget_type"],
};

const updateWidgetSchema = {
  type: "object" as const,
  properties: {
    node_id: { type: "string" as const },
    props: {
      ...propsSchema,
      description:
        "The content fields to change, matching the widget type's published schema. " +
        "If you're setting a field that isn't already present in the widget's current " +
        "props (from get_widget), discover its shape first with " +
        "get_widget_control_schema (call it with `paths` to expand collapsed branches) " +
        "— don't assume field names. Only the keys you pass are changed; nested objects " +
        "are deep-merged, so you can change a single nested value without resending its " +
        "siblings. Omit `dataBinding` to keep the existing query. To change " +
        "placement/layout use update_widget_layout instead.",
    },
  },
  required: ["node_id", "props"],
};

const moveWidgetSchema = {
  type: "object" as const,
  properties: {
    node_id: { type: "string" as const },
    new_parent_id: { type: "string" as const, description: "Id of the destination container widget" },
    new_index: { type: "number" as const },
  },
  required: ["node_id", "new_parent_id", "new_index"],
};

const updateWidgetLayoutSchema = {
  type: "object" as const,
  properties: {
    node_id: { type: "string" as const },
    ...placementSchemaProperties,
    ...containerSchemaProperties,
  },
  required: ["node_id"],
};

function errorResult(e: unknown): { success: false; message: string } {
  return { success: false, message: e instanceof Error ? e.message : String(e) };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// Recursively merge a partial patch into a base object, so patching a nested
// leaf (e.g. one series' color) doesn't drop its siblings. Non-object values
// (and arrays) replace wholesale.
function deepMerge(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const existing = out[key];
    out[key] =
      isPlainObject(value) && isPlainObject(existing)
        ? deepMerge(existing, value)
        : value;
  }
  return out;
}

// A widget whose props carry a `dataBinding` is data-backed; validate that
// binding by actually running the query before the widget is created/updated,
// so a bad metric/column name surfaces here as a correctable tool error rather
// than as a render-time failure. Generic — it doesn't need to know the widget
// type, only the shared `dataBinding` convention.
async function validateDataBinding(
  props: Record<string, unknown> | undefined,
): Promise<{ success: false; message: string } | undefined> {
  if (props && isPlainObject(props.dataBinding)) {
    try {
      await dashboard.fetchQueryData(props.dataBinding as unknown as DataBindingSpec);
    } catch (e) {
      return errorResult(e);
    }
  }
  return undefined;
}

// A widget type's published control schema, fetched from the backend registry
// (the single source of truth for what a type's props must contain). Cached per
// type for the session. A plain GET returns the *base* schema — no enrichment,
// so no request body and no CSRF/auth needed (unlike the POST the control panel
// uses to enrich x-dynamic fields). Returns null for a type with no published
// schema (a structural container like canvas/tabs — the endpoint 404s) or on a
// transient fetch failure, so a missing/unreachable schema never blocks widget
// creation — only a schema we positively read is enforced.
const controlSchemaCache = new Map<string, Record<string, unknown> | null>();

async function fetchControlSchema(
  widgetType: string,
): Promise<Record<string, unknown> | null> {
  if (controlSchemaCache.has(widgetType)) return controlSchemaCache.get(widgetType)!;
  try {
    const response = await fetch(
      `/api/v1/widgets/type/${encodeURIComponent(widgetType)}/control-schema`,
    );
    if (response.status === 404) {
      controlSchemaCache.set(widgetType, null);
      return null;
    }
    if (!response.ok) return null; // transient — don't cache, don't block
    const data = await response.json();
    const schema = (data.result ?? null) as Record<string, unknown> | null;
    controlSchemaCache.set(widgetType, schema);
    return schema;
  } catch {
    return null; // network error — don't block widget creation
  }
}

// Enforce the widget type's own required props (from its published schema) so a
// data-backed widget can't be created/updated missing a mandatory branch — e.g.
// an 'echarts' or 'metric-tile' without its `dataBinding`. Complements
// validateDataBinding, which only fires once a dataBinding is *present*; this
// catches it being absent entirely. Types with no published schema (canvas,
// tabs, ...) declare no requirements, so nothing is enforced for them.
async function validateRequiredProps(
  widgetType: string,
  props: Record<string, unknown> | undefined,
): Promise<{ success: false; message: string } | undefined> {
  const schema = await fetchControlSchema(widgetType);
  const required = Array.isArray(schema?.required)
    ? (schema!.required as string[])
    : [];
  const missing = required.filter(
    key => !props || props[key] === undefined || props[key] === null,
  );
  if (missing.length > 0) {
    return {
      success: false,
      message:
        `The "${widgetType}" widget requires these props: ${missing.join(", ")}. ` +
        `Call get_widget_control_schema("${widgetType}") to see their shape, then ` +
        `include them (e.g. a data-backed widget needs a dataBinding).`,
    };
  }
  return undefined;
}

// A dynamic map branch whose keys must be real data values, per its schema's
// `x-key-source` hint: the path to the map, and the prop naming the dimension
// whose distinct values are the valid keys (falling back to the last dimension).
interface DynamicKeyedBranch {
  path: string[];
  dimensionFromProp: string;
}

// Resolve a node's single `$ref` (optionally an allOf-wrapped one) against
// `$defs` so the walk can descend into referenced definitions.
function derefSchema(
  node: Record<string, unknown>,
  defs: Record<string, unknown>,
): Record<string, unknown> {
  const ref =
    typeof node.$ref === "string"
      ? node.$ref
      : Array.isArray(node.allOf) &&
          node.allOf.length === 1 &&
          isPlainObject(node.allOf[0]) &&
          typeof (node.allOf[0] as Record<string, unknown>).$ref === "string"
        ? ((node.allOf[0] as Record<string, unknown>).$ref as string)
        : undefined;
  if (!ref) return node;
  const target = defs[ref.split("/").pop() as string];
  return isPlainObject(target) ? target : node;
}

// Walk a control schema for dynamic maps that declare an `x-key-source`, so the
// client can validate their keys generically — no per-widget knowledge, just
// the schema convention.
function findDynamicKeyedBranches(
  schema: Record<string, unknown>,
): DynamicKeyedBranch[] {
  const defs = (isPlainObject(schema.$defs) ? schema.$defs : {}) as Record<
    string,
    unknown
  >;
  const out: DynamicKeyedBranch[] = [];
  const visit = (raw: unknown, path: string[], depth: number) => {
    if (depth > 8 || !isPlainObject(raw)) return;
    const node = derefSchema(raw, defs);
    const keySource = node["x-key-source"];
    if (node["x-dynamic"] && isPlainObject(keySource)) {
      const prop = keySource.dimensionFromProp;
      if (typeof prop === "string") out.push({ path, dimensionFromProp: prop });
    }
    if (isPlainObject(node.properties)) {
      for (const [key, child] of Object.entries(node.properties)) {
        visit(child, [...path, key], depth + 1);
      }
    }
  };
  visit(schema, [], 0);
  return out;
}

function getAtPath(
  obj: Record<string, unknown>,
  path: string[],
): unknown {
  let cur: unknown = obj;
  for (const seg of path) {
    if (!isPlainObject(cur)) return undefined;
    cur = cur[seg];
  }
  return cur;
}

// Validate the keys of any dynamic map (e.g. per-series styling) against the
// real distinct values of the dimension its schema says they come from, by
// running the widget's own query. Catches an agent inventing a key like "F"
// when the actual values are "boy"/"girl", and the error lists the valid values
// so it can self-correct. Generic: driven entirely by the `x-key-source` hint.
async function validateDynamicKeys(
  widgetType: string,
  props: Record<string, unknown> | undefined,
): Promise<{ success: false; message: string } | undefined> {
  if (!isPlainObject(props)) return undefined;
  const schema = await fetchControlSchema(widgetType);
  if (!schema) return undefined;
  const binding = props.dataBinding;
  if (!isPlainObject(binding)) return undefined;

  for (const branch of findDynamicKeyedBranches(schema)) {
    const map = getAtPath(props, branch.path);
    if (!isPlainObject(map)) continue;
    const keys = Object.keys(map);
    if (keys.length === 0) continue;

    const dims = Array.isArray(binding.dimensions) ? binding.dimensions : [];
    const named = props[branch.dimensionFromProp];
    const dimension =
      typeof named === "string" && named
        ? named
        : typeof dims[dims.length - 1] === "string"
          ? (dims[dims.length - 1] as string)
          : undefined;
    if (!dimension) continue;

    let rows;
    try {
      ({ rows } = await dashboard.fetchQueryData(
        binding as unknown as DataBindingSpec,
      ));
    } catch {
      continue; // can't reach the data to validate — don't block on it
    }
    const valid = new Set(
      rows.map(row => String((row as Record<string, unknown>)[dimension] ?? "")),
    );
    const invalid = keys.filter(key => !valid.has(key));
    if (invalid.length > 0) {
      return {
        success: false,
        message:
          `Invalid ${branch.path.join(".")} ` +
          `${invalid.length === 1 ? "key" : "keys"}: ${invalid.join(", ")}. ` +
          `Those aren't values of "${dimension}" — the valid values are: ` +
          `${[...valid].join(", ")}. Use one of those exactly.`,
      };
    }
  }
  return undefined;
}

/**
 * Client-side tools that let the chat agent manipulate the Dashboard v2
 * canvas. The state lives only in this browser tab, so these run client-side
 * (dispatched by ChatPanel's send/resume loop) rather than through the MCP
 * server.
 *
 * Deliberately thin and schema-agnostic: the tree/placement operations
 * (add/remove/move/layout) are the dashboard's fixed grammar, and a widget's
 * *content* is a generic `props` object validated against that widget type's
 * own published schema — which the agent discovers via the server tools
 * `list_widget_types` and `get_widget_control_schema` (the latter returns the
 * minimal root, or the requested subtrees when called with `paths`) rather than
 * from schemas duplicated here.
 */
export default function useDashboardTools(): ClientTool[] {
  return useMemo(
    () => [
      {
        name: "get_dashboard_root",
        description:
          "Returns the dashboard's root canvas widget, including its child node ids. " +
          "Use this to see the top-level layout before adding widgets.",
        inputSchema: emptyInputSchema,
        handler: () => ({ success: true, node: dashboard.getRoot() }),
      },
      {
        name: "get_widget",
        description:
          "Returns a specific widget by id, including its type, layout, props, and " +
          "(for canvas widgets, or a 'tabs'/'tab'/'collapsible'/'carousel'/'slide' " +
          "widget) children. NOTE: props show only what is currently SET, not the " +
          "full set of options the widget supports — for that, consult its control " +
          "schema (get_widget_control_schema).",
        inputSchema: nodeIdSchema,
        handler: (x: unknown) => {
          const input = x as { node_id: string };
          const node = dashboard.getNode(input.node_id);
          if (!node) return { success: false, message: `Widget "${input.node_id}" not found` };
          return { success: true, node };
        },
      },
      {
        name: "add_widget",
        description:
          "Adds a new widget to the dashboard as a child of an existing container " +
          "widget (a grid — the root or a 'canvas' — or a 'tabs'/'tab'/'collapsible'/" +
          "'carousel'/'slide' widget, see parent_id), and returns its id. Provide " +
          "`widget_type`, its placement within the parent (col_span/row_span/col/row " +
          "— ignored, except row_span, when the parent has no grid of its own; see " +
          "each field's own description), and — for content widgets — `props` " +
          "matching that type's published schema (discover it with " +
          "get_widget_control_schema(widget_type)). If props includes a dataBinding, " +
          "the query is run to validate it before the widget is created; on failure no " +
          "widget is created and the error is returned so you can correct it.",
        inputSchema: addWidgetSchema,
        handler: async (x: unknown) => {
          const input = x as {
            parent_id: string;
            index: number;
            widget_type: string;
            col_span?: number;
            row_span?: number;
            col?: number;
            row?: number;
            columns?: number;
            gap?: number;
            row_unit?: number;
            props?: Record<string, unknown>;
          };

          // 'tab' and 'slide' are structural panes with no published control
          // schema (like 'canvas'/'tabs'/'collapsible'/'carousel'), so the
          // generic required-props check below can't enforce their one real
          // requirement — a label to show in the tab strip / outline — and
          // needs this explicit check instead.
          if (input.widget_type === "tab" || input.widget_type === "slide") {
            if (typeof input.props?.label !== "string" || !input.props.label) {
              return {
                success: false,
                message: `widget_type '${input.widget_type}' requires a "label" prop`,
              };
            }
          }

          const requiredError = await validateRequiredProps(
            input.widget_type,
            input.props,
          );
          if (requiredError) return requiredError;

          const bindingError = await validateDataBinding(input.props);
          if (bindingError) return bindingError;

          const dynamicKeyError = await validateDynamicKeys(
            input.widget_type,
            input.props,
          );
          if (dynamicKeyError) return dynamicKeyError;

          // The one row_span default this generic tool still has to know
          // about itself, rather than leaving to the widget's own schema: a
          // filter is a compact single control, not a chart, so the bare
          // "1 row track" default (visually a sliver) would clip most of it.
          // Root-grid-only — on any flow parent ('tabs'/'tab'/'collapsible'/
          // 'carousel'/'slide') row_span means a literal pixel height
          // instead of a row-track count, so defaulting it there would
          // render a 3px sliver rather than leaving the widget to flex and
          // fill its container the way an unset row_span is meant to; a
          // 'filter.bar' parent ignores row_span entirely for the same
          // reason col_span is ignored there (see the schema's own note).
          let rowSpan = input.row_span;
          if (
            rowSpan === undefined &&
            (input.widget_type === "filter.select" ||
              input.widget_type === "filter.bar") &&
            dashboard.getNode(input.parent_id)?.type === "grid"
          ) {
            rowSpan = 3;
          }

          try {
            const nodeId = dashboard.addWidget(input.parent_id, input.index, {
              type: input.widget_type,
              layout: {
                colSpan: input.col_span,
                rowSpan,
                col: input.col,
                row: input.row,
                columns: input.columns,
                gap: input.gap,
                rowUnit: input.row_unit,
              },
              props: input.props,
            });
            return { success: true, message: `Added "${input.widget_type}" widget`, node_id: nodeId };
          } catch (e) {
            return errorResult(e);
          }
        },
      },
      {
        name: "remove_widget",
        description:
          "Removes a widget (and, if it holds children — a 'canvas', 'tabs', 'tab', " +
          "'collapsible', 'carousel', or 'slide' widget — its entire subtree) from " +
          "the dashboard.",
        inputSchema: nodeIdSchema,
        handler: (x: unknown) => {
          const input = x as { node_id: string };
          // dashboard.removeWidget() silently no-ops for an id that doesn't
          // exist (rather than throwing) — check first so a stale or mistaken
          // node_id is reported as a failure instead of a false "Removed"
          // success.
          if (!dashboard.getNode(input.node_id)) {
            return { success: false, message: `Widget "${input.node_id}" not found` };
          }
          try {
            dashboard.removeWidget(input.node_id);
            return { success: true, message: `Removed widget "${input.node_id}"` };
          } catch (e) {
            return errorResult(e);
          }
        },
      },
      {
        name: "move_widget",
        description: "Moves an existing widget to a new container parent at a given index.",
        inputSchema: moveWidgetSchema,
        handler: (x: unknown) => {
          const input = x as { node_id: string; new_parent_id: string; new_index: number };
          try {
            dashboard.moveWidget(input.node_id, input.new_parent_id, input.new_index);
            return { success: true, message: `Moved widget "${input.node_id}"` };
          } catch (e) {
            return errorResult(e);
          }
        },
      },
      {
        name: "update_widget_layout",
        description:
          "Updates layout properties of an existing widget — either how it's placed " +
          "within its parent's grid (col_span/row_span/col/row) or, if it's the root " +
          "or a canvas, its own grid config for its children (columns/gap/row_unit). " +
          "Omit fields you don't want to change.",
        inputSchema: updateWidgetLayoutSchema,
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
        name: "update_widget",
        description:
          "Updates an existing widget's CONTENT in place — pass `props` with the fields " +
          "to change, matching the widget type's published schema (discover it with " +
          "get_widget_control_schema, passing `paths` to expand collapsed branches). " +
          "Before telling the user a requested customization isn't supported, ALWAYS " +
          "check that schema — including expanding relevant collapsed branches (e.g. " +
          "an appearance/style branch) — rather than assuming from the current props " +
          "or the widget's name; the capability may live in a branch you haven't " +
          "looked at. Use this instead of remove_widget + add_widget whenever you're " +
          "editing something that already exists — it keeps the widget's position, " +
          "layout, and identity intact. Only the keys you pass change; nested objects " +
          "are deep-merged, so you can change a single nested value without resending " +
          "its siblings. Omit " +
          "`dataBinding` to keep the existing query; when provided it's validated by " +
          "running the query first, same as add_widget.",
        inputSchema: updateWidgetSchema,
        handler: async (x: unknown) => {
          const input = x as { node_id: string; props?: Record<string, unknown> };

          const node = dashboard.getNode(input.node_id);
          if (!node) return { success: false, message: `Widget "${input.node_id}" not found` };
          if (!isPlainObject(input.props)) {
            return { success: false, message: "props must be an object of the fields to change" };
          }

          const bindingError = await validateDataBinding(input.props);
          if (bindingError) return bindingError;

          // Deep-merge into the widget's existing props so a partial patch
          // (e.g. one series' color) doesn't drop untouched siblings.
          const existing = (node.props as Record<string, unknown>) ?? {};
          const merged = deepMerge(existing, input.props);

          // Enforce required props against the merged result, not the patch —
          // a valid restyle patch legitimately omits already-present required
          // fields like dataBinding.
          const requiredError = await validateRequiredProps(node.type, merged);
          if (requiredError) return requiredError;

          // Validate dynamic-map keys (e.g. per-series styling) against the real
          // dimension values, so an invented key like "F" is rejected with the
          // valid values rather than silently written.
          const dynamicKeyError = await validateDynamicKeys(node.type, merged);
          if (dynamicKeyError) return dynamicKeyError;

          try {
            dashboard.updateProps(input.node_id, merged);
            return { success: true, message: `Updated "${node.type}" widget "${input.node_id}"` };
          } catch (e) {
            return errorResult(e);
          }
        },
      },
    ],
    [],
  );
}
