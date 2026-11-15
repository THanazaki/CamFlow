import { describe, expect, it } from 'vitest'

import { groupByKanaRow, kanaRowOf } from '../kana-row'

describe('kanaRowOf', () => {
  it('読みの先頭文字で行を決める', () => {
    expect(kanaRowOf('山田', 'やまだ')).toBe('や')
    expect(kanaRowOf('山田', 'ヤマダ')).toBe('や')
    expect(kanaRowOf('佐藤', 'さとう')).toBe('さ')
    expect(kanaRowOf('伊藤', 'いとう')).toBe('あ')
    expect(kanaRowOf('渡辺', 'わたなべ')).toBe('わ')
    expect(kanaRowOf('石井', 'んー')).toBe('わ')
  })
  it('濁音・半濁音・小書き文字は清音の行に入る', () => {
    expect(kanaRowOf('x', 'がく')).toBe('か')
    expect(kanaRowOf('x', 'ぱん')).toBe('は')
    expect(kanaRowOf('x', 'ヴィ')).toBe('あ')
    expect(kanaRowOf('x', 'ゃ')).toBe('や')
    expect(kanaRowOf('x', 'ﾊﾟｰ')).toBe('は')
  })
  it('読みが無ければ名前を見る。漢字・英数字は「他」', () => {
    expect(kanaRowOf('あおい')).toBe('あ')
    expect(kanaRowOf('山田')).toBe('他')
    expect(kanaRowOf('Mika', null)).toBe('他')
    expect(kanaRowOf('', '')).toBe('他')
  })
})

describe('groupByKanaRow', () => {
  it('空の行を除き、あ〜わ・他の順に並べる', () => {
    const rows = [
      { n: '他', r: '他' as const },
      { n: 'わ', r: 'わ' as const },
      { n: 'あ1', r: 'あ' as const },
      { n: 'あ2', r: 'あ' as const },
    ]
    const g = groupByKanaRow(rows, (x) => x.r)
    expect(g.map((x) => x.row)).toEqual(['あ', 'わ', '他'])
    expect(g[0].items.map((x) => x.n)).toEqual(['あ1', 'あ2'])
  })
})
