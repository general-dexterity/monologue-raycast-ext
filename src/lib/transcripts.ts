import { constants } from "fs"
import { access, readFile } from "fs/promises"
import { MACOS_EPOCH_OFFSET, TRANSCRIPTION_HISTORY_PATH } from "./constants"

// Re-export database types and queries
export { DATABASE_PATH, type DBTranscript, QUERIES } from "./database"

export interface Transcript {
  text: string
  rawText: string
  id: string
  timestamp: number
  sourceType: string
  sourceIdentifier: string
  status: { completed?: Record<string, never> } | { failedTranscription?: Record<string, never> }
  duration: number
  audioPath?: string
  dictateContext?: string
  syncedAt?: number
}

export class TranscriptError extends Error {
  constructor(
    message: string,
    public readonly code: "NOT_FOUND" | "PARSE_ERROR" | "EMPTY" | "NO_COMPLETED" | "DB_ERROR",
  ) {
    super(message)
    this.name = "TranscriptError"
  }
}

export async function historyFileExists(): Promise<boolean> {
  try {
    await access(TRANSCRIPTION_HISTORY_PATH, constants.R_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Get the last completed transcript directly from JSON file.
 * Used by quick commands that need immediate access without DB sync.
 */
export async function getLastCompletedTranscript(): Promise<Transcript> {
  if (!(await historyFileExists())) {
    throw new TranscriptError("Monologue not installed or no transcription history", "NOT_FOUND")
  }

  try {
    const content = await readFile(TRANSCRIPTION_HISTORY_PATH, "utf-8")
    const history = JSON.parse(content) as { history: Transcript[] }
    const completed = history.history.filter((t) => "completed" in t.status)

    if (completed.length === 0) {
      throw new TranscriptError("No completed transcriptions found", "NO_COMPLETED")
    }

    return completed[0]
  } catch (e) {
    if (e instanceof TranscriptError) throw e
    throw new TranscriptError("Failed to parse transcription history", "PARSE_ERROR")
  }
}

export function macosTimestampToDate(timestamp: number): Date {
  return new Date((timestamp + MACOS_EPOCH_OFFSET) * 1000)
}

export function audioPathToFilePath(audioPath: string): string | null {
  if (!audioPath.startsWith("file://")) return null
  try {
    return decodeURIComponent(audioPath.replace("file://", ""))
  } catch {
    return null
  }
}

export async function audioFileExists(audioPath: string | undefined): Promise<boolean> {
  if (!audioPath) return false
  const filePath = audioPathToFilePath(audioPath)
  if (!filePath) return false
  try {
    await access(filePath, constants.R_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Check if a sourceIdentifier is a valid bundle ID (not a URL)
 * Bundle IDs are reverse-domain notation like "com.apple.Safari"
 */
export function isBundleId(sourceIdentifier: string): boolean {
  if (!sourceIdentifier) return false
  if (sourceIdentifier.startsWith("http://") || sourceIdentifier.startsWith("https://")) {
    return false
  }
  return /^[a-zA-Z][a-zA-Z0-9-]*(\.[a-zA-Z0-9-]+)+$/.test(sourceIdentifier)
}
