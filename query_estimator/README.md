# Query Estimator Extension

A Superset SQL Lab extension that analyzes queries before execution to estimate resource usage and identify potential issues.

## Features

- **Resource impact assessment** - Visual gauge showing estimated resource level (Low/Medium/High/Critical)
- **Query metrics** - Estimated rows, cost, memory, and execution time from database EXPLAIN
- **Warning detection** - Identifies problematic patterns like sequential scans, cartesian products, and large result sets
- **Query plan visualization** - Interactive tree view of the execution plan

## Supported Databases

- **PostgreSQL** - Uses `EXPLAIN (FORMAT JSON, COSTS)` for cost-based estimates
- **Trino** - Uses `EXPLAIN (TYPE DISTRIBUTED, FORMAT JSON)` for distributed query planning

## Usage

1. Open SQL Lab and write a query
2. Click on the "Query Estimator" panel
3. Click "Estimate Query" to analyze
4. Review the resource impact, metrics, warnings, and query plan
5. Click "Re-estimate" after making changes to re-analyze

## Panel Layout

The results are displayed in a three-column layout:

| Column 1 (25%) | Column 2 (25%) | Column 3 (50%) |
| -------------- | -------------- | -------------- |
| Resource Gauge | Warnings       | Query Plan     |
| Metrics        |                |                |

### Resource Levels

- **Low** - Query should execute quickly with minimal resources
- **Medium** - Query may require moderate resources
- **High** - Query will likely consume significant resources
- **Critical** - Query may cause performance issues or timeouts

### Thresholds

| Metric | Medium | High   | Critical |
| ------ | ------ | ------ | -------- |
| Memory | 50 GB  | 200 GB | 800 GB   |
| Time   | 30 sec | 2 min  | 5 min    |
| Rows   | 10M    | 100M   | 1B       |
| Cost   | 100K   | 1M     | 10M      |

## Development

### Building

```bash
# From the extension directory
superset-extensions build
```

### Project Structure

```
query_estimator/
├── frontend/
│   ├── src/
│   │   ├── index.tsx              # Extension entry point
│   │   ├── EstimatorPanel.tsx     # Main panel component
│   │   ├── components/
│   │   │   ├── ResourceGauge.tsx  # Resource level indicator
│   │   │   ├── MetricsColumn.tsx  # Metrics display
│   │   │   ├── WarningsColumn.tsx # Warnings list
│   │   │   └── PlanTree.tsx       # Query plan tree view
│   │   ├── styles.ts              # Shared styles
│   │   └── types.ts               # TypeScript type definitions
│   ├── package.json
│   ├── tsconfig.json
│   └── webpack.config.js
├── backend/
│   └── src/
│       └── query_estimator/
│           ├── api.py             # REST API endpoint
│           ├── parsers.py         # EXPLAIN output parsers
│           ├── types.py           # Python type definitions
│           └── entrypoint.py      # Extension registration
├── extension.json                 # Extension manifest
└── README.md
```

## License

MIT
