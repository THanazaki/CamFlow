export interface Ranked<T> {
  /** 順位。同じ件数は同順位で、次は飛ばす（1, 2, 2, 4） */
  rank: number
  item: T
}

/** 件数の多い順にランキングを作る。0件は載せない。同数は名前の五十音順 */
export function rankBy<T extends { name: string }>(
  items: T[],
  count: (item: T) => number,
  limit = 20,
): Ranked<T>[] {
  const sorted = items
    .filter((i) => count(i) > 0)
    .sort((a, b) => count(b) - count(a) || a.name.localeCompare(b.name, 'ja'))
  let rank = 0
  const ranked = sorted.map((item, i) => {
    if (i === 0 || count(item) !== count(sorted[i - 1])) rank = i + 1
    return { rank, item }
  })
  // 20位タイなどは打ち切らず、最後の順位に並ぶものまで出す
  const cut = ranked[limit - 1]
  return cut ? ranked.filter((r) => r.rank <= cut.rank) : ranked
}
