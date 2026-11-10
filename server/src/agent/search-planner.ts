const CONTEXT_TERMS = /\b(shortlist(?:ed)?|compare[ds]?|postgres(?:ql)?|crm|hosting|database|providers?|vendors?|tools?)\b/i;
const CANDIDATE_PATTERN = /\b[A-Z][A-Za-z0-9&+.-]{1,}(?:\s+[A-Z][A-Za-z0-9&+.-]{1,}){0,2}\b/g;
const IGNORED_NAMES = new Set([
  "We", "The", "Our", "For", "From", "Your", "You", "This", "That",
  "Last", "On", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
  "Saturday", "Sunday", "November", "December", "January", "February",
  "March", "April", "May", "June", "July", "August", "September",
  "October", "Team", "Tools", "Providers", "Vendors", "CRM"
]);

const RESEARCH_TERMS = /\b(pricing|prices?|plans?|features?|releases?|changelog|updates?|shipped|changed?|hosting|database|sales|cloud|CRM|(?:PostgreSQL|Postgres))\b/gi;

function extractEntities(memory: Array<{ content: string }>): string[] {
  const relevantHistory = memory
    .filter((message) => CONTEXT_TERMS.test(message.content))
    .map((message) => message.content)
    .join(" ");

  const names = relevantHistory.match(CANDIDATE_PATTERN) ?? [];
  return [...new Set(names)]
    .filter((name) => !IGNORED_NAMES.has(name))
    .slice(0, 5);
}

/**
 * Build a compact query for a single search call. This is also used when the
 * local model declines to invoke its web_search tool.
 */
export function planSearchQuery(
  question: string,
  memory: Array<{ content: string }>
): string {
  const entities = extractEntities(memory);
  const attributes = [...new Set(question.match(RESEARCH_TERMS) ?? [])];
  const query = [...new Set([...entities, ...attributes])]
    .join(" ")
    .slice(0, 300);

  return query.length >= 2 ? query : question.trim().slice(0, 300);
}

/**
 * A single broad result page often misses some members of a shortlist.
 * For comparisons, search each recovered entity separately. The caller caps
 * the number of calls and batches them to avoid flooding a public search page.
 */
export function planSearchQueries(
  question: string,
  memory: Array<{ content: string }>
): string[] {
  const entities = extractEntities(memory);
  const attributes = [...new Set(question.match(RESEARCH_TERMS) ?? [])];
  if (entities.length <= 1 || attributes.length === 0) {
    return [planSearchQuery(question, memory)];
  }

  return entities.map((entity) =>
    (entity + " " + attributes.join(" ")).slice(0, 300)
  );
}
