// ponytail: per-process memory, so it resets on restart and each replica counts on its own. Move
// it to a shared store (Postgres or Redis) or the platform's edge when the app runs more than one.
const windowMs = 10 * 60 * 1000;
const perWindow = 5;
const windows = new Map<string, { readonly start: number; count: number }>();

// Whether `key` may send another public submission now: five per ten minutes. The key is the
// visitor's address prefixed with the form's name, so each public form counts on its own.
export const takePublicSlot = (key: string, now = Date.now()): boolean => {
  for (const [stale, window] of windows) {
    if (now - window.start >= windowMs) windows.delete(stale);
  }
  const current = windows.get(key);
  if (!current) {
    windows.set(key, { start: now, count: 1 });
    return true;
  }
  if (current.count >= perWindow) return false;
  current.count += 1;
  return true;
};
