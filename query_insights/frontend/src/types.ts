export interface TeamMember {
  profilePictureUrl?: string;
  name?: string;
}

export interface OwnerTeam {
  name?: string;
  slackChannel?: string;
  members?: TeamMember[];
}

export interface TableMetadata {
  name: string;
  latestPartition?: string;
  description?: string;
  isMidasCertified?: boolean;
  retentionDays?: number;
  ownerTeam?: OwnerTeam;
  dqScore?: { dataQualityScore?: number };
  exampleQueries?: string[];
  partitionScheme?: string;
  outputDelay?: number;
}

export type QueryState = {
  metadata: TableMetadata[];
  errorState: string | null;
  loading: boolean;
  databaseId: number | null;
};

export type QueryAction =
  | { type: 'QUERY_START' }
  | { type: 'QUERY_SUCCESS'; payload: TableMetadata[] }
  | { type: 'QUERY_FAIL'; payload: string }
  | { type: 'DATABASE_CHANGED'; payload: number };
