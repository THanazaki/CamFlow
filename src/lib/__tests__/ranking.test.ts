import { describe, expect, it } from 'vitest'

import { rankBy } from '../ranking'

const r = (rows: [string, number][], limit?: number) =>
  rankBy(
    rows.map(([name, n]) => ({ name, n })),
    (x) => x.n,
    limit,
  ).map((x) => [x.rank, x.item.name])

describe('rankBy', () => {
  it('多い順。同数は同順位で次を飛ばし、0件は載せない', () => {
    expect(
      r([
        ['b', 2],
        ['a', 2],
        ['c', 5],
        ['d', 0],
        ['e', 1],
      ]),
    ).toEqual([
      [1, 'c'],
      [2, 'a'],
      [2, 'b'],
      [4, 'e'],
    ])
  })
  it('上限の順位に同数のものがいれば、そこまで出す', () => {
    expect(
      r(
        [
          ['a', 3],
          ['b', 2],
          ['c', 2],
          ['d', 1],
        ],
        2,
      ),
    ).toEqual([
      [1, 'a'],
      [2, 'b'],
      [2, 'c'],
    ])
  })
  it('空なら空', () => {
    expect(r([])).toEqual([])
  })
})
