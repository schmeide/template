// Money is integer minor units (cents). Quantity is in thousandths and tax rate in basis points,
// so every product is exact in bigint and rounds once, half away from zero.

export type Amounts = {
  readonly quantity: number;
  readonly unitPrice: number;
  readonly taxRate: number;
};

export type Totals = { readonly subtotal: number; readonly tax: number; readonly total: number };

const divideRounded = (numerator: bigint, denominator: bigint): number => {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const away = 2n * (remainder < 0n ? -remainder : remainder) >= denominator;
  return Number(away ? quotient + (numerator < 0n ? -1n : 1n) : quotient);
};

export const lineAmounts = (line: Amounts): { readonly net: number; readonly tax: number } => {
  const net = divideRounded(BigInt(line.quantity) * BigInt(line.unitPrice), 1000n);
  return { net, tax: divideRounded(BigInt(net) * BigInt(line.taxRate), 10_000n) };
};

// Tax is rounded per line, then summed.
export const totals = (lines: readonly Amounts[]): Totals => {
  const amounts = lines.map(lineAmounts);
  const subtotal = amounts.reduce((sum, { net }) => sum + net, 0);
  const tax = amounts.reduce((sum, line) => sum + line.tax, 0);
  return { subtotal, tax, total: subtotal + tax };
};
