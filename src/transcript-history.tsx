import { syncTranscripts } from "swift:../swift"
import { Action, ActionPanel, Icon, List, showToast, Toast } from "@raycast/api"
import { useSQL } from "@raycast/utils"
import { access, constants } from "fs/promises"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  audioFileExists,
  audioPathToFilePath,
  DATABASE_PATH,
  type DBTranscript,
  historyFileExists,
  isBundleId,
  macosTimestampToDate,
  QUERIES,
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

// View mode configuration
type ViewMode = "processed" | "raw"

const VIEW_MODE_CONFIG = {
  processed: {
    primaryTitle: "Paste Text",
    secondaryTitle: "Paste Raw Text",
    copyPrimaryTitle: "Copy Text",
    copySecondaryTitle: "Copy Raw Text",
    toggleTitle: "Show Raw Transcript",
    getText: (t: DBTranscript) => t.text,
    getAltText: (t: DBTranscript) => t.rawText,
  },
  raw: {
    primaryTitle: "Paste Raw Text",
    secondaryTitle: "Paste Text",
    copyPrimaryTitle: "Copy Raw Text",
    copySecondaryTitle: "Copy Text",
    toggleTitle: "Show Processed Transcript",
    getText: (t: DBTranscript) => t.rawText,
    getAltText: (t: DBTranscript) => t.text,
  },
} as const

const PAGE_SIZE = 250

