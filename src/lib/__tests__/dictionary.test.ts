import { describe, expect, it } from 'vitest'
import { readDictionaryEntry } from '../dictionary'

const response = {
  ec: {
    exam_type: ['CET4'],
    word: [
      {
        usphone: 'ˈtest',
        wfs: [
          { wf: { name: '复数', value: 'tests' } },
          { wf: { name: '', value: 'skip' } },
          { wf: { value: 'missing-name' } },
        ],
        trs: [
          { tr: [{ l: { i: ['n. 测试'] } }] },
          { tr: [{ l: { i: ['没有空格'] } }] },
          { tr: [{ l: { i: [''] } }] },
          { tr: [{}] },
        ],
      },
    ],
  },
  phrs: {
    phrs: [
      {
        phr: {
          headword: { l: { i: 'test run' } },
          trs: [{ tr: { l: { i: '试跑' } } }],
        },
      },
      {
        phr: {
          headword: { l: {} },
          trs: [{ tr: { l: { i: '缺词' } } }],
        },
      },
      {
        phr: {
          headword: { l: { i: '缺译' } },
          trs: [{ tr: { l: {} } }],
        },
      },
    ],
  },
  syno: {
    synos: [
      {
        syno: {
          pos: 'n.',
          tran: '测试',
          ws: [{ w: 'exam' }, { w: '' }, {}],
        },
      },
      { syno: { pos: 'v.', tran: '空', ws: [] } },
    ],
  },
  rel_word: {
    rels: [
      {
        rel: {
          pos: 'n.',
          words: [
            { word: 'testing', tran: '测试过程' },
            { word: '', tran: '跳过' },
            { tran: '无词' },
            { word: 'tester', tran: '' },
          ],
        },
      },
      { rel: { pos: 'v.', words: [] } },
    ],
  },
}

describe('dictionary entry', () => {
  it('reads a Youdao response into one entry', () => {
    expect(readDictionaryEntry(response, 'test')).toEqual({
      headword: 'test',
      pronunciation: 'ˈtest',
      forms: [{ name: '复数', value: 'tests' }],
      senses: [
        { partOfSpeech: 'n.', meaning: '测试' },
        { partOfSpeech: '', meaning: '没有空格' },
      ],
      phrases: [{ phrase: 'test run', translation: '试跑' }],
      synonyms: [{ partOfSpeech: 'n.', translation: '测试', words: ['exam'] }],
      relatedWords: [{
        partOfSpeech: 'n.',
        words: [{ word: 'testing', translation: '测试过程' }],
      }],
    })
  })

  it('treats a missing headword entry as not found', () => {
    expect(readDictionaryEntry({}, 'test')).toBeNull()
    expect(readDictionaryEntry({ ec: { word: [] } }, 'test')).toBeNull()
    expect(readDictionaryEntry({ ec: { exam_type: ['CET4'] } }, 'test')).toBeNull()
  })

  it('keeps an entry when every optional row is missing', () => {
    expect(readDictionaryEntry({ ec: { word: [{}] } }, 'word')).toEqual({
      headword: 'word',
      pronunciation: '',
      forms: [],
      senses: [],
      phrases: [],
      synonyms: [],
      relatedWords: [],
    })
  })
})
