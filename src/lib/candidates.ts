/**
 * Prepared candidate findings.
 *
 * These are intentionally prepared (not generated): the prototype demonstrates
 * OpenJEV's judgment about each proposed edit and the editor's review experience,
 * not a grammar-detection engine. Nothing here says how a candidate should be
 * routed — that decision comes from OpenJEV plus the routing policy.
 */

export type CandidateCategory =
  | "typo"
  | "whitespace"
  | "punctuation"
  | "style_normalisation"
  | "grammar"
  | "article"
  | "concision"
  | "hyphenation"
  | "ambiguity"
  | "causal_language"
  | "numeric"
  | "statistical_language"
  | "claim_strength"
  | "terminology"
  | "usage"
  // Deeper copyediting
  | "inclusive_language"
  | "abbreviation"
  | "dangling_modifier"
  | "tense"
  | "citation"
  | "uncited_reference"
  // Structure (XML)
  | "structure_link"
  | "cross_reference"
  // Figures
  | "figure_palette"
  | "figure_resolution"
  | "figure_units"
  | "figure_text_size"
  | "figure_alt_text";

/** What a finding changes: manuscript text, a figure, or the XML tagging. */
export type CandidateKind = "text" | "figure" | "structure";

/** The editorial pass a finding belongs to (shown on the card). */
export type Pass = "Language" | "Consistency" | "Meaning" | "References" | "Structure" | "Figures";

const PASS_BY_CATEGORY: Record<CandidateCategory, Pass> = {
  typo: "Language",
  whitespace: "Language",
  punctuation: "Language",
  style_normalisation: "Language",
  grammar: "Language",
  article: "Language",
  concision: "Language",
  hyphenation: "Language",
  usage: "Language",
  inclusive_language: "Language",
  dangling_modifier: "Language",
  tense: "Language",
  terminology: "Consistency",
  abbreviation: "Consistency",
  numeric: "Consistency",
  ambiguity: "Meaning",
  causal_language: "Meaning",
  statistical_language: "Meaning",
  claim_strength: "Meaning",
  citation: "References",
  uncited_reference: "References",
  structure_link: "Structure",
  cross_reference: "Structure",
  figure_palette: "Figures",
  figure_resolution: "Figures",
  figure_units: "Figures",
  figure_text_size: "Figures",
  figure_alt_text: "Figures",
};

export interface Candidate {
  id: string;
  blockId: string;
  /** Exact text in the block that the finding targets. */
  original: string;
  /** Which occurrence of `original` within the block (0-based). */
  occurrence: number;
  /** Proposed replacement, or null when the finding only raises a question. */
  replacement: string | null;
  category: CandidateCategory;
  /** Short editorial label shown on the card. */
  label: string;
  /** Prepared editorial explanation (not written by OpenJEV). */
  explanation: string;
  /** Optional prepared author-query draft. */
  authorQuery?: string;
  /** Other blocks worth sending to OpenJEV as context (e.g. a figure quoted elsewhere). */
  relatedBlocks?: string[];
  /** Defaults to "text". */
  kind?: CandidateKind;
  /** Overrides the pass derived from the category. */
  pass?: Pass;
  /** Figure findings: the property that would change. */
  figure?: {
    figureId: string;
    prop: "palette" | "yAxisLabel" | "tickFontPt" | "altText" | "source";
    from: string | number | null;
    to: string | number | null;
    region: "image" | "legend" | "y-axis" | "ticks" | "alt";
  };
  /** Structure findings: the XML element the text would be tagged as. */
  structure?: { refType: "bibr" | "fig"; rid: string } | { refType: null; rid: null };
  /** Prepared facts sent to OpenJEV as evidence (e.g. the reference-list entry). */
  evidence?: Record<string, unknown>;
}

export const kindOf = (c: Candidate): CandidateKind => c.kind ?? "text";
export const passOf = (c: Candidate): Pass => c.pass ?? PASS_BY_CATEGORY[c.category];

