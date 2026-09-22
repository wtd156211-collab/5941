import { describe, expect, it } from 'vitest';
import { upper } from './strings';

describe('strings', () => {
  it('uppercases ascii', () => {
    expect(upper('abc')).toBe('ABC');
  });

  it.skip('unicode case folding is not supported yet', () => {
    expect(upper('ä')).toBe('Ä');
  });
});
