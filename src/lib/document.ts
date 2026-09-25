/**
 * In-memory manuscript model with stable block IDs, revisions and exact,
 * offset-anchored edits. No global string replacement; no innerHTML.
 */
import { BLOCKS, type BlockDef } from "./manuscript";

export interface Block extends BlockDef {
  /** Bumped on every change to this block's text. */
  revision: number;
  /**
   * Bumped only when a person rewrites the block freely ("Edit passage").
   * Jev results requested under an older epoch are stale.
   */
  editEpoch: number;
}

export interface DocState {
  blocks: Record<string, Block>;
  order: string[];
  /** Bumped on every change anywhere in the document. */
  revision: number;
}

export interface Anchor {
  blockId: string;
  start: number;
  end: number;
}

export function createDoc(defs: BlockDef[] = BLOCKS): DocState {
  const blocks: Record<string, Block> = {};
  for (const d of defs) blocks[d.id] = { ...d, revision: 0, editEpoch: 0 };
  return { blocks, order: defs.map((d) => d.id), revision: 0 };
}

/** Offset of the nth occurrence of `needle` in `haystack`, or -1. */
export function findOccurrence(haystack: string, needle: string, occurrence: number): number {
  if (!needle) return -1;
  let from = 0;
  for (let i = 0; ; i++) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return -1;
    if (i === occurrence) return at;
    from = at + 1;
  }
}

export function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let n = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return n;
    n++;
    from = at + 1;
  }
}

export function textAt(doc: DocState, anchor: Anchor): string | null {
  const block = doc.blocks[anchor.blockId];
  if (!block) return null;
  if (anchor.start < 0 || anchor.end > block.text.length || anchor.start > anchor.end) return null;
  return block.text.slice(anchor.start, anchor.end);
}

export type EditFailure =
  | "unknown_block"
  | "stale_revision"
  | "source_mismatch";

export interface EditRequest {
  anchor: Anchor;
  /** The text we expect to find at the anchor. The edit is refused otherwise. */
  expected: string;
  replacement: string;
  /** If given, the block must still be at this revision. */
  expectedBlockRevision?: number;
}

/** A single contiguous change: [start, start+removedLength) became insertedLength chars. */
export interface ChangeRegion {
  blockId: string;
  start: number;
  removedLength: number;
  insertedLength: number;
}

export type EditResult =
  | { ok: true; doc: DocState; change: ChangeRegion; anchor: Anchor }
  | { ok: false; reason: EditFailure };

/**
 * Replace exactly the text at `anchor`, after verifying the source text and
 * (optionally) the block revision. Returns a new document; never mutates.
 */
export function applyExactEdit(doc: DocState, req: EditRequest): EditResult {
  const block = doc.blocks[req.anchor.blockId];
  if (!block) return { ok: false, reason: "unknown_block" };
  if (req.expectedBlockRevision !== undefined && block.revision !== req.expectedBlockRevision) {
    return { ok: false, reason: "stale_revision" };
  }
  const current = block.text.slice(req.anchor.start, req.anchor.end);
  if (req.anchor.end - req.anchor.start !== req.expected.length || current !== req.expected) {
    return { ok: false, reason: "source_mismatch" };
  }
  const text =
    block.text.slice(0, req.anchor.start) + req.replacement + block.text.slice(req.anchor.end);
  const next: Block = { ...block, text, revision: block.revision + 1 };
  return {
    ok: true,
    doc: { ...doc, blocks: { ...doc.blocks, [block.id]: next }, revision: doc.revision + 1 },
    change: {
      blockId: block.id,
      start: req.anchor.start,
      removedLength: req.expected.length,
      insertedLength: req.replacement.length,
    },
    anchor: {
      blockId: block.id,
      start: req.anchor.start,
      end: req.anchor.start + req.replacement.length,
    },
  };
}

/**
 * Where does an existing anchor land after a change?
 * Returns null when the change overlaps the anchor (the anchored text was touched).
 */
export function mapAnchor(anchor: Anchor, change: ChangeRegion): Anchor | null {
  if (anchor.blockId !== change.blockId) return anchor;
  const changeEnd = change.start + change.removedLength;
  const delta = change.insertedLength - change.removedLength;
  // Entirely before the change (an insertion exactly at our end does not touch us).
  if (anchor.end <= change.start) return anchor;
  // Entirely after the change (an insertion exactly at our start shifts us).
  if (anchor.start >= changeEnd) {
    return { ...anchor, start: anchor.start + delta, end: anchor.end + delta };
  }
  return null;
}

/** The minimal single region that turns `before` into `after` (common prefix/suffix). */
export function diffRegion(before: string, after: string): { start: number; removedLength: number; insertedLength: number } | null {
  if (before === after) return null;
  let start = 0;
  const max = Math.min(before.length, after.length);
  while (start < max && before[start] === after[start]) start++;
  let endB = before.length;
  let endA = after.length;
  while (endB > start && endA > start && before[endB - 1] === after[endA - 1]) {
    endB--;
    endA--;
  }
  return { start, removedLength: endB - start, insertedLength: endA - start };
}

export type ManualEditResult =
  | { ok: true; doc: DocState; change: ChangeRegion | null }
  | { ok: false; reason: "unknown_block" | "stale_revision" };

/** A person rewrote the whole block. Bumps revision and editEpoch. */
export function applyManualBlockEdit(
  doc: DocState,
  blockId: string,
  newText: string,
  expectedBlockRevision: number,
): ManualEditResult {
  const block = doc.blocks[blockId];
  if (!block) return { ok: false, reason: "unknown_block" };
  if (block.revision !== expectedBlockRevision) return { ok: false, reason: "stale_revision" };
  const region = diffRegion(block.text, newText);
  if (!region) return { ok: true, doc, change: null };
  const next: Block = {
    ...block,
    text: newText,
    revision: block.revision + 1,
    editEpoch: block.editEpoch + 1,
  };
  return {
    ok: true,
    doc: { ...doc, blocks: { ...doc.blocks, [blockId]: next }, revision: doc.revision + 1 },
    change: { blockId, ...region },
  };
}
