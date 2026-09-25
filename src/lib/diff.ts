/** Word-level diff used for before/after display and for protected-change checks. */

export type DiffOp = { type: "equal" | "removed" | "added"; text: string };

/** Words (letters/digits, with inner apostrophes, hyphens, decimal points), whitespace runs, or single punctuation. */
export function tokenize(text: string): string[] {
  return text.match(/[\p{L}\p{N}]+(?:['’.\-][\p{L}\p{N}]+)*|\s+|[^\s\p{L}\p{N}]/gu) ?? [];
}

export function wordDiff(before: string, after: string): DiffOp[] {
  const a = tokenize(before);
  const b = tokenize(after);
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const ops: DiffOp[] = [];
  const push = (type: DiffOp["type"], text: string) => {
    const last = ops[ops.length - 1];
    if (last && last.type === type) last.text += text;
    else ops.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push("equal", a[i]);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      push("removed", a[i++]);
    } else {
      push("added", b[j++]);
    }
  }
  while (i < n) push("removed", a[i++]);
  while (j < m) push("added", b[j++]);
  return ops;
}

/** Lower-cased word tokens (no whitespace or punctuation). */
export function words(text: string): string[] {
  return tokenize(text)
    .filter((t) => /[\p{L}\p{N}]/u.test(t))
    .map((t) => t.toLowerCase());
}

/** Words removed and added between two strings (multiset difference). */
export function changedWords(before: string, after: string): { removed: string[]; added: string[] } {
  const a = words(before);
  const b = words(after);
  const removed: string[] = [];
  const pool = [...b];
  for (const w of a) {
    const k = pool.indexOf(w);
    if (k === -1) removed.push(w);
    else pool.splice(k, 1);
  }
  const pool2 = [...a];
  const added: string[] = [];
  for (const w of b) {
    const k = pool2.indexOf(w);
    if (k === -1) added.push(w);
    else pool2.splice(k, 1);
  }
  return { removed, added };
}

/** Damerau–Levenshtein (optimal string alignment) distance. */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}
