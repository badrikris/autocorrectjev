/**
 * Demo Journal Style — a fictional style profile for this prototype.
 * These are NOT verified requirements of any TNQ customer or real journal.
 */
export const STYLE_PROFILE = {
  name: "Demo Journal Style",
  disclaimer:
    "Fictional demonstration rules. Not verified requirements of a TNQ customer or any real journal.",
  rules: [
    "Use British English spelling in ordinary prose (e.g. 'neighbourhood', 'modelling').",
    "Use sentence case for all headings and subheadings.",
    "Minimal intervention: change only what is wrong or clearly unclear.",
    "Preserve technical terminology exactly as the authors define it.",
    "Preserve the author's meaning.",
    "Do not strengthen scientific claims beyond what the evidence supports.",
    "Define abbreviations at first use in the main text, even if defined in the abstract.",
    "Use neutral, person-first language (e.g. 'older adults', not 'the elderly').",
    "Report completed work in the past tense in Methods and Results.",
    "Every citation must match a reference-list entry, and every reference must be cited. Page ranges take an en dash.",
    "Figures: colour-blind-safe palettes; text at least 7 pt at print size; raster images at least 300 dpi at print size; every figure needs alt text.",
    "Structure: output JATS 1.3 XML; cross-references to figures and references are tagged as <xref>.",
  ],
  /**
   * Terms and names that automatic editing must never alter.
   * Matched case-insensitively as whole phrases.
   */
  protectedTerms: [
    "land surface temperature",
    "LST",
    "canopy cover",
    "tree canopy",
    "impervious surface fraction",
    "building density",
    "census block",
    "census blocks",
    "supervised classification",
    "mixed-effects model",
    "random effect",
    "spatial autocorrelation",
    "Landsat",
  ],
  /** Proper names that automatic editing must never alter. */
  protectedNames: ["Easthollow", "Marsh", "Idowu", "Lindell", "Varga", "Okonkwo-Hale", "Lindqvist"],
} as const;
