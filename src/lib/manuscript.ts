/**
 * Synthetic demonstration manuscript. Entirely fictional: the city, authors,
 * affiliation, citations and data do not exist.
 *
 * Every block has a stable ID. Prepared candidates anchor to these IDs.
 */

export type BlockKind = "title" | "heading" | "subheading" | "paragraph" | "figure" | "reference";

export interface SectionDef {
  id: string;
  title: string;
}

export interface BlockDef {
  id: string;
  sectionId: string;
  kind: BlockKind;
  /** Body text; for a figure this is its caption, for a reference the full entry. */
  text: string;
  /** Figure blocks: which figure. Reference blocks: the reference ID used in XML. */
  figureId?: string;
  refId?: string;
}

export const MANUSCRIPT_META = {
  title:
    "Urban tree cover and summer land surface temperature in a mid-sized temperate city",
  shortTitle: "Urban tree cover and summer surface temperature",
  authors: ["Ines Varga", "Tomasz Okonkwo-Hale", "Maren Lindqvist"],
  affiliation: "Department of Geography, University of Easthollow",
  journal: "Demo Journal of Urban Environments",
  label: "Demo manuscript · synthetic content · all names and data are fictional",
};

export const SECTIONS: SectionDef[] = [
  { id: "abstract", title: "Abstract" },
  { id: "introduction", title: "Introduction" },
  { id: "methods", title: "Methods" },
  { id: "results", title: "Results" },
  { id: "discussion", title: "Discussion" },
  { id: "references", title: "References" },
];

