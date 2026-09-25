/**
 * Live JATS (Z39.96) XML for the manuscript.
 *
 * Generated from the current document, figure specs and applied structure
 * findings, so every accepted change is reflected immediately. Output is a
 * list of line groups keyed by block, so the XML view can highlight findings
 * and follow the reader exactly like the text view.
 */
import { kindOf } from "./candidates";
import { effectiveDpi } from "./figures";
import { MANUSCRIPT_META } from "./manuscript";
import { candidateOf, type FindingState, type ReviewState } from "./review";

export interface XmlPart {
  t: "tag" | "text" | "comment";
  text: string;
  /** Finding this part belongs to (for highlighting and selection). */
  findingId?: string;
  /** Part of an applied structure link. */
  linked?: boolean;
}
export interface XmlLine {
  indent: number;
  parts: XmlPart[];
}
export interface XmlGroup {
  blockId: string | null;
  lines: XmlLine[];
}

const LINKED: FindingState["resolution"][] = ["open", "kept", "applied", "applied_edited"];

export function isLinkApplied(f: FindingState): boolean {
  return f.appliedText !== undefined && LINKED.includes(f.resolution) && kindOf(candidateOf(f.id)) === "structure";
}

/** Inline content of a block, with applied links wrapped in <xref>. */
function inline(state: ReviewState, blockId: string): XmlPart[] {
  const text = state.doc.blocks[blockId].text;
  const marks = Object.values(state.findings)
    .filter((f) => f.anchor && f.anchor.blockId === blockId && f.anchor.end > f.anchor.start && kindOf(candidateOf(f.id)) !== "figure")
    .sort((a, b) => a.anchor!.start - b.anchor!.start);
  const parts: XmlPart[] = [];
  let pos = 0;
  for (const f of marks) {
    const { start, end } = f.anchor!;
    if (start < pos) continue;
    if (start > pos) parts.push({ t: "text", text: text.slice(pos, start) });
    const segment = text.slice(start, end);
    const c = candidateOf(f.id);
    if (isLinkApplied(f) && c.structure?.rid) {
      parts.push({ t: "tag", text: `<xref ref-type="${c.structure.refType}" rid="${c.structure.rid}">`, findingId: f.id, linked: true });
      parts.push({ t: "text", text: segment, findingId: f.id, linked: true });
      parts.push({ t: "tag", text: "</xref>", findingId: f.id, linked: true });
    } else {
      parts.push({ t: "text", text: segment, findingId: f.id });
    }
    pos = end;
  }
  if (pos < text.length) parts.push({ t: "text", text: text.slice(pos) });
  return parts;
}

const tag = (text: string, findingId?: string): XmlPart => ({ t: "tag", text, findingId });
const line = (indent: number, ...parts: XmlPart[]): XmlLine => ({ indent, parts });
const wrap = (indent: number, open: string, close: string, parts: XmlPart[]): XmlLine => line(indent, tag(open), ...parts, tag(close));

