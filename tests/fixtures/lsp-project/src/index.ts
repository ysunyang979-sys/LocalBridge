import { add, subtract, Calculator } from "./math.js";
import { calculateTotal } from "./service.js";

export function main(): number {
  const calc = new Calculator();
  const sum = calc.add(1, 2);
  const diff = subtract(sum, 1);
  return calculateTotal([sum, diff]);
}

export { add, subtract, Calculator, calculateTotal };
