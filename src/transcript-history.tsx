import { Action, ActionPanel, Icon, List, open, showToast, Toast } from "@raycast/api"
import { useEffect, useMemo, useState } from "react"
import {
  audioFileExists,
  audioPathToFilePath,
  getCompletedTranscripts,
  historyFileExists,
  isBundleId,
  macosTimestampToDate,
  Transcript,
} from "./lib/transcripts"
import { formatDuration, getAppName, truncateText } from "./lib/utils"

function formatDate(date: Date): string {
  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

export default function Command() {
  const [transcripts, setTranscripts] = useState<Transcript[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [notInstalled, setNotInstalled] = useState(false)
  const [audioAvailability, setAudioAvailability] = useState<Record<string, boolean>>({})
  const [selectedApp, setSelectedApp] = useState<string>("all")

  // Get unique apps from transcripts (only valid bundle IDs, not URLs)
  const apps = useMemo(() => {
    const appSet = new Map<string, string>()
    for (const t of transcripts) {
      if (t.sourceIdentifier && isBundleId(t.sourceIdentifier) && !appSet.has(t.sourceIdentifier)) {
        appSet.set(t.sourceIdentifier, getAppName(t.sourceIdentifier))
      }
    }
    return Array.from(appSet.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [transcripts])

  // Filter transcripts by selected app
  const filteredTranscripts = useMemo(() => {
    if (selectedApp === "all") return transcripts
    return transcripts.filter((t) => t.sourceIdentifier === selectedApp)
  }, [transcripts, selectedApp])

  useEffect(() => {
    async function load() {
      if (!(await historyFileExists())) {
        setNotInstalled(true)
        setIsLoading(false)
        return
      }

      try {
        const data = await getCompletedTranscripts()
        setTranscripts(data)

        // Check audio availability in background
        const availability: Record<string, boolean> = {}
        await Promise.all(
          data.slice(0, 50).map(async (t) => {
            availability[t.id] = await audioFileExists(t.audioPath)
          }),
        )
        setAudioAvailability(availability)
      } catch {
        await showToast({ style: Toast.Style.Failure, title: "Failed to load transcripts" })
      }
      setIsLoading(false)
    }
    load()
  }, [])

  if (notInstalled) {
    return (
      <List>
        <List.EmptyView
          title="Monologue Not Found"
          description="Install Monologue to use this extension"
          actions={
            <ActionPanel>
              <Action.OpenInBrowser title="Get Monologue" url="https://www.monologue.to" />
            </ActionPanel>
          }
        />
      </List>
    )
  }

  return (
    <List
      isLoading={isLoading}
      isShowingDetail
      searchBarPlaceholder="Search transcripts..."
      searchBarAccessory={
        <List.Dropdown tooltip="Filter by Application" storeValue onChange={setSelectedApp}>
          <List.Dropdown.Item title="All Applications" value="all" />
          <List.Dropdown.Section title="Applications">
            {apps.map(([bundleId, name]) => (
              <List.Dropdown.Item key={bundleId} title={name} value={bundleId} />
            ))}
          </List.Dropdown.Section>
        </List.Dropdown>
      }
    >
      {filteredTranscripts.map((t) => {
        const hasAudio = audioAvailability[t.id]
        const audioPath = t.audioPath ? audioPathToFilePath(t.audioPath) : null
        const recordedDate = macosTimestampToDate(t.timestamp)
        const sourceName = isBundleId(t.sourceIdentifier) ? getAppName(t.sourceIdentifier) : "Browser"

        return (
          <List.Item
            key={t.id}
            title={truncateText(t.text, 50)}
            accessories={[{ date: recordedDate }]}
            detail={
              <List.Item.Detail
                markdown={t.text}
                metadata={
                  <List.Item.Detail.Metadata>
                    <List.Item.Detail.Metadata.Label title="Source" text={sourceName} />
                    <List.Item.Detail.Metadata.Label title="Duration" text={formatDuration(t.duration)} />
                    <List.Item.Detail.Metadata.Label title="Recorded" text={formatDate(recordedDate)} />
                    <List.Item.Detail.Metadata.Label title="Characters" text={String(t.text.length)} />
                    <List.Item.Detail.Metadata.Separator />
                    <List.Item.Detail.Metadata.Label
                      title="Audio"
                      text={hasAudio ? "Available" : "Not available"}
                      icon={hasAudio ? Icon.Music : Icon.XMarkCircle}
                    />
                  </List.Item.Detail.Metadata>
                }
              />
            }
            actions={
              <ActionPanel>
                <ActionPanel.Section>
                  <Action.Paste title="Paste Text" content={t.text} />
                  <Action.Paste title="Paste Raw Text" content={t.rawText} />
                </ActionPanel.Section>
                <ActionPanel.Section>
                  <Action.CopyToClipboard title="Copy Text" content={t.text} />
                  <Action.CopyToClipboard title="Copy Raw Text" content={t.rawText} />
                </ActionPanel.Section>
                {hasAudio && audioPath && (
                  <ActionPanel.Section>
                    <Action
                      title="Open Audio"
                      icon={Icon.Play}
                      onAction={async () => {
                        await open(audioPath)
                      }}
                    />
                    <Action.ShowInFinder title="Show Audio in Finder" path={audioPath} />
                  </ActionPanel.Section>
                )}
              </ActionPanel>
            }
          />
        )
      })}
    </List>
  )
}
