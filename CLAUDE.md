# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**fanyifanyi** (翻译翻译) is a desktop translation and dictionary application built with Tauri v2 + React + TypeScript. It provides AI-powered translation (using OpenAI-compatible APIs) and dictionary lookups (via Youdao Dictionary API).

## Development Commands

### Running the Application

```bash
pnpm dev          # Start Vite dev server + Tauri window
pnpm tauri dev    # Alternative way to start development mode
```

### Building

```bash
pnpm build        # TypeScript compilation + Vite build
pnpm tauri build  # Build production desktop application
```

### Code Quality

```bash
npx eslint .      # Run linter (antfu config)
```

### Preview

```bash
pnpm preview      # Preview production build locally
```

## Architecture Overview

### Frontend-Backend Communication

This is a **Tauri IPC application** where:

- **Frontend**: React calls Rust backend using `invoke('command_name', { args })`
- **Backend**: Rust functions marked with `#[tauri::command]` handle requests
- **Security**: Permissions configured in `src-tauri/capabilities/default.json`

Example:

```typescript
// Frontend (TypeScript)
import { invoke } from '@tauri-apps/api/core'
const data = await invoke<any>('get_dict_data', { q: 'hello' })

// Backend (Rust) - src-tauri/src/lib.rs
#[tauri::command]
async fn get_dict_data(q: String) -> Result<serde_json::Value, String>
```

### Two Core Features

1. **Dictionary Mode** (Backend-handled)
   - User input → Tauri command `get_dict_data` → Rust HTTP request to Youdao API → Display results
   - Implementation: `src-tauri/src/lib.rs` (backend) + `src/components/dictionary-display/` (frontend)

2. **Translation Mode** (Frontend-handled)
   - User input → OpenAI API call (direct from browser) → Display translation
   - Implementation: `src/lib/ai.ts` + `src/components/translate-display/`
   - Uses OpenAI SDK with `dangerouslyAllowBrowser: true`

### Multi-Model AI Configuration

The app supports multiple AI providers (OpenAI, DeepSeek, etc.):

- **Storage**: localStorage with key `ai_configs`
- **Structure**: Array of models + active model ID
- **Management**: `src/lib/config.ts` provides CRUD operations
- **UI**: Settings page (`src/pages/Settings.tsx`) for user configuration
- **Defaults**: DeepSeek V3 (via Volces) and GPT-4o Mini

## Key Directories

- `src/pages/` - Main application pages (Home, Settings)
- `src/components/dictionary-display/` - Dictionary feature components (word header, definitions, phrases, synonyms, related words)
- `src/components/translate-display/` - AI translation component
- `src/components/ui/` - shadcn/ui base components (buttons, cards, dialogs, etc.)
- `src/lib/` - Core utilities (AI integration, config management, utils)
- `src-tauri/src/` - Rust backend code
- `src-tauri/capabilities/` - Tauri security permissions

## Important Technical Details

### Debouncing Pattern

All API calls are debounced (1000ms) to prevent excessive requests:

```typescript
import { useDebounce } from 'react-use'

useDebounce(getDictData, 1000, [q])
```

### Tauri Configuration

- **Window Size**: Fixed 400×600px (non-maximizable)
- **Dev Port**: 1420 (Vite), 1421 (HMR WebSocket)
- **CSP**: Disabled (`null`) to allow OpenAI API calls from browser
- **Plugins**: `tauri-plugin-opener`, `tauri-plugin-http`

### Adding New Tauri Commands

1. Define function in `src-tauri/src/lib.rs` with `#[tauri::command]`
2. Add to `invoke_handler![]` macro in `run()` function
3. Call from frontend using `invoke('command_name', { args })`
4. Update permissions in `src-tauri/capabilities/default.json` if needed

### Styling

- **Framework**: Tailwind CSS v4 with CSS variables
- **Components**: shadcn/ui with "new-york" style variant
- **Theme**: Defined in `src/index.css` using OKLCH color space
- **Dark Mode**: Supported via `:is(.dark *)` custom variant
- **Utilities**: `clsx` + `tailwind-merge` via `cn()` helper in `src/lib/utils.ts`

### Build Error Note

If you encounter build errors, see: <https://github.com/tauri-apps/tauri/issues/7338#issuecomment-2933086418>

## Path Aliases

TypeScript and Vite both use `@/*` → `./src/*` mapping. Always use `@/` imports for src files:

```typescript
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
```

## API Integration

### Dictionary API (Rust Backend)

- **Endpoint**: `dict.youdao.com/jsonapi`
- **Parameters**: `q` (search term), `dicts` (feature flags JSON)
- **Implementation**: `get_dict_data` command in `src-tauri/src/lib.rs`
- **Features**: Definitions, phrases, synonyms, related words, word forms

### Translation API (Frontend)

- **Library**: `openai` npm package
- **Configuration**: Multi-model support via `src/lib/config.ts`
- **System Prompt**: Professional CN↔EN translator, preserves formatting, no explanations
- **Implementation**: `translate()` function in `src/lib/ai.ts`

## UI Component Patterns

### Dictionary Display Components

Each tab has its own component with consistent structure:

- `word-header.tsx` - Title + pronunciation
- `word-forms.tsx` - Grammatical forms
- `word-definitions.tsx` - Meanings by part of speech
- `phrases-tab.tsx` - Common phrases
- `synonyms-tab.tsx` - Grouped by part of speech
- `related-wordsTab.tsx` - Similar vocabulary

### State Management

No global state library. Uses React hooks:

- `useState` for local state
- `useDebounce` from `react-use` for API call debouncing
- localStorage for persistent config (AI models)

## Testing

Currently no test suite configured. When adding tests, follow these patterns:

- Unit tests for `src/lib/` utilities (ai.ts, config.ts)
- Integration tests for Tauri commands
- Component tests for UI components

## Common Development Tasks

### Adding a New AI Model Provider

1. User adds via Settings page UI
2. Config stored in localStorage via `addAIConfig()` in `src/lib/config.ts`
3. Switch active model using `setActiveModel()`
4. Translation automatically uses new active model

### Modifying Dictionary Display

1. Components in `src/components/dictionary-display/`
2. Data structure defined by Youdao API response
3. Each tab component handles its own section of the API response

### Changing Window Size

Edit `src-tauri/tauri.conf.json`:

```json
"windows": [{
  "width": 400,
  "height": 600
}]
```
