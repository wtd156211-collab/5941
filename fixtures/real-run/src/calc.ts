export function add(a: number, b: number): number {
  return a + b;
}

export function divide(a: number, b: number): number {
  if (b === 0) {
    throw new Error('除数不能为零');
  }
  return a / b;
}

export function factorial(n: number): number {
  if (n < 0) {
    throw new RangeError('阶乘不接受负数');
  }
  return n <= 1 ? 1 : n * factorial(n - 1);
}
