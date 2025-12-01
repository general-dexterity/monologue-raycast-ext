# Changelog

## [SQLite migration for large transcript files] - {PR_MERGE_DATE}

- Migrated transcript storage from JSON parsing to SQLite database
- Fixed JS heap crash when loading large transcript files (7.4MB+, ~2500 entries)
- Added Swift native extension for database sync
- Added "Refresh Database" command for manual rebuild
- Improved search using Raycast's built-in fuzzy matching

## [Initial release] - 2025-11-28

- Transcript history with search and app filtering
- Detail view with metadata (source, duration, recorded date)
- Quick Look audio preview
- Paste and copy actions for text and raw text
- Quick commands: Paste Last Transcript, Copy Last Transcript, Paste Last Raw Transcript
