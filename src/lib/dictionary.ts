export interface DictionaryForm {
  name: string
  value: string
}

export interface DictionarySense {
  partOfSpeech: string
  meaning: string
}

export interface DictionaryPhrase {
  phrase: string
  translation: string
}

export interface DictionarySynonym {
  partOfSpeech: string
  translation: string
  words: string[]
}

export interface DictionaryRelatedWord {
  word: string
  translation: string
}

export interface DictionaryRelated {
  partOfSpeech: string
  words: DictionaryRelatedWord[]
}

export interface DictionaryEntry {
  headword: string
  pronunciation: string
  forms: DictionaryForm[]
  senses: DictionarySense[]
  phrases: DictionaryPhrase[]
  synonyms: DictionarySynonym[]
  relatedWords: DictionaryRelated[]
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function text(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') {
    return null
  }
  return value
}

function readForms(word: Record<string, unknown>): DictionaryForm[] {
  return asArray(word.wfs).flatMap((item) => {
    const form = asRecord(asRecord(item)?.wf)
    const name = text(form?.name)
    const value = text(form?.value)
    if (!name || !value) {
      return []
    }
    return [{ name, value }]
  })
}

function readSenses(word: Record<string, unknown>): DictionarySense[] {
  return asArray(word.trs).flatMap((item) => {
    const sense = asRecord(item)
    const meaning = text(sense?.tran)
    if (!meaning) {
      return []
    }
    return [{ partOfSpeech: text(sense?.pos) ?? '', meaning }]
  })
}

function readPhrases(response: Record<string, unknown>): DictionaryPhrase[] {
  const phrs = asRecord(response.phrs)
  return asArray(phrs?.phrs).flatMap((item) => {
    const phrase = asRecord(item)
    const headword = text(phrase?.headword)
    const translation = text(phrase?.translation)
    if (!headword || !translation) {
      return []
    }
    return [{ phrase: headword, translation }]
  })
}

function readSynonyms(response: Record<string, unknown>): DictionarySynonym[] {
  const syno = asRecord(response.syno)
  return asArray(syno?.synos).flatMap((item) => {
    const group = asRecord(item)
    const words = asArray(group?.ws).flatMap((word) => {
      const value = text(word)
      return value ? [value] : []
    })
    if (!group || words.length === 0) {
      return []
    }
    return [{
      partOfSpeech: text(group.pos) ?? '',
      translation: text(group.tran) ?? '',
      words,
    }]
  })
}

function readRelatedWords(response: Record<string, unknown>): DictionaryRelated[] {
  const related = asRecord(response.rel_word)
  return asArray(related?.rels).flatMap((item) => {
    const group = asRecord(asRecord(item)?.rel)
    const words = asArray(group?.words).flatMap((word) => {
      const record = asRecord(word)
      const value = text(record?.word)
      const translation = text(record?.tran)
      if (!value || !translation) {
        return []
      }
      return [{ word: value, translation }]
    })
    if (!group || words.length === 0) {
      return []
    }
    return [{
      partOfSpeech: text(group.pos) ?? '',
      words,
    }]
  })
}

export function readDictionaryEntry(response: unknown, headword: string): DictionaryEntry | null {
  const record = asRecord(response)
  const word = asRecord(asRecord(record?.ec)?.word)
  if (!record || !word) {
    return null
  }

  return {
    headword,
    pronunciation: text(word.usphone) ?? '',
    forms: readForms(word),
    senses: readSenses(word),
    phrases: readPhrases(record),
    synonyms: readSynonyms(record),
    relatedWords: readRelatedWords(record),
  }
}
