import { dashboard } from "@apache-superset/core";

// Ad hoc metric/dimension shapes match the generic query path
// `dashboard.fetchQueryData`/`echarts` widgets use — see cleaned_sales_data's
// columns in superset/examples/featured_charts/datasets/cleaned_sales_data.yaml
// (dataset id 3 in this dev DB).
function salesByDimension(dimension: string) {
  return {
    datasetId: 3,
    metrics: [
      {
        expressionType: "SIMPLE",
        column: { column_name: "sales" },
        aggregate: "SUM",
        label: "Total Sales",
      },
    ],
    dimensions: [dimension],
  };
}

function barOptions(title: string, dimension: string) {
  return {
    title: { text: title },
    xAxis: { type: "category", data: { $bind: { source: "dimension", alias: dimension } } },
    yAxis: { type: "value" },
    series: [{ type: "bar", data: { $bind: { source: "metric", alias: "Total Sales" } } }],
  };
}

// A `metric-tile` needs exactly one metric and no dimensions — the query
// returns a single row, and the tile shows that row's one value directly.
function singleMetric(columnName: string, aggregate: string, label: string) {
  return {
    datasetId: 3,
    metrics: [{ expressionType: "SIMPLE", column: { column_name: columnName }, aggregate, label }],
  };
}

/**
 * Replaces the dashboard's current top-level content with a fixed
 * 11-widget executive-report-style layout — title, a 4-tile KPI row (real
 * `metric-tile` widgets, not the markdown-with-bold-text stand-in this used
 * before that widget type existed), three `echarts` chart rows, a commentary
 * widget, and an `ag-grid-table` detail table — all bound to the
 * `cleaned_sales_data` example dataset, so the canvas/drag/resize behavior
 * can be exercised against realistic content without a chat/AI round trip
 * each time.
 */
export function buildDefaultDashboardReport(): void {
  const root = dashboard.getRoot();
  (root.children ?? []).forEach((id) => dashboard.removeWidget(id));

  dashboard.addWidget(root.id, 0, {
    type: "markdown",
    layout: { colSpan: 24, rowSpan: 3 },
    props: { content: "# Acme Corp — Q3 Executive Report" },
  });
  dashboard.addWidget(root.id, 1, {
    type: "metric-tile",
    layout: { colSpan: 6, rowSpan: 5 },
    props: {
      dataBinding: singleMetric("sales", "SUM", "Total Revenue"),
      label: "Total Revenue",
      prefix: "$",
    },
  });
  dashboard.addWidget(root.id, 2, {
    type: "metric-tile",
    layout: { colSpan: 6, rowSpan: 5 },
    props: {
      dataBinding: singleMetric("order_number", "COUNT_DISTINCT", "Total Orders"),
      label: "Total Orders",
    },
  });
  dashboard.addWidget(root.id, 3, {
    type: "metric-tile",
    layout: { colSpan: 6, rowSpan: 5 },
    props: {
      dataBinding: singleMetric("sales", "AVG", "Avg Order Value"),
      label: "Avg Order Value",
      prefix: "$",
      decimals: 2,
    },
  });
  dashboard.addWidget(root.id, 4, {
    type: "metric-tile",
    layout: { colSpan: 6, rowSpan: 5 },
    props: {
      dataBinding: singleMetric("quantity_ordered", "SUM", "Units Sold"),
      label: "Units Sold",
    },
  });
  dashboard.addWidget(root.id, 5, {
    type: "echarts",
    layout: { colSpan: 12, rowSpan: 14 },
    props: {
      dataBinding: salesByDimension("product_line"),
      echartsOptions: barOptions("Sales by Product Line", "product_line"),
    },
  });
  dashboard.addWidget(root.id, 6, {
    type: "echarts",
    layout: { colSpan: 12, rowSpan: 14 },
    props: {
      dataBinding: salesByDimension("territory"),
      echartsOptions: barOptions("Sales by Territory", "territory"),
    },
  });
  dashboard.addWidget(root.id, 7, {
    type: "echarts",
    layout: { colSpan: 16, rowSpan: 14 },
    props: {
      dataBinding: salesByDimension("deal_size"),
      echartsOptions: barOptions("Sales by Deal Size", "deal_size"),
    },
  });
  dashboard.addWidget(root.id, 8, {
    type: "markdown",
    layout: { colSpan: 8, rowSpan: 14 },
    props: {
      content:
        "**Analyst Notes**\n\nRevenue grew steadily across all regions, with the " +
        "strongest gains in EMEA. Active user growth continues to outpace churn.",
    },
  });
  dashboard.addWidget(root.id, 9, {
    type: "echarts",
    layout: { colSpan: 24, rowSpan: 12 },
    props: {
      dataBinding: salesByDimension("month"),
      echartsOptions: barOptions("Sales by Month", "month"),
    },
  });
  dashboard.addWidget(root.id, 10, {
    type: "ag-grid-table",
    layout: { colSpan: 24, rowSpan: 12 },
    props: {
      dataBinding: {
        datasetId: 3,
        metrics: [
          {
            expressionType: "SIMPLE",
            column: { column_name: "sales" },
            aggregate: "SUM",
            label: "Total Revenue",
          },
        ],
        dimensions: ["customer_name", "product_line", "deal_size"],
        rowLimit: 10,
      },
    },
  });
}
