"""
Query Insights Service

Core business logic for generating query metadata insights.
Used by both the REST API and MCP tool.
"""

import random
from datetime import datetime, timedelta
from typing import Optional


def get_query_metadata(sql: str, default_schema: Optional[str] = None) -> dict:
    """
    Get metadata insights for tables referenced in a SQL query.

    Args:
        sql: The SQL query to analyze
        default_schema: Optional default schema for resolving table names

    Returns:
        Dictionary containing table metadata with the following structure:
        {
            "tables": [
                {
                    "name": str,
                    "description": str,
                    "latestPartition": str,
                    "retentionDays": int,
                    "partitionScheme": str,
                    "isMidasCertified": bool,
                    "dqScore": {"dataQualityScore": int},
                    "ownerTeam": {...},
                    "exampleQueries": [str, ...]
                },
                ...
            ]
        }
    """
    # Generate a recent date for latest partition
    today = datetime.now()
    partition_date = (today - timedelta(days=random.randint(0, 3))).strftime("%Y-%m-%d")

    # Mock data - in production this would call an external service
    return {
        "tables": [
            {
                "name": "public.dim_listings",
                "description": "Dimension table containing listing attributes and metadata for all listings on the platform.",
                "latestPartition": partition_date,
                "retentionDays": 365,
                "partitionScheme": "daily",
                "isMidasCertified": True,
                "dqScore": {"dataQualityScore": 92},
                "ownerTeam": {
                    "name": "Listings Team",
                    "slackChannel": "listings-team",
                    "members": [
                        {"name": "Diana Prince", "profilePictureUrl": None},
                        {"name": "Clark Kent", "profilePictureUrl": None},
                        {"name": "Bruce Wayne", "profilePictureUrl": None},
                    ],
                },
                "exampleQueries": [
                    "SELECT * FROM public.dim_listings WHERE ds = '2024-01-01' LIMIT 100",
                    "SELECT listing_id, host_id, property_type FROM public.dim_listings WHERE country = 'US'",
                ],
            },
            {
                "name": "public.fact_reservations",
                "description": "Fact table containing all reservation events including bookings, cancellations, and modifications.",
                "latestPartition": partition_date,
                "retentionDays": 730,
                "partitionScheme": "daily",
                "outputDelay": 2,
                "isMidasCertified": True,
                "dqScore": {"dataQualityScore": 88},
                "ownerTeam": {
                    "name": "Reservations Team",
                    "slackChannel": "reservations",
                    "members": [
                        {"name": "Peter Parker", "profilePictureUrl": None},
                        {"name": "Mary Jane", "profilePictureUrl": None},
                    ],
                },
                "exampleQueries": [
                    "SELECT COUNT(*) FROM public.fact_reservations WHERE ds >= DATE '2024-01-01'",
                ],
            },
            {
                "name": "public.dim_users",
                "description": "User dimension table with profile information and account details.",
                "latestPartition": partition_date,
                "retentionDays": 180,
                "partitionScheme": "daily",
                "isMidasCertified": False,
                "dqScore": {"dataQualityScore": 75},
                "ownerTeam": {
                    "name": "Identity Team",
                    "slackChannel": "identity",
                    "members": [
                        {"name": "Tony Stark", "profilePictureUrl": None},
                    ],
                },
                "exampleQueries": [],
            },
        ]
    }
