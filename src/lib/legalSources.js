export const LEGAL_SOURCES = [
  {
    id: "nigerian-federal-laws-index",
    name: "The Laws of the Federation of Nigeria — historical repository index",
    publisher: "International Centre for Nigerian Law (repository mirror)",
    jurisdiction: "Federal",
    type: "legislation_index",
    url: "https://github.com/mykeels/nigerian-laws",
    indexUrl: "https://raw.githubusercontent.com/mykeels/nigerian-laws/master/README.md",
    baseUrl: "https://raw.githubusercontent.com/mykeels/nigerian-laws/master/",
    status: "Historical collection; not a current consolidated statement of Nigerian law",
    retrieval: "github-markdown-index"
  },
  {
    id: "national-assembly",
    name: "National Assembly of Nigeria",
    publisher: "National Assembly of Nigeria",
    jurisdiction: "Federal",
    type: "official_reference_portal",
    url: "https://nass.gov.ng/",
    status: "Official portal; individual legislation must be located and checked"
  },
  {
    id: "federal-ministry-justice",
    name: "Federal Ministry of Justice",
    publisher: "Federal Ministry of Justice",
    jurisdiction: "Federal",
    type: "official_reference_portal",
    url: "https://www.justice.gov.ng/",
    status: "Official portal; publication and currentness must be checked per document"
  },
  {
    id: "supreme-court",
    name: "Supreme Court of Nigeria",
    publisher: "Supreme Court of Nigeria",
    jurisdiction: "Federal",
    type: "official_reference_portal",
    url: "https://supremecourt.gov.ng/",
    status: "Official court portal; judgments must be located and checked individually"
  }
];

export const RETRIEVABLE_LEGAL_SOURCES = LEGAL_SOURCES.filter(source => source.retrieval === "github-markdown-index");
