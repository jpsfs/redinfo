import { chunk } from './chunk';

describe('chunk', () => {
  it('splits evenly', () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });

  it('leaves a smaller final chunk', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('a size larger than the input is one chunk', () => {
    expect(chunk([1, 2], 10)).toEqual([[1, 2]]);
  });

  it('an empty input is no chunks', () => {
    expect(chunk([], 5)).toEqual([]);
  });

  it('rejects a non-positive size', () => {
    expect(() => chunk([1], 0)).toThrow();
    expect(() => chunk([1], -1)).toThrow();
  });
});
