/**
 * Adds two numbers together.
 */
export function add(a: number, b: number): number {
  return a + b;
}

/**
 * Subtracts second number from first.
 */
export function subtract(a: number, b: number): number {
  return a - b;
}

export class Calculator {
  add(a: number, b: number): number {
    return add(a, b);
  }
}
