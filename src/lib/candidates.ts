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
  | "usage";

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
}

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
];

export function getCandidate(id: string): Candidate | undefined {
  return CANDIDATES.find((c) => c.id === id);
}
