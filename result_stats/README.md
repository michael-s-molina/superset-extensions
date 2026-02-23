# Result Stats Extension

A Superset SQL Lab extension that computes statistics for query results.

## Features

- **Type-aware analysis** - Different statistics for numeric, string, date, and boolean columns
- **Deferred computation** - Statistics are computed when the Result Stats panel is opened, not on every query run
- **Unified empty tracking** - Null values, empty strings, and whitespace-only strings are all counted as empty

### Numeric Columns

| Column | Empty | Zeros | Distinct | Most Frequent | Min | Max | Mean | Std Dev | P25 | P50 | P75 |

- **Empty** - Count (and %) of null or missing values
- **Zeros** - Count (and %) of zero values
- **Distinct** - Count (and %) of distinct non-empty values
- **Most Frequent** - Most common value and its occurrence count
- **Min / Max** - Minimum and maximum values
- **Mean** - Average value
- **Std Dev** - Standard deviation
- **P25 / P50 / P75** - 25th, 50th, and 75th percentiles (linear interpolation)

### String Columns

| Column | Empty | Distinct | Most Frequent | Min Length | Max Length | Avg Length |

- **Empty** - Count (and %) of null, empty, or whitespace-only values
- **Distinct** - Count (and %) of distinct non-empty values
- **Most Frequent** - Most common value and its occurrence count
- **Min / Max Length** - Shortest and longest string character lengths
- **Avg Length** - Average character length across non-empty values

### Date / Temporal Columns

| Column | Empty | Distinct | Most Frequent | Min | Max | Range |

- **Empty** - Count (and %) of null or missing values
- **Distinct** - Count (and %) of distinct non-empty values
- **Most Frequent** - Most common value and its occurrence count
- **Min / Max** - Earliest and latest dates (ISO 8601)
- **Range** - Human-readable span between earliest and latest dates

### Boolean Columns

| Column | Empty | Most Frequent | True | False |

- **Empty** - Count (and %) of null or missing values
- **Most Frequent** - Most common value and its occurrence count
- **True / False** - Counts and percentages of true and false values

## Usage

1. Open SQL Lab
2. Execute a query
3. Click the **Result Stats** panel tab to view statistics

Statistics are computed on the rows and columns returned by the query. If the query result is subject to a row limit, the statistics reflect only the returned rows.

## Development

### Building

```bash
# From the extension directory
PYENV_VERSION=extensions pyenv exec superset-extensions build
```

### Project Structure

```
result_stats/
├── frontend/
│   ├── src/
│   │   ├── index.tsx        # Extension entry point
│   │   ├── Main.tsx         # Panel component and event subscriptions
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
