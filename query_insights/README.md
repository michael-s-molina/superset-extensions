# Query Insights Extension

A Superset SQL Lab extension that displays metadata and governance information for tables referenced in your queries.

## Features

- **Automatic discovery** - Analyzes queries on execution to identify referenced tables
- **Table metadata** - Shows description, latest partition, retention period, and partition scheme
- **Data quality scores** - Visual indicator of table data quality with color-coded scores
- **Midas certification** - Badge indicating tables that meet certification standards
- **Owner team info** - Team name, Slack channel, and member avatars
- **Example queries** - Quick access to sample queries for each table

## Table Information

| Column | Description |
| ------ | ----------- |
| Table | Fully qualified table name |
| Description | Table purpose and contents |
| DQ Score | Data quality score (color-coded: green ≥80, blue ≥65, orange ≥45, red <45) |
| Midas Certified | Certification badge for validated tables |
| Latest Partition | Most recent partition date with scheme indicator (D=daily, W=weekly, etc.) |
| Retention | Data retention period |
| Owner Team | Responsible team with Slack channel and members |
| Example Queries | Sample queries for the table |

## Usage

1. Open SQL Lab and connect to a supported database
2. Write and execute a query
3. Click on the "Query Insights" panel to view table metadata
4. Hover over elements for additional details (descriptions, example queries, etc.)

## Development

### Building

```bash
# From the extension directory
superset-extensions build
```

### Project Structure

```
query_insights/
├── frontend/
│   ├── src/
│   │   ├── index.tsx       # Extension entry point
│   │   ├── Main.tsx        # Main panel component
│   │   ├── Table.tsx       # Metadata table display
│   │   ├── MidasIcon.tsx   # Certification badge icon
│   │   └── types.ts        # TypeScript type definitions
│   ├── package.json
│   └── tsconfig.json
├── backend/
│   └── src/
│       └── query_insights/
│           ├── api.py        # REST API endpoint
│           ├── service.py    # Core metadata service
│           ├── mcp_tools.py  # MCP tool integration
│           └── entrypoint.py # Extension registration
├── extension.json            # Extension manifest
└── README.md
```

## License

MIT