export const CANDIDATES: Candidate[] = [
  {
    id: "f01",
    blockId: "abs-1",
    original: "teh",
    occurrence: 0,
    replacement: "the",
    category: "typo",
    label: "Spelling",
    explanation: "Transposed letters in a common word.",
  },
  {
    id: "f02",
    blockId: "abs-1",
    original: "was associated with",
    occurrence: 0,
    replacement: "caused",
    category: "causal_language",
    label: "Causal wording",
    explanation:
      "Proposed as more direct phrasing. The study design is cross-sectional, so a causal verb may overstate the finding.",
    authorQuery:
      "AQ: The abstract states that higher canopy cover “was associated with” lower surface temperature. An edit to “caused” was considered for directness, but the cross-sectional design may not support a causal claim. Please confirm the intended wording.",
    relatedBlocks: ["meth-3"],
  },
  {
    id: "f03",
    blockId: "intro-1",
    original: "surfaces  absorb",
    occurrence: 0,
    replacement: "surfaces absorb",
    category: "whitespace",
    label: "Spacing",
    explanation: "Two spaces between words; one is standard.",
  },
  {
    id: "f04",
    blockId: "intro-1",
    original: "widely documented",
    occurrence: 0,
    replacement: "widely-documented",
    category: "hyphenation",
    label: "Hyphenation",
    explanation: "Proposed hyphenation of a compound modifier.",
  },
  {
    id: "f05",
    blockId: "intro-2",
    original: "neighborhood",
    occurrence: 0,
    replacement: "neighbourhood",
    category: "style_normalisation",
    label: "House spelling",
    explanation: "Demo Journal Style uses British spelling; the abstract already uses “neighbourhood”.",
    relatedBlocks: ["abs-1"],
  },
  {
    id: "f06",
    blockId: "intro-2",
    original: "but they were often collected",
    occurrence: 0,
    replacement: "but the canopy maps and thermal images were often collected",
    category: "ambiguity",
    label: "Ambiguous reference",
    explanation:
      "“They” could refer to the earlier studies, the canopy maps, the thermal imagery or the satellite sensors.",
    authorQuery:
      "AQ: In “but they were often collected at different times of day”, please clarify what “they” refers to — the canopy maps, the thermal images, or both datasets.",
  },
  {
    id: "f07",
    blockId: "intro-3",
    original: "examines relationship between",
    occurrence: 0,
    replacement: "examines the relationship between",
    category: "article",
    label: "Missing article",
    explanation: "A definite article is needed before “relationship”.",
  },
  {
    id: "f08",
    blockId: "h-study-area",
    original: "Study Area",
    occurrence: 0,
    replacement: "Study area",
    category: "style_normalisation",
    label: "Heading case",
    explanation: "Demo Journal Style uses sentence case for headings.",
  },
  {
    id: "f09",
    blockId: "meth-2",
    original: "Landsat 9,,",
    occurrence: 0,
    replacement: "Landsat 9,",
    category: "punctuation",
    label: "Punctuation",
    explanation: "Doubled comma.",
  },
  {
    id: "f10",
    blockId: "meth-2",
    original: "The measurements was collected",
    occurrence: 0,
    replacement: "The measurements were collected",
    category: "grammar",
    label: "Subject–verb agreement",
    explanation: "Plural subject “measurements” takes a plural verb.",
  },
  {
    id: "f11",
    blockId: "meth-3",
    original: "in order to",
    occurrence: 0,
    replacement: "to",
    category: "concision",
    label: "Concision",
    explanation: "“In order to” can usually be shortened to “to” without loss of meaning.",
  },
  {
    id: "f12",
    blockId: "meth-3",
    original: "the data were screened",
    occurrence: 0,
    replacement: "the data was screened",
    category: "grammar",
    label: "Number agreement",
    explanation: "Proposed treating “data” as a singular mass noun.",
  },
  {
    id: "f13",
    blockId: "res-2",
    original: "1.8 °C",
    occurrence: 0,
    replacement: "1.6 °C",
    category: "numeric",
    label: "Numerical consistency",
    explanation:
      "The abstract reports a 1.6 °C difference between the highest and lowest canopy quartiles; the Results report 1.8 °C.",
    authorQuery:
      "AQ: The abstract gives the difference between the highest and lowest canopy quartiles as 1.6 °C, but the Results give 1.8 °C. Please confirm the correct value and amend whichever is inconsistent.",
    relatedBlocks: ["abs-1"],
  },
  {
    id: "f14",
    blockId: "res-2",
    original: "recieved",
    occurrence: 0,
    replacement: "received",
    category: "typo",
    label: "Spelling",
    explanation: "Common misspelling (“i before e”).",
  },
  {
    id: "f15",
    blockId: "res-2",
    original: "significantly cooler",
    occurrence: 0,
    replacement: "substantially cooler",
    category: "statistical_language",
    label: "Statistical wording",
    explanation:
      "“Significantly” implies a statistical test, but none is reported for this comparison. “Substantially” was proposed instead.",
    authorQuery:
      "AQ: “Significantly cooler” suggests a statistical test. If one was performed, please report it; otherwise, would “substantially cooler” or “noticeably cooler” reflect your meaning?",
  },
  {
    id: "f16",
    blockId: "res-2",
    original: "a large number of the warmest blocks",
    occurrence: 0,
    replacement: "many of the warmest blocks",
    category: "concision",
    label: "Concision",
    explanation: "Shorter phrasing with the same meaning.",
  },
  {
    id: "f17",
    blockId: "res-3",
    original: "Fewer industrial blocks",
    occurrence: 0,
    replacement: "Less industrial blocks",
    category: "usage",
    label: "Word choice",
    explanation: "Proposed “less” in place of “fewer”.",
  },
  {
    id: "f18",
    blockId: "res-3",
    original: "canopy cover",
    occurrence: 1,
    replacement: "tree coverage",
    category: "terminology",
    label: "Terminology",
    explanation: "Proposed varying the term to avoid repetition within the paragraph.",
    relatedBlocks: ["meth-2"],
  },
  {
    id: "f19",
    blockId: "disc-1",
    original: "These results suggest",
    occurrence: 0,
    replacement: "These results demonstrate",
    category: "claim_strength",
    label: "Claim strength",
    explanation: "Proposed more assertive wording.",
    authorQuery:
      "AQ: A change from “suggest” to “demonstrate” was considered. Given the cross-sectional design, please confirm whether the stronger wording is intended.",
    relatedBlocks: ["meth-3"],
  },
  {
    id: "f20",
    blockId: "disc-2",
    original: "where it was partly offset",
    occurrence: 0,
    replacement: null,
    category: "ambiguity",
    label: "Ambiguous reference",
    explanation:
      "“It” could refer to canopy cooling or to the industrial east, and “where” could point to either location.",
    authorQuery:
      "AQ: In “where it was partly offset by heat released from large warehouse roofs”, please clarify whether “it” refers to canopy cooling, and whether “where” refers to the river corridor or the industrial east.",
  },
  {
    id: "f21",
    blockId: "disc-2",
    original: "an unique",
    occurrence: 0,
    replacement: "a unique",
    category: "article",
    label: "Article",
    explanation: "“Unique” begins with a consonant sound, so it takes “a”.",
  },
  {
    id: "f22",
    blockId: "disc-3",
    original: "Future work should",
    occurrence: 0,
    replacement: "Future works should",
    category: "grammar",
    label: "Number agreement",
    explanation: "Proposed plural “works”.",
  },

  /* ---------------- Deeper copyediting ---------------- */
  {
    id: "f23",
    blockId: "intro-1",
    original: "the elderly",
    occurrence: 0,
    replacement: "older adults",
    category: "inclusive_language",
    label: "Inclusive language",
    explanation: "Demo Journal Style prefers neutral, person-first terms for age groups.",
  },
  {
    id: "f24",
    blockId: "intro-3",
    original: "summer land surface temperature",
    occurrence: 0,
    replacement: "summer land surface temperature (LST)",
    category: "abbreviation",
    label: "Abbreviation at first use",
    explanation: "“LST” is used from the Methods onwards but is defined only in the abstract. Define it at its first use in the main text.",
  },
  {
    id: "f25",
    blockId: "meth-lst",
    original: "Using a single-channel algorithm, surface temperature was derived from the thermal infrared band",
    occurrence: 0,
    replacement: "Surface temperature was derived from the thermal infrared band using a single-channel algorithm",
    category: "dangling_modifier",
    label: "Dangling modifier",
    explanation: "The opening phrase has no agent: surface temperature did not use the algorithm. Moving it resolves the construction without changing the method.",
  },
  {
    id: "f26",
    blockId: "res-sensitivity",
    original: "does not alter",
    occurrence: 0,
    replacement: "did not alter",
    category: "tense",
    label: "Tense consistency",
    explanation: "The Results report completed analyses in the past tense.",
  },
  {
    id: "f27",
    blockId: "disc-1",
    original: "(Lindell, 2021)",
    occurrence: 0,
    replacement: "(Lindell, 2020)",
    category: "citation",
    label: "Citation mismatch",
    explanation: "The reference list has Lindell (2020), not 2021. Either the citation year or the reference is wrong.",
    authorQuery:
      "AQ: The text cites Lindell (2021), but the reference list gives Lindell, K. (2020). Please confirm the correct year, or add the 2021 work to the reference list.",
    evidence: { reference_list_entry: "Lindell, K. (2020) Street trees and surface cooling in temperate cities. Urban Climate Letters, 8, pp. 44–58." },
  },
  {
    id: "f28",
    blockId: "ref-1",
    original: "211-229",
    occurrence: 0,
    replacement: "211–229",
    category: "punctuation",
    pass: "References",
    label: "Page range",
    explanation: "Page ranges take an en dash, as in the other references.",
  },
  {
    id: "f29",
    blockId: "fig-2",
    original: "n = 214",
    occurrence: 0,
    replacement: "n = 202",
    category: "numeric",
    label: "Caption count",
    explanation: "The caption gives 214 census blocks, but the Methods exclude 12 and analyse 202.",
    authorQuery: "AQ: The Figure 2 caption gives n = 214, while the Methods report 202 analysed blocks. Please confirm which is correct.",
    relatedBlocks: ["meth-1"],
  },

  /* ---------------- Structure (JATS XML) ---------------- */
  {
    id: "x01",
    kind: "structure",
    blockId: "intro-1",
    original: "(Marsh and Idowu, 2017)",
    occurrence: 0,
    replacement: '<xref ref-type="bibr" rid="r1">(Marsh and Idowu, 2017)</xref>',
    category: "structure_link",
    structure: { refType: "bibr", rid: "r1" },
    label: "Link citation",
    explanation: "The citation matches exactly one reference-list entry. Tagging it makes the link machine-readable in the XML.",
    evidence: { matching_reference: "Marsh, J. and Idowu, T. (2017) Heat, health and the built environment…", matches_found: 1 },
  },
  {
    id: "x02",
    kind: "structure",
    blockId: "meth-1",
    original: "Figure 1",
    occurrence: 0,
    replacement: '<xref ref-type="fig" rid="fig1">Figure 1</xref>',
    category: "structure_link",
    structure: { refType: "fig", rid: "fig1" },
    label: "Link figure citation",
    explanation: "The text cites Figure 1, which exists. Tag the mention as a cross-reference.",
    evidence: { target_exists: true, target: "fig1" },
  },
  {
    id: "x03",
    kind: "structure",
    blockId: "res-1",
    original: "Figure 2",
    occurrence: 0,
    replacement: '<xref ref-type="fig" rid="fig2">Figure 2</xref>',
    category: "structure_link",
    structure: { refType: "fig", rid: "fig2" },
    label: "Link figure citation",
    explanation: "The text cites Figure 2, which exists. Tag the mention as a cross-reference.",
    evidence: { target_exists: true, target: "fig2" },
  },
  {
    id: "x04",
    kind: "structure",
    blockId: "res-2",
    original: "(Figure 3)",
    occurrence: 0,
    replacement: null,
    category: "cross_reference",
    structure: { refType: null, rid: null },
    label: "Missing figure",
    explanation: "The Results cite Figure 3, but the manuscript contains only Figures 1 and 2, so the citation cannot be linked.",
    authorQuery: "AQ: The Results cite Figure 3, but only Figures 1 and 2 were supplied. Please provide Figure 3 or correct the citation.",
    evidence: { figures_available: ["Figure 1", "Figure 2"] },
  },
  {
    id: "x05",
    kind: "structure",
    blockId: "ref-3",
    original: "Okafor, R., Brandt, S. and Leclerc, M. (2019)",
    occurrence: 0,
    replacement: null,
    category: "uncited_reference",
    structure: { refType: null, rid: null },
    label: "Uncited reference",
    explanation: "This reference is in the list but is never cited in the text.",
    authorQuery: "AQ: Okafor et al. (2019) appears in the reference list but is not cited in the text. Please cite it where appropriate or remove it.",
    evidence: { citations_found_in_text: 0 },
  },

  /* ---------------- Figures ---------------- */
  {
    id: "g01",
    kind: "figure",
    blockId: "fig-1",
    original: "Colour scale: red–green diverging",
    occurrence: 0,
    replacement: "Colour scale: colour-blind-safe sequential (olive)",
    category: "figure_palette",
    figure: { figureId: "fig1", prop: "palette", from: "red-green", to: "olive-sequential", region: "legend" },
    label: "Colour accessibility",
    explanation: "Red and green are hard to tell apart for readers with the most common colour-vision deficiency. A single-hue sequential scale keeps the low-to-high order readable for everyone.",
    evidence: { palette_endpoints: ["#d73027 (red)", "#1a9850 (green)"], distinguishable_with_deuteranopia: false, data_are_ordered: true },
  },
  {
    id: "g02",
    kind: "figure",
    blockId: "fig-1",
    original: "Supplied raster: 1,180 × 820 px at 170 mm print width (176 dpi)",
    occurrence: 0,
    replacement: null,
    category: "figure_resolution",
    figure: { figureId: "fig1", prop: "source", from: null, to: null, region: "image" },
    label: "Image resolution",
    explanation: "At its print width this raster is 176 dpi. Demo Journal Style requires at least 300 dpi. An editor cannot fix this; the author needs to supply a new file.",
    authorQuery: "AQ: Figure 1 was supplied at 1,180 × 820 px, which gives 176 dpi at the 170 mm print width. Please supply a version of at least 300 dpi (at least 2,010 px wide), or a vector file.",
    evidence: { effective_dpi: 176, required_dpi: 300, print_width_mm: 170 },
  },
  {
    id: "g03",
    kind: "figure",
    blockId: "fig-2",
    original: "y-axis label: Surface temperature (°F)",
    occurrence: 0,
    replacement: "y-axis label: Surface temperature (°C)",
    category: "figure_units",
    figure: { figureId: "fig2", prop: "yAxisLabel", from: "Surface temperature (°F)", to: "Surface temperature (°C)", region: "y-axis" },
    label: "Axis units",
    explanation: "The axis runs from 26 to 40 degrees, matching the °C values in the text. In °F these values would be below freezing.",
    authorQuery: "AQ: The Figure 2 y-axis is labelled °F, but the values (27–39) match the °C figures reported in the text. Please confirm the unit.",
    evidence: { axis_range: "26–40", text_reports: "27.4 °C to 38.9 °C" },
  },
  {
    id: "g04",
    kind: "figure",
    blockId: "fig-2",
    original: "Axis text: 5.5 pt at print size",
    occurrence: 0,
    replacement: "Axis text: 8 pt at print size",
    category: "figure_text_size",
    figure: { figureId: "fig2", prop: "tickFontPt", from: 5.5, to: 8, region: "ticks" },
    label: "Figure text size",
    explanation: "Axis text is 5.5 pt when printed at 170 mm. Demo Journal Style requires at least 7 pt.",
    evidence: { measured_pt: 5.5, minimum_pt: 7 },
  },
  {
    id: "g05",
    kind: "figure",
    blockId: "fig-2",
    original: "Alt text: (none)",
    occurrence: 0,
    replacement:
      "Alt text: Scatter plot of mean summer land surface temperature against tree canopy cover for each census block. Temperature falls as canopy cover rises, and a straight fitted line slopes downwards.",
    category: "figure_alt_text",
    figure: {
      figureId: "fig2",
      prop: "altText",
      from: null,
      to: "Scatter plot of mean summer land surface temperature against tree canopy cover for each census block. Temperature falls as canopy cover rises, and a straight fitted line slopes downwards.",
      region: "alt",
    },
    label: "Alt text",
    explanation: "Figures need a text alternative for screen-reader users. This draft describes the chart without adding claims beyond the caption.",
  },
];

export function getCandidate(id: string): Candidate | undefined {
  return CANDIDATES.find((c) => c.id === id);
}
