import { homedir } from "os"
import { join } from "path"

export const TRANSCRIPTION_HISTORY_PATH = join(
  homedir(),
  "Library/Containers/com.zeitalabs.JottleAI/Data/Documents/transcription_history.json",
)

// macOS epoch is 2001-01-01, JS epoch is 1970-01-01
export const MACOS_EPOCH_OFFSET = 978307200
