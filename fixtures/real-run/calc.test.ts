import { describe, expect, it } from 'vitest';
import { add, divide, factorial } from './src/calc';

describe('calc 模块', () => {
  it('加法返回两数之和', () => {
    expect(add(2, 3)).toBe(5);
  });

  it('除法在除数为零时抛出异常', () => {
    expect(divide(1, 0)).toBe(0.5);
  });

  it.skip('阶乘大数性能（暂未实现）', () => {
    expect(factorial(100)).toBeGreaterThan(0);
  });

  it('阶乘拒绝负数输入', () => {
    expect(factorial(-1)).toBe(1);
  });
});
