# Result Stats Extension

A Superset SQL Lab extension that automatically generates statistics for query results.

## Features

- **Automatic computation** - Statistics are calculated when a query completes
- **Type-aware analysis** - Different statistics for numeric, string, date, and boolean columns
- **Visual indicators** - Progress bars show null and distinct percentages
- **Detailed tooltips** - Hover for additional context on each statistic

### Numeric Columns
- **Nulls %** - Percentage of null values
- **Distinct %** - Percentage of distinct values
- **Most Frequent** - Most common value and its count
- **Min/Max** - Minimum and maximum values
- **Mean** - Average value
- **Median** - Middle value
- **Std Dev** - Standard deviation

### String Columns
- **Nulls %** - Percentage of null values
- **Distinct %** - Percentage of distinct values
- **Most Frequent** - Most common value and its count
- **Min/Max Length** - Shortest and longest string lengths
- **Avg Length** - Average string length
- **Empty** - Count of empty strings

### Date/Temporal Columns
- **Nulls %** - Percentage of null values
- **Distinct %** - Percentage of distinct values
- **Most Frequent** - Most common value and its count
- **Min/Max** - Earliest and latest dates
- **Range** - Human-readable date range description

### Boolean Columns
- **Nulls %** - Percentage of null values
- **Distinct %** - Percentage of distinct values
- **Most Frequent** - Most common value and its count
- **True/False** - Counts and percentages
- **Distribution** - Visual bar showing true/false ratio

## Usage

1. Open SQL Lab
2. Execute a query
3. Click on the "Result Stats" panel to view statistics

## Development

### Building

```bash
# From the extension directory
superset-extensions build
```

### Project Structure

```
result_stats/
├── frontend/
│   ├── src/
│   │   ├── index.tsx        # Extension entry point
│   │   ├── Main.tsx         # Main panel component
│   │   ├── StatsTable.tsx   # Statistics display tables
│   │   ├── computeStats.ts  # Statistics calculation logic
│   │   └── types.ts         # TypeScript type definitions
│   ├── package.json
│   ├── tsconfig.json
│   └── webpack.config.js
├── extension.json           # Extension manifest
└── README.md
```

## License

MIT
