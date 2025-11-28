import { Clipboard, showToast, Toast } from "@raycast/api"
import { getLastCompletedTranscript, TranscriptError } from "./lib/transcripts"

export default async function Command() {
  try {
    const transcript = await getLastCompletedTranscript()
    await Clipboard.paste(transcript.text)
    await showToast({ style: Toast.Style.Success, title: "Pasted transcript" })
  } catch (error) {
    const message = error instanceof TranscriptError ? error.message : "Unexpected error"
    await showToast({ style: Toast.Style.Failure, title: message })
  }
}
