// Tiny classname joiner — falsy values are dropped. Deliberately not a dependency (clsx/cva):
// the brief asked for nothing heavier than a fetch wrapper and Context, and this one-liner is
// all the UI kit needs.
export function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}
