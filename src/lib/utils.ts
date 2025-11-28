// Map bundle IDs to friendly app names
const APP_NAMES: Record<string, string> = {
  "com.mitchellh.ghostty": "Ghostty",
  "com.apple.Safari": "Safari",
  "com.google.Chrome": "Chrome",
  "com.microsoft.VSCode": "VS Code",
  "com.apple.dt.Xcode": "Xcode",
  "com.apple.Terminal": "Terminal",
  "com.googlecode.iterm2": "iTerm",
  "com.apple.finder": "Finder",
  "com.apple.mail": "Mail",
  "com.apple.Notes": "Notes",
  "com.apple.iWork.Pages": "Pages",
  "com.slack.Slack": "Slack",
  "com.tinyspeck.slackmacgap": "Slack",
  "com.brave.Browser": "Brave",
  "org.mozilla.firefox": "Firefox",
  "com.figma.Desktop": "Figma",
  "notion.id": "Notion",
  "com.linear": "Linear",
  "md.obsidian": "Obsidian",
}

export function getAppName(bundleId: string): string {
  if (!bundleId) return "Unknown"
  return APP_NAMES[bundleId] || bundleId.split(".").pop() || bundleId
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
}

export function truncateText(text: string, maxLength: number): string {
  if (!text) return ""
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 1) + "…"
}
