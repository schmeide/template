import { useSyncExternalStore } from "react";

// The cart lives in the browser and holds only product ids and counts. The server prices the order
// from its own records, so nothing here is trusted.
export type CartLine = { readonly productId: number; readonly quantity: number };

export const maxQuantity = 999;
const key = "orders-cart";
const listeners = new Set<() => void>();
// Used when the browser refuses storage (a private window, blocked site data).
let unsaved: string | null = null;
let snapshot: { readonly raw: string | null; readonly lines: readonly CartLine[] } = {
  raw: null,
  lines: [],
};

const stored = (): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return unsaved;
  }
};

const isLine = (value: unknown): value is CartLine => {
  const line = value as Partial<CartLine> | null;
  return (
    Number.isInteger(line?.productId) &&
    Number.isInteger(line?.quantity) &&
    (line?.quantity ?? 0) >= 1 &&
    (line?.quantity ?? 0) <= maxQuantity
  );
};

const parse = (raw: string | null): readonly CartLine[] => {
  try {
    const value: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(value) ? value.filter(isLine) : [];
  } catch {
    return [];
  }
};

const read = (): readonly CartLine[] => {
  const raw = stored();
  if (raw !== snapshot.raw) snapshot = { raw, lines: parse(raw) };
  return snapshot.lines;
};

const write = (lines: readonly CartLine[]) => {
  const raw = JSON.stringify(lines);
  try {
    window.localStorage.setItem(key, raw);
  } catch {
    unsaved = raw;
  }
  for (const listener of listeners) listener();
};

const subscribe = (onChange: () => void) => {
  listeners.add(onChange);
  // Another tab changed the cart.
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
};

export const useCart = (): readonly CartLine[] => useSyncExternalStore(subscribe, read);

const clamp = (quantity: number) => Math.min(Math.max(Math.trunc(quantity), 0), maxQuantity);

export const addToCart = (productId: number, quantity: number) => {
  const lines = read();
  const current = lines.find((line) => line.productId === productId)?.quantity ?? 0;
  setQuantity(productId, current + quantity);
};

// A quantity of zero removes the line.
export const setQuantity = (productId: number, quantity: number) => {
  const lines = read();
  const next = clamp(quantity);
  const exists = lines.some((line) => line.productId === productId);
  write(
    next === 0
      ? lines.filter((line) => line.productId !== productId)
      : exists
        ? lines.map((line) => (line.productId === productId ? { productId, quantity: next } : line))
        : [...lines, { productId, quantity: next }]
  );
};

export const clearCart = () => write([]);
