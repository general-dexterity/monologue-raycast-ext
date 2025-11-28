# Monologue Raycast Extension

Raycast extension for Monologue voice transcription app (macOS). Provides quick access to transcripts.

Docs: https://developers.raycast.com/
Monologue: https://www.monologue.to/

## Commands
```bash
nix-shell --run "npm run build"    # Build extension
nix-shell --run "npm run lint"     # Lint with Biome
nix-shell --run "npm run fix-lint" # Auto-fix lint issues
nix-shell --run "npm run dev"      # Development mode
```

## Architecture
- `src/lib/transcripts.ts` - Core data layer: reads/caches transcripts from Monologue's JSON file
- `src/lib/utils.ts` - Display helpers (app names, duration formatting)
- `src/lib/constants.ts` - File paths and macOS epoch offset
- `src/transcript-history.tsx` - Main UI: browsable list with detail panel
- `src/*.ts` - Quick action commands (paste/copy last transcript)

## Code Style
- TypeScript strict mode, ES2023 target
- Biome for linting/formatting (double quotes, trailing commas, 2-space indent, 120 char lines)
- Use Raycast API for clipboard, toast, UI components
- Error handling: custom `TranscriptError` class with error codes
- Imports: Raycast API first, then React/Node.js, then local modules
