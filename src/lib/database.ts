import { homedir } from "os"
import { join } from "path"

// Database path - matches Swift code
export const DATABASE_PATH = join(
  homedir(),
  "Library/Application Support/com.raycast.macos/extensions/monologue/transcripts.sqlite",
)

// SQL Queries
export const QUERIES = {
  // Get all transcripts ordered by timestamp (newest first)
  allTranscripts: `
    SELECT id, text, raw_text as rawText, timestamp, source_type as sourceType,
           source_identifier as sourceIdentifier, duration, audio_path as audioPath
    FROM transcripts
    ORDER BY timestamp DESC
  `,

  // Text search using LIKE (FTS5 not available in Raycast's SQLite)
  searchTranscripts: (searchText: string) => {
    // Escape special SQL characters
    const sanitized = searchText.replace(/'/g, "''").replace(/%/g, "\\%").replace(/_/g, "\\_").trim()

    if (!sanitized) return QUERIES.allTranscripts

    // Split into terms and create LIKE conditions for each
    const terms = sanitized.split(/\s+/).filter(Boolean)
    const conditions = terms
      .map((t) => `(text LIKE '%${t}%' ESCAPE '\\' OR raw_text LIKE '%${t}%' ESCAPE '\\')`)
      .join(" AND ")

    return `
      SELECT id, text, raw_text as rawText, timestamp, source_type as sourceType,
             source_identifier as sourceIdentifier, duration, audio_path as audioPath
      FROM transcripts
      WHERE ${conditions}
      ORDER BY timestamp DESC
    `
  },

  // Get transcripts filtered by source
  bySource: (sourceIdentifier: string) => {
    // Escape single quotes by doubling them for SQLite
    const escapedIdentifier = sourceIdentifier.replace(/'/g, "''")
    return `
    SELECT id, text, raw_text as rawText, timestamp, source_type as sourceType,
           source_identifier as sourceIdentifier, duration, audio_path as audioPath
    FROM transcripts
    WHERE source_identifier = '${escapedIdentifier}'
    ORDER BY timestamp DESC
  `
  },

  // Get unique source identifiers for filtering
  uniqueSources: `
    SELECT DISTINCT source_identifier as sourceIdentifier
    FROM transcripts
    WHERE source_identifier IS NOT NULL AND source_identifier != ''
    ORDER BY source_identifier
  `,

  // Get the most recent transcript
  lastTranscript: `
    SELECT id, text, raw_text as rawText, timestamp, source_type as sourceType,
           source_identifier as sourceIdentifier, duration, audio_path as audioPath
    FROM transcripts
    ORDER BY timestamp DESC
    LIMIT 1
  `,

  // Count transcripts
  count: `SELECT COUNT(*) as count FROM transcripts`,
}

// Type for transcript from database
export interface DBTranscript {
  id: string
  text: string
  rawText: string
  timestamp: number
  sourceType: string
  sourceIdentifier: string
  duration: number
  audioPath: string | null
}
