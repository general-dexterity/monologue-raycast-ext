import { Cache } from "@raycast/api"
import { constants } from "fs"
import { access, readFile, stat } from "fs/promises"
import { MACOS_EPOCH_OFFSET, TRANSCRIPTION_HISTORY_PATH } from "./constants"

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

interface TranscriptionHistory {
  history: Transcript[]
}

interface CachedData {
  mtime: number
  transcripts: Transcript[]
}

const cache = new Cache({ namespace: "transcripts" })
const CACHE_KEY = "transcription-history"

export class TranscriptError extends Error {
  constructor(
    message: string,
    public readonly code: "NOT_FOUND" | "PARSE_ERROR" | "EMPTY" | "NO_COMPLETED",
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

async function getFileMtime(): Promise<number> {
  const stats = await stat(TRANSCRIPTION_HISTORY_PATH)
  return stats.mtimeMs
}

export async function getAllTranscripts(): Promise<Transcript[]> {
  const mtime = await getFileMtime()

  // Check cache
  const cached = cache.get(CACHE_KEY)
  if (cached) {
    try {
      const data: CachedData = JSON.parse(cached)
      if (data.mtime === mtime) {
        return data.transcripts
      }
    } catch {
      // Invalid cache, continue to read file
    }
  }

  // Read and parse file
  const content = await readFile(TRANSCRIPTION_HISTORY_PATH, "utf-8")
  const history: TranscriptionHistory = JSON.parse(content)
  const transcripts = history.history || []

  // Update cache
  const cacheData: CachedData = { mtime, transcripts }
  cache.set(CACHE_KEY, JSON.stringify(cacheData))

  return transcripts
}

export async function getCompletedTranscripts(): Promise<Transcript[]> {
  const all = await getAllTranscripts()
  return all.filter((t) => "completed" in t.status)
}

export async function getLastCompletedTranscript(): Promise<Transcript> {
  if (!(await historyFileExists())) {
    throw new TranscriptError("Monologue not installed or no transcription history", "NOT_FOUND")
  }

  let transcripts: Transcript[]
  try {
    transcripts = await getCompletedTranscripts()
  } catch {
    throw new TranscriptError("Failed to parse transcription history", "PARSE_ERROR")
  }

  if (transcripts.length === 0) {
    throw new TranscriptError("No completed transcriptions found", "NO_COMPLETED")
  }

  return transcripts[0]
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
  // URLs start with http:// or https://
  if (sourceIdentifier.startsWith("http://") || sourceIdentifier.startsWith("https://")) {
    return false
  }
  // Bundle IDs match pattern like "com.example.app" or "org.example.app"
  return /^[a-zA-Z][a-zA-Z0-9-]*(\.[a-zA-Z0-9-]+)+$/.test(sourceIdentifier)
}
