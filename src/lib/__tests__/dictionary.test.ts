import { describe, expect, it } from 'vitest'
import response from '@/lib/__tests__/fixtures/youdao-v4-good.json'
import { readDictionaryEntry } from '@/lib/dictionary'

describe('dictionary entry', () => {
  it('reads a Youdao V4 response into one entry', () => {
    // Trimmed from Easydict's good_v4.json at cfda6e2f43741a3210a290e422846f1d83742d38.
    expect(readDictionaryEntry(response, 'good')).toEqual({
      headword: 'good',
      pronunciation: 'ɡʊd',
      forms: [
        { name: '复数', value: 'goods' },
        { name: '比较级', value: 'better' },
        { name: '最高级', value: 'best' },
      ],
      senses: [{
        partOfSpeech: 'n.',
        meaning: '善，正义；好事；商品，所有物；<英>（运载的）货物（goods）；优势，利益；<非正式>真货，正品（the goods）；好人，有道德的人（the good）',
      }],
      phrases: [
        { phrase: 'good at', translation: '善于' },
        { phrase: 'good and', translation: '完全，非常' },
      ],
      synonyms: [
        { partOfSpeech: 'adj.', translation: '好的；优良的；愉快的；虔诚的', words: ['fine', 'Ok', 'great', 'religious', 'bright'] },
        { partOfSpeech: 'n.', translation: '好处；善行；慷慨的行为', words: ['benefit', 'plus', 'mercy'] },
      ],
      relatedWords: [{
        partOfSpeech: 'adj.',
        words: [
          { word: 'goody', translation: '感伤的；伪善的；假正经的' },
          { word: 'goodly', translation: '漂亮的；优秀的；相当多的' },
          { word: 'goodish', translation: '相当好的；颇的' },
        ],
      }],
    })
  })

  it('treats a missing headword entry as not found', () => {
    expect(readDictionaryEntry({}, 'test')).toBeNull()
    expect(readDictionaryEntry({ ec: { word: null } }, 'test')).toBeNull()
    expect(readDictionaryEntry({ ec: { exam_type: ['CET4'] } }, 'test')).toBeNull()
  })

  it.each([
    null,
    undefined,
    42,
    'invalid',
    [],
    { ec: [] },
    { ec: { word: [] } },
    { ec: { word: 42 } },
  ])('treats a malformed response %j as not found', (invalidResponse) => {
    expect(readDictionaryEntry(invalidResponse, 'test')).toBeNull()
  })

  it('keeps an entry when every optional row is missing', () => {
    expect(readDictionaryEntry({ ec: { word: {} } }, 'word')).toEqual({
      headword: 'word',
      pronunciation: '',
      forms: [],
      senses: [],
      phrases: [],
      synonyms: [],
      relatedWords: [],
    })
  })

  it('ignores optional fields with incorrect types', () => {
    expect(readDictionaryEntry({
      ec: { word: { usphone: 42, wfs: {}, trs: 'invalid' } },
      phrs: { phrs: {} },
      syno: { synos: 'invalid' },
      rel_word: { rels: 42 },
    }, 'word')).toEqual({
      headword: 'word',
      pronunciation: '',
      forms: [],
      senses: [],
      phrases: [],
      synonyms: [],
      relatedWords: [],
    })
  })

  it('skips incomplete rows while keeping the valid dictionary content', () => {
    expect(readDictionaryEntry({
      ec: {
        word: {
          wfs: [
            { wf: { name: '复数', value: 'tests' } },
            { wf: { name: '', value: 'skip' } },
            { wf: { value: 'missing-name' } },
            { wf: { name: 'bad-type', value: 42 } },
            null,
          ],
          trs: [
            { pos: 'n.', tran: '测试' },
            { pos: 'v.', tran: '   ' },
            { pos: 'v.', tran: 42 },
            { pos: 'v.' },
            null,
          ],
        },
      },
      phrs: {
        phrs: [
          { headword: 'test run', translation: '试跑' },
          { headword: '', translation: '缺词' },
          { translation: '缺词' },
          { headword: '缺译' },
          { headword: 'bad type', translation: 42 },
          null,
        ],
      },
      syno: {
        synos: [
          { pos: 'n.', tran: '测试', ws: ['exam', '', '   ', {}, null, 42] },
          { pos: 'v.', tran: '空', ws: [] },
          null,
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
                { word: 'bad type', tran: 42 },
                null,
              ],
            },
          },
          { rel: { pos: 'v.', words: [] } },
          null,
        ],
      },
    }, 'test')).toEqual({
      headword: 'test',
      pronunciation: '',
      forms: [{ name: '复数', value: 'tests' }],
      senses: [{ partOfSpeech: 'n.', meaning: '测试' }],
      phrases: [{ phrase: 'test run', translation: '试跑' }],
      synonyms: [{ partOfSpeech: 'n.', translation: '测试', words: ['exam'] }],
      relatedWords: [{
        partOfSpeech: 'n.',
        words: [{ word: 'testing', translation: '测试过程' }],
      }],
    })
  })

  it('preserves the whole meaning when a sense has no part of speech', () => {
    const entry = readDictionaryEntry({
      ec: { word: { trs: [{ tran: '没有空格' }, { tran: 'words with spaces' }] } },
    }, 'word')

    expect(entry?.senses).toEqual([
      { partOfSpeech: '', meaning: '没有空格' },
      { partOfSpeech: '', meaning: 'words with spaces' },
    ])
  })
})