// Inner component that uses useSQL - only rendered after database exists
function TranscriptList() {
  const [selectedApp, setSelectedApp] = useState<string>("all")
  const [viewMode, setViewMode] = useState<ViewMode>("processed")
  const [searchText, setSearchText] = useState("")
  const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE)
  const [audioAvailability, setAudioAvailability] = useState<Record<string, boolean>>({})

  const mode = useMemo(() => VIEW_MODE_CONFIG[viewMode], [viewMode])
  const toggleViewMode = useCallback(() => {
    setViewMode((m) => (m === "processed" ? "raw" : "processed"))
  }, [])

  const handleSearchChange = useCallback((text: string) => {
    setSearchText(text)
    setDisplayLimit(PAGE_SIZE) // Reset pagination on search
  }, [])

  // Build the SQL query based on app filter only
  const query = useMemo(() => {
    if (selectedApp !== "all") {
      return QUERIES.bySource(selectedApp)
    }
    return QUERIES.allTranscripts
  }, [selectedApp])

  // Query database using useSQL
  const { data: transcripts, isLoading: isQueryLoading } = useSQL<DBTranscript>(DATABASE_PATH, query)

  // Filter transcripts based on search text (searches all items, not just displayed)
  const filteredTranscripts = useMemo(() => {
    if (!transcripts) return []
    if (!searchText.trim()) return transcripts
    const query = searchText.toLowerCase()
    return transcripts.filter((t) => t.text.toLowerCase().includes(query) || t.rawText.toLowerCase().includes(query))
  }, [transcripts, searchText])

  // Get unique sources for dropdown
  const { data: sourcesData } = useSQL<{ sourceIdentifier: string }>(DATABASE_PATH, QUERIES.uniqueSources)

  // Build apps list from unique sources
  const apps = useMemo(() => {
    if (!sourcesData) return []
    const appSet = new Map<string, string>()
    for (const s of sourcesData) {
      if (s.sourceIdentifier && isBundleId(s.sourceIdentifier) && !appSet.has(s.sourceIdentifier)) {
        appSet.set(s.sourceIdentifier, getAppName(s.sourceIdentifier))
      }
    }
    return Array.from(appSet.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [sourcesData])

  // Check audio availability for visible transcripts
  const checkAudio = useCallback(async (items: DBTranscript[]) => {
    const availability: Record<string, boolean> = {}
    await Promise.all(
      items.slice(0, 50).map(async (t) => {
        availability[t.id] = await audioFileExists(t.audioPath ?? undefined)
      }),
    )
    setAudioAvailability((prev) => ({ ...prev, ...availability }))
  }, [])

  useEffect(() => {
    if (transcripts?.length) {
      checkAudio(transcripts)
    }
  }, [transcripts, checkAudio])

  const totalCount = filteredTranscripts.length
  const hasMore = displayLimit < totalCount

  return (
    <List
      isLoading={isQueryLoading}
      isShowingDetail
      searchBarPlaceholder="Search transcripts..."
      filtering={false}
      onSearchTextChange={handleSearchChange}
      throttle
      pagination={{
        onLoadMore: () => setDisplayLimit((l) => l + PAGE_SIZE),
        hasMore,
        pageSize: PAGE_SIZE,
      }}
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
      {filteredTranscripts.slice(0, displayLimit).map((t) => {
        const hasAudio = audioAvailability[t.id]
        const audioPath = t.audioPath ? audioPathToFilePath(t.audioPath) : null
        const recordedDate = macosTimestampToDate(t.timestamp)
        const sourceName = isBundleId(t.sourceIdentifier) ? getAppName(t.sourceIdentifier) : "Browser"
        const displayText = mode.getText(t)
        const altText = mode.getAltText(t)

        return (
          <List.Item
            key={t.id}
            title={truncateText(displayText, 50)}
            keywords={[t.text, t.rawText, sourceName]}
            accessories={[{ date: recordedDate }]}
            quickLook={
              hasAudio && audioPath ? { path: audioPath, name: `Recording - ${formatDate(recordedDate)}` } : undefined
            }
            detail={
              <List.Item.Detail
                markdown={displayText}
                metadata={
                  <List.Item.Detail.Metadata>
                    <List.Item.Detail.Metadata.Label title="Source" text={sourceName} />
                    <List.Item.Detail.Metadata.Label title="Duration" text={formatDuration(t.duration)} />
                    <List.Item.Detail.Metadata.Label title="Recorded" text={formatDate(recordedDate)} />
                    <List.Item.Detail.Metadata.Label title="Characters" text={String(displayText.length)} />
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
                  <Action.Paste title={mode.primaryTitle} content={displayText} />
                  <Action.Paste
                    title={mode.secondaryTitle}
                    content={altText}
                    shortcut={{ modifiers: ["cmd", "shift"], key: "enter" }}
                  />
                  <Action
                    title={mode.toggleTitle}
                    icon={Icon.Switch}
                    shortcut={{ modifiers: ["cmd"], key: "t" }}
                    onAction={toggleViewMode}
                  />
                  {hasAudio && audioPath && (
                    <Action.ToggleQuickLook title="Preview Audio" shortcut={{ modifiers: ["cmd"], key: "y" }} />
                  )}
                </ActionPanel.Section>
                <ActionPanel.Section>
                  <Action.CopyToClipboard
                    title={mode.copyPrimaryTitle}
                    content={displayText}
                    shortcut={{ modifiers: ["cmd"], key: "c" }}
                  />
                  <Action.CopyToClipboard
                    title={mode.copySecondaryTitle}
                    content={altText}
                    shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
                  />
                  {hasAudio && audioPath && (
                    <Action.ShowInFinder
                      title="Show Audio in Finder"
                      path={audioPath}
                      shortcut={{ modifiers: ["cmd", "shift"], key: "f" }}
                    />
                  )}
                </ActionPanel.Section>
              </ActionPanel>
            }
          />
        )
      })}
    </List>
  )
}

// Main component - handles sync before rendering TranscriptList
export default function Command() {
  const [status, setStatus] = useState<"loading" | "not_installed" | "ready" | "sync_failed">("loading")

  useEffect(() => {
    async function initSync() {
      // Check if Monologue is installed
      if (!(await historyFileExists())) {
        setStatus("not_installed")
        return
      }

      try {
        // Sync JSON to SQLite - this creates the database if it doesn't exist
        const result = await syncTranscripts()
        if (!result.success) {
          await showToast({ style: Toast.Style.Failure, title: "Sync failed", message: result.message })
        }
        setStatus("ready")
      } catch (error) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Failed to sync database",
          message: String(error),
        })
        // Check if database exists from previous sync
        try {
          await access(DATABASE_PATH, constants.R_OK)
          // DB exists, try to show the list with stale data
          setStatus("ready")
        } catch {
          // DB doesn't exist, can't render TranscriptList
          setStatus("sync_failed")
        }
      }
    }
    initSync()
  }, [])

  if (status === "loading") {
    return <List isLoading={true} searchBarPlaceholder="Loading transcripts..." />
  }

  if (status === "not_installed") {
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

  if (status === "sync_failed") {
    return (
      <List>
        <List.EmptyView
          title="Sync Failed"
          description="Failed to sync transcripts and no database exists from previous sync"
          actions={
            <ActionPanel>
              <Action title="Retry" onAction={() => setStatus("loading")} shortcut={{ modifiers: ["cmd"], key: "r" }} />
            </ActionPanel>
          }
        />
      </List>
    )
  }

  // Only render TranscriptList after sync is complete (database exists)
  return <TranscriptList />
}
