/**
 * Numeric grounding check (spec 9.6): every number in the answer should come from data the request actually saw —
 * tool results, the user's own messages or the current date/time in the system prompt. v1 only warns, never blocks.
 */
export interface NumericCheck {
  status: 'PASS' | 'WARN' | 'NOT_APPLICABLE';
  unmatchedCount: number;
}

const NUMBER = /\d+(?:[.,]\d+)*/g;

/** All plausible readings of a number token: "1.284" may be 1284 (vi) or 1.284 (en); "12,5" is 12.5. */
function readings(token: string): number[] {
  const values = new Set<number>();
  const plain = Number(token);
  if (Number.isFinite(plain)) values.add(plain);
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(token)) values.add(Number(token.replace(/\./g, '').replace(',', '.')));
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(token)) values.add(Number(token.replace(/,/g, '')));
  if (/^\d+,\d+$/.test(token)) values.add(Number(token.replace(',', '.')));
  return [...values].filter(Number.isFinite);
}

function key(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** Collects every number in a tool result, including numbers inside strings (dates, times, titles such as "Q3"). */
function collect(value: unknown, into: Set<string>): void {
  if (typeof value === 'number' && Number.isFinite(value)) {
    for (const decimals of [0, 1, 2]) into.add(key(Number(value.toFixed(decimals))));
    into.add(key(value));
    into.add(key(Math.abs(value)));
  } else if (typeof value === 'string') {
    for (const token of value.match(NUMBER) ?? []) for (const reading of readings(token)) collect(reading, into);
  } else if (Array.isArray(value)) {
    for (const item of value) collect(item, into);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collect(item, into);
  }
}

export function numericCheck(answer: string, toolResults: string[], context: string[]): NumericCheck {
  const known = new Set<string>();
  for (const result of toolResults) {
    try {
      collect(JSON.parse(result), known);
    } catch {
      collect(result, known);
    }
  }
  for (const text of context) collect(text, known);

  // Ignore list numbering ("1. ", "2) ") and digits glued to letters (codes like "Q3", "DEMO-EMP-001" are checked as text).
  const text = answer.replace(/^\s*\d+[.)]\s+/gm, ' ').replace(/[A-Za-zÀ-ỹ]+[-_]?\d+[\w-]*/g, ' ');
  const tokens = text.match(NUMBER) ?? [];
  if (!tokens.length) return { status: 'NOT_APPLICABLE', unmatchedCount: 0 };
  const unmatched = tokens.filter((token) => !readings(token).some((value) => known.has(key(value))));
  return { status: unmatched.length ? 'WARN' : 'PASS', unmatchedCount: unmatched.length };
}
