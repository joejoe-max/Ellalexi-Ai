const SECTION_DEFINITIONS = [
  ["parties", "People", "people"], ["clauses", "Clauses", "clauses"],
  ["rightsAndObligations", "Rights & duties", "obligations"], ["risks", "Issues", "risks"],
  ["moneyMatters", "Money", "money"], ["missingProtections", "Protections", "protections"],
  ["questions", "Questions", "questions"], ["crossDocumentFindings", "Across documents", "cross-documents"],
  ["limitations", "Limitations", "limitations"]
];
export function getWorkspaceSections(analysis = {}) {
  return SECTION_DEFINITIONS.filter(([key]) => Array.isArray(analysis?.[key]) && analysis[key].length > 0)
    .map(([key, label, id]) => ({ key, label, id, count: analysis[key].length }));
}
