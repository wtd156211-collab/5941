import { describe, expect, it } from 'vitest';
import { divide } from './math';

describe('math utilities', () => {
  it('divides positive numbers', () => {
    expect(divide(10, 2)).toBe(5);
  });

  it('divides by zero and throws', () => {
    expect(() => divide(1, 0)).toThrowError(/zero/i);
  });
});
