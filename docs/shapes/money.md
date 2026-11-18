# Money

Exact amounts and line totals, for shapes that price things. It has no tables and no page: nobody keeps it on its
own, and `make shape/keep` refuses to. It comes with the shapes that require it (`invoices` and `orders`).

## What it has

- **Units**: amounts are integers. Money is in minor units (cents), quantity in thousandths, tax rate in basis points
  (`2000` is 20%).
- **`lineAmounts`** and **`totals`** (`backend/src/services/money.ts`): a line's amount and its tax are each rounded
  once, half away from zero, in `bigint`. Tax is rounded per line before it is summed.
- **`parseScaled`**, **`formatScaled`**, **`formatMoney`** and **`currencyDigits`** (`frontend/src/money/money.ts`)
  turn those integers into the decimal text people read and type, and back, with no floating point.

## Limits

- `parseScaled` takes `.` as the only decimal separator.
- Each shape that uses it keeps its own tables for lines; only these pure functions are shared.