export const BLOCKS: BlockDef[] = [
  // Abstract
  { id: "h-abstract", sectionId: "abstract", kind: "heading", text: "Abstract" },
  {
    id: "abs-1",
    sectionId: "abstract",
    kind: "paragraph",
    text:
      "Urban heat is a growing concern for public health, yet the cooling contribution of street trees remains unevenly quantified at the neighbourhood scale. We examined the relationship between tree canopy cover and summer land surface temperature (LST) across 202 census blocks in Easthollow, a mid-sized temperate city. Canopy cover was derived from 0.5 m aerial imagery, and LST was estimated from teh thermal bands of 14 cloud-free Landsat scenes acquired between June and August 2019–2023. Higher canopy cover was associated with lower mean surface temperature (r = −0.62, p < 0.001). Blocks in the highest canopy quartile were on average 1.6 °C cooler than blocks in the lowest quartile. These results suggest that expanding canopy in low-cover districts could meaningfully reduce local surface heat exposure.",
  },

  // Introduction
  { id: "h-introduction", sectionId: "introduction", kind: "heading", text: "Introduction" },
  {
    id: "intro-1",
    sectionId: "introduction",
    kind: "paragraph",
    text:
      "Cities are warmer than their rural surroundings, a pattern commonly described as the urban heat island. Dark, impervious surfaces  absorb solar radiation during the day and release it slowly at night, while reduced vegetation limits evaporative cooling. The consequences for human health have been widely documented, particularly for the elderly and for people with pre-existing cardiovascular conditions (Marsh and Idowu, 2017).",
  },
  {
    id: "intro-2",
    sectionId: "introduction",
    kind: "paragraph",
    text:
      "Street trees moderate surface temperature through shading and transpiration. However, their distribution is rarely uniform: canopy is typically concentrated in older, wealthier districts, leaving denser neighborhood blocks with little shade. Earlier studies compared canopy maps with thermal imagery from satellite sensors, but they were often collected at different times of day, which complicates direct comparison.",
  },
  {
    id: "intro-prior",
    sectionId: "introduction",
    kind: "paragraph",
    text:
      "Evidence on the size of this effect remains mixed. Studies of large metropolitan areas have reported surface temperature differences of several degrees between well-shaded and treeless neighbourhoods, whereas studies of smaller cities have often found weaker contrasts. Part of this variation reflects differences in climate and urban form, but part is methodological: canopy maps and thermal scenes are frequently drawn from different years, and few analyses account for the density of surrounding buildings.",
  },
  {
    id: "intro-3",
    sectionId: "introduction",
    kind: "paragraph",
    text:
      "This study examines relationship between canopy cover and summer land surface temperature at the block scale, using a consistent acquisition window for all thermal scenes. We ask whether the association holds after accounting for impervious surface fraction and building density, and whether it differs between residential and industrial land uses.",
  },

  // Methods
  { id: "h-methods", sectionId: "methods", kind: "heading", text: "Methods" },
  { id: "h-study-area", sectionId: "methods", kind: "subheading", text: "Study Area" },
  {
    id: "meth-1",
    sectionId: "methods",
    kind: "paragraph",
    text:
      "Easthollow (population approximately 310,000) lies on a broad river plain and has a temperate oceanic climate. The city comprises 214 census blocks, of which 12 were excluded because more than half of their area was open water or rail infrastructure, leaving 202 blocks for analysis (Figure 1).",
  },
  {
    id: "fig-1",
    sectionId: "methods",
    kind: "figure",
    figureId: "fig1",
    text: "Tree canopy cover across the census blocks of Easthollow. Blocks excluded from the analysis (open water and rail land) are shown in grey.",
  },
  { id: "h-data", sectionId: "methods", kind: "subheading", text: "Canopy and temperature data" },
  {
    id: "meth-2",
    sectionId: "methods",
    kind: "paragraph",
    text:
      "Canopy cover was mapped from 0.5 m aerial imagery using a supervised classification and validated against 600 randomly placed reference points (overall accuracy 93 %). Land surface temperature was retrieved from Landsat 8 and Landsat 9,, acquired at approximately 10:30 local time. The measurements was collected on 14 cloud-free days between June and August in 2019–2023.",
  },
  {
    id: "meth-lst",
    sectionId: "methods",
    kind: "paragraph",
    text:
      "Using a single-channel algorithm, surface temperature was derived from the thermal infrared band, with land surface emissivity estimated from the vegetation fraction of each pixel. Scenes were aggregated to census block boundaries by area-weighted averaging, and pixels flagged as cloud, cloud shadow or water were excluded before averaging.",
  },
  { id: "h-analysis", sectionId: "methods", kind: "subheading", text: "Statistical analysis" },
  {
    id: "meth-3",
    sectionId: "methods",
    kind: "paragraph",
    text:
      "We calculated mean LST and canopy cover for each block and fitted a linear mixed-effects model with land-use class as a random effect. Impervious surface fraction and building density were included as covariates in order to separate the effect of canopy from that of the built form. All analyses were carried out in R 4.3, and the data were screened for spatial autocorrelation before modelling.",
  },

  // Results
  { id: "h-results", sectionId: "results", kind: "heading", text: "Results" },
  {
    id: "res-1",
    sectionId: "results",
    kind: "paragraph",
    text:
      "Mean block-level LST ranged from 27.4 °C to 38.9 °C across the study period. Higher canopy cover was associated with lower surface temperature in every year examined, and the relationship remained significant after adjustment for impervious surface fraction (β = −0.21 °C per percentage point of canopy, 95 % CI −0.27 to −0.15). The relationship across all blocks is shown in Figure 2.",
  },
  {
    id: "fig-2",
    sectionId: "results",
    kind: "figure",
    figureId: "fig2",
    text: "Mean summer land surface temperature against tree canopy cover for n = 214 census blocks. The line shows an ordinary least-squares fit.",
  },
  {
    id: "res-2",
    sectionId: "results",
    kind: "paragraph",
    text:
      "Blocks in the highest canopy quartile were on average 1.8 °C cooler than blocks in the lowest quartile. Sites that recieved afternoon shade from mature trees were significantly cooler than comparable unshaded sites, and a large number of the warmest blocks were located in the industrial east of the city (Figure 3).",
  },
  {
    id: "res-3",
    sectionId: "results",
    kind: "paragraph",
    text:
      "Residential blocks showed a steeper cooling gradient than industrial blocks. Fewer industrial blocks exceeded 30 % canopy cover, and those that did were concentrated near the river corridor. The association between canopy cover and LST was weaker in blocks with high building density.",
  },
  {
    id: "res-sensitivity",
    sectionId: "results",
    kind: "paragraph",
    text:
      "These patterns were not sensitive to the source of the canopy data. Repeating the analysis with canopy derived from a coarser 10 m land cover product produced a slightly weaker association, but the ranking of blocks by surface temperature was almost unchanged. Excluding the warmest summer in the record does not alter the direction of any reported effect.",
  },

  // Discussion
  { id: "h-discussion", sectionId: "discussion", kind: "heading", text: "Discussion" },
  {
    id: "disc-1",
    sectionId: "discussion",
    kind: "paragraph",
    text:
      "Our findings are consistent with earlier work showing that tree canopy provides measurable surface cooling in temperate cities (Lindell, 2021). These results suggest that canopy expansion in low-cover districts could reduce surface heat exposure, although land surface temperature is not a direct measure of the air temperature experienced by residents.",
  },
  {
    id: "disc-2",
    sectionId: "discussion",
    kind: "paragraph",
    text:
      "Canopy cooling was weaker along the river corridor than in the industrial east, where it was partly offset by heat released from large warehouse roofs. This represents an unique challenge for planners, because the blocks with the most to gain are also those with the least space for new planting.",
  },
  {
    id: "disc-planning",
    sectionId: "discussion",
    kind: "paragraph",
    text:
      "For municipal planning, the results point to a practical order of priorities. Where street width allows, new planting is likely to deliver the largest gains in dense residential blocks with little existing canopy. In industrial districts, where space for trees is limited, reflective roofing and the removal of unnecessary paving may need to complement planting. Canopy targets expressed as a single city-wide percentage risk obscuring these differences between districts.",
  },
  {
    id: "disc-3",
    sectionId: "discussion",
    kind: "paragraph",
    text:
      "Several limitations should be noted. Satellite overpasses capture conditions at a single time of day, and 30 m thermal pixels blur the edges of small parks. Future work should combine mobile air-temperature transects with canopy mapping in order to assess night-time conditions, and should test whether new plantings deliver the cooling predicted by cross-sectional models.",
  },

  // References
  { id: "h-references", sectionId: "references", kind: "heading", text: "References" },
  {
    id: "ref-1",
    sectionId: "references",
    kind: "reference",
    refId: "r1",
    text: "Marsh, J. and Idowu, T. (2017) Heat, health and the built environment: a review of urban vulnerability. Journal of Urban Health Studies, 12(3), pp. 211-229.",
  },
  {
    id: "ref-2",
    sectionId: "references",
    kind: "reference",
    refId: "r2",
    text: "Lindell, K. (2020) Street trees and surface cooling in temperate cities. Urban Climate Letters, 8, pp. 44–58.",
  },
  {
    id: "ref-3",
    sectionId: "references",
    kind: "reference",
    refId: "r3",
    text: "Okafor, R., Brandt, S. and Leclerc, M. (2019) Satellite thermal imagery for neighbourhood heat mapping. Remote Sensing of Cities, 5(2), pp. 97–110.",
  },
];

export function sectionTitle(sectionId: string): string {
  return SECTIONS.find((s) => s.id === sectionId)?.title ?? sectionId;
}
