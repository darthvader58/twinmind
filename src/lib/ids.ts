let counter = 0;

/**
 * Short, collision-resistant-enough id for in-session use only.
 * Combines 8 chars of base36 randomness with a 4-char monotonic counter
 * so that ids generated within the same millisecond still order stably.
 */
export const newId = (prefix?: string): string => {
  const rand = Math.random().toString(36).slice(2, 10).padEnd(8, '0');
  const seq = (counter++).toString(36).padStart(4, '0').slice(-4);
  const body = `${rand}${seq}`;
  return prefix ? `${prefix}_${body}` : body;
};
