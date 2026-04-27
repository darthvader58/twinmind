export const nowMs = (): number => Date.now();

const clockFormatter = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
});

/** Returns e.g. `08:43:33 PM`. The `Intl` output uses lowercase periods on
 *  some runtimes; we normalize to uppercase to match the mockup. */
export const formatClock = (ms: number): string => {
  const raw = clockFormatter.format(new Date(ms));
  return raw.replace(/\s?(am|pm)$/i, (_m, p) => ` ${String(p).toUpperCase()}`);
};

const pad2 = (n: number): string => n.toString().padStart(2, '0');

/** YYYYMMDD-HHMMSS in local time, suitable for export filenames. */
export const formatStamp = (ms: number): string => {
  const d = new Date(ms);
  return (
    `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}` +
    `-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`
  );
};
