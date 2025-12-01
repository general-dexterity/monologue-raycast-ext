import { forceSync } from "swift:../swift"
import { closeMainWindow, showHUD } from "@raycast/api"

export default async function Command() {
  try {
    const result = await forceSync()
    if (result.success) {
      await showHUD(`✓ ${result.message}`)
    } else {
      await showHUD(`✗ ${result.message}`)
    }
    await closeMainWindow()
  } catch (error) {
    await showHUD(`✗ Failed: ${String(error)}`)
  }
}
