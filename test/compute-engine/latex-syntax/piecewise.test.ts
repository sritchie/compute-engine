import { parse } from '../../utils';

describe('CASES/PIECEWISE', () => {
  test('Valid forms', () => {
    expect(
      parse(`\\begin{cases}
      0 & n =  0\\\\
      1 & n =  1\\\\
      n \\geq 2  & n^2+1 \\end{cases}`)
    ).toMatchInlineSnapshot(`
      [
        "Piecewise",
        [
          "List",
          ["Pair", ["Equal", "n", 0], 0],
          ["Pair", ["Equal", "n", 1], 1],
          ["Pair", ["Add", ["Power", "n", 2], 1], ["GreaterEqual", "n", 2]]
        ]
      ]
    `);
  });
});
