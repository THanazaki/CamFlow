/** 50音の行（マスタ一覧のタブ分けに使う） */
export const KANA_ROWS = ['あ', 'か', 'さ', 'た', 'な', 'は', 'ま', 'や', 'ら', 'わ'] as const
/** 読みが無い漢字名や英数字など、どの行にも入らないもの */
export const OTHER_ROW = '他'
export type KanaRow = (typeof KANA_ROWS)[number] | typeof OTHER_ROW

const ROW_CHARS: Record<(typeof KANA_ROWS)[number], string> = {
  あ: 'あいうえおぁぃぅぇぉゔ',
  か: 'かきくけこゕゖ',
  さ: 'さしすせそ',
  た: 'たちつてとっ',
  な: 'なにぬねの',
  は: 'はひふへほ',
  ま: 'まみむめも',
  や: 'やゆよゃゅょ',
  ら: 'らりるれろ',
  わ: 'わゐゑをんゎ',
}

/**
 * 読み（無ければ名前）の先頭文字から、50音のどの行かを返す。
 * カタカナ・濁音・半濁音・小書き文字は、ひらがなの清音の行に入れる。
 */
export function kanaRowOf(name: string, kana?: string | null): KanaRow {
  const source = (kana?.trim() || name.trim()).normalize('NFKC')
  const first = [...source][0]
  if (!first) return OTHER_ROW
  // カタカナ → ひらがな
  const code = first.codePointAt(0)!
  const hira = code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : first
  // 濁点・半濁点を外す（が → か）
  const base = hira.normalize('NFD')[0]
  for (const row of KANA_ROWS) {
    if (ROW_CHARS[row].includes(base)) return row
  }
  return OTHER_ROW
}

/** 行ごとの件数。件数が0の行は含めない。並びは あ〜わ、他。 */
export function groupByKanaRow<T>(
  rows: T[],
  rowOf: (row: T) => KanaRow,
): { row: KanaRow; items: T[] }[] {
  const map = new Map<KanaRow, T[]>()
  for (const r of rows) {
    const k = rowOf(r)
    map.set(k, [...(map.get(k) ?? []), r])
  }
  const order: KanaRow[] = [...KANA_ROWS, OTHER_ROW]
  return order.flatMap((row) =>
    map.has(row) ? [{ row, items: map.get(row)! }] : [],
  )
}