export function buildJats(state: ReviewState): XmlGroup[] {
  const groups: XmlGroup[] = [];
  let cur: XmlGroup = { blockId: null, lines: [] };
  groups.push(cur);
  const start = (blockId: string | null) => {
    cur = { blockId, lines: [] };
    groups.push(cur);
  };
  const push = (...l: XmlLine[]) => cur.lines.push(...l);

  push(
    line(0, tag('<?xml version="1.0" encoding="UTF-8"?>')),
    line(0, tag('<!DOCTYPE article PUBLIC "-//NLM//DTD JATS (Z39.96) Journal Publishing DTD v1.3 20210610//EN" "JATS-journalpublishing1-3.dtd">')),
    line(0, tag('<article xmlns:xlink="http://www.w3.org/1999/xlink" article-type="research-article" xml:lang="en">')),
    line(1, tag("<front>")),
    line(2, tag("<journal-meta>")),
    line(3, tag("<journal-title-group>"), tag("<journal-title>"), { t: "text", text: MANUSCRIPT_META.journal }, tag("</journal-title>"), tag("</journal-title-group>")),
    line(2, tag("</journal-meta>")),
    line(2, tag("<article-meta>")),
    line(3, tag("<title-group>"), tag("<article-title>"), { t: "text", text: MANUSCRIPT_META.title }, tag("</article-title>"), tag("</title-group>")),
    line(3, tag('<contrib-group content-type="author">')),
    ...MANUSCRIPT_META.authors.map((a) => {
      const parts = a.split(" ");
      const surname = parts.slice(-1)[0];
      const given = parts.slice(0, -1).join(" ");
      return line(
        4,
        tag('<contrib contrib-type="author">'),
        tag("<name>"),
        tag("<surname>"),
        { t: "text", text: surname },
        tag("</surname>"),
        tag("<given-names>"),
        { t: "text", text: given },
        tag("</given-names>"),
        tag("</name>"),
        tag('<xref ref-type="aff" rid="aff1"/>'),
        tag("</contrib>"),
      );
    }),
    line(3, tag("</contrib-group>")),
    line(3, tag('<aff id="aff1">'), { t: "text", text: MANUSCRIPT_META.affiliation }, tag("</aff>")),
  );

  let phase: "front" | "body" | "back" = "front";
  let sec1 = false;
  let sec2 = false;
  const closeSecs = () => {
    if (sec2) push(line(3, tag("</sec>")));
    if (sec1) push(line(2, tag("</sec>")));
    sec1 = sec2 = false;
  };

  for (const id of state.doc.order) {
    const b = state.doc.blocks[id];
    if (b.sectionId === "abstract") {
      start(id);
      if (b.kind === "heading") push(line(3, tag("<abstract>")));
      else push(wrap(4, "<p>", "</p>", inline(state, id)));
      continue;
    }
    if (phase === "front") {
      push(line(3, tag("</abstract>")), line(2, tag("</article-meta>")), line(1, tag("</front>")), line(1, tag("<body>")));
      phase = "body";
    }
    start(id);
    if (b.sectionId === "references") {
      if (b.kind === "heading") {
        closeSecs();
        push(line(1, tag("</body>")), line(1, tag("<back>")), line(2, tag("<ref-list>")), wrap(3, "<title>", "</title>", inline(state, id)));
        phase = "back";
      } else {
        push(line(3, tag(`<ref id="${b.refId}">`), tag('<mixed-citation publication-type="journal">'), ...inline(state, id), tag("</mixed-citation>"), tag("</ref>")));
      }
      continue;
    }
    const indent = sec2 ? 4 : 3;
    switch (b.kind) {
      case "heading":
        closeSecs();
        push(line(2, tag(`<sec id="sec-${b.sectionId}">`)), wrap(3, "<title>", "</title>", inline(state, id)));
        sec1 = true;
        break;
      case "subheading":
        if (sec2) push(line(3, tag("</sec>")));
        push(line(3, tag(`<sec id="sec-${b.id}">`)), wrap(4, "<title>", "</title>", inline(state, id)));
        sec2 = true;
        break;
      case "figure": {
        const spec = state.figures[b.figureId!];
        const figFindings = Object.values(state.findings).filter((f) => f.anchor?.blockId === id && kindOf(candidateOf(f.id)) === "figure");
        const find = (prop: string) => figFindings.find((f) => candidateOf(f.id).figure?.prop === prop)?.id;
        const dpi = effectiveDpi(spec);
        push(
          line(indent, tag(`<fig id="${spec.id}" position="float">`)),
          wrap(indent + 1, "<label>", "</label>", [{ t: "text", text: spec.label }]),
          line(indent + 1, tag("<caption>"), tag("<p>"), ...inline(state, id), tag("</p>"), tag("</caption>")),
          spec.altText
            ? wrap(indent + 1, "<alt-text>", "</alt-text>", [{ t: "text", text: spec.altText, findingId: find("altText") }])
            : line(indent + 1, { t: "comment", text: "<!-- alt-text missing -->", findingId: find("altText") }),
          line(
            indent + 1,
            tag(
              `<graphic xlink:href="${spec.id}.${spec.source.format.toLowerCase()}" mimetype="image" mime-subtype="${spec.source.format === "SVG" ? "svg+xml" : "png"}"/>`,
              find("source"),
            ),
            ...(dpi !== null ? [{ t: "comment" as const, text: ` <!-- ${dpi} dpi at ${spec.source.printWidthMm} mm -->`, findingId: find("source") }] : []),
          ),
          line(indent, tag("</fig>")),
        );
        break;
      }
      default:
        push(wrap(indent, "<p>", "</p>", inline(state, id)));
    }
  }
  if (phase === "back") push(line(2, tag("</ref-list>")), line(1, tag("</back>")));
  else {
    closeSecs();
    push(line(1, tag("</body>")));
  }
  push(line(0, tag("</article>")));
  return groups;
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The whole document as a string (text escaped; tags as generated). */
export function jatsToString(groups: XmlGroup[]): string {
  return groups
    .flatMap((g) => g.lines)
    .map((l) => "  ".repeat(l.indent) + l.parts.map((p) => (p.t === "text" ? escapeXml(p.text) : p.text)).join(""))
    .join("\n");
}
