import { add } from "./math.js";

/**
 * Calculates total of an array of numbers.
 */
export function calculateTotal(items: number[]): number {
  let total = 0;
  for (const item of items) {
    total = add(total, item);
  }
  return total;
}
