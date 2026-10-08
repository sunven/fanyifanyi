import type { TranslationEngine, TranslationKind, TranslationResult } from './translate'
import { invoke } from '@tauri-apps/api/core'
import { emitTo } from '@tauri-apps/api/event'

export interface TranslationRecord {
  id: string
  completedAt: number
  kind: TranslationKind
  sourceText: string
  translatedText: string
  engine: TranslationEngine
  favorite: boolean
}

export interface HistorySnapshot {
  enabled: boolean
  entries: TranslationRecord[]
}

export function loadHistory() {
  return invoke<HistorySnapshot>('history_get')
}

export async function recordTranslation(sourceText: string, kind: TranslationKind, result: TranslationResult) {
  if (!sourceText.trim() || !result.text.trim()) {
    return
  }
  await invoke<void>('history_record', {
    entry: {
      id: crypto.randomUUID(),
      completedAt: Date.now(),
      kind,
      sourceText,
      translatedText: result.text,
      engine: result.engine,
      favorite: false,
    } satisfies TranslationRecord,
  })
  await emitTo('main', 'translation-history-changed').catch(() => undefined)
}

export function setHistoryEnabled(enabled: boolean) {
  return invoke<HistorySnapshot>('history_set_enabled', { enabled })
}

export function setHistoryFavorite(id: string, favorite: boolean) {
  return invoke<HistorySnapshot>('history_set_favorite', { id, favorite })
}

export function deleteHistoryEntry(id: string) {
  return invoke<HistorySnapshot>('history_delete', { id })
}

export function clearHistory() {
  return invoke<HistorySnapshot>('history_clear')
}
