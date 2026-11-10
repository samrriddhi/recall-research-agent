const CONTEXT_TERMS = /\b(shortlist(?:ed)?|compare[ds]?|postgres(?:ql)?|crm|hosting|database|providers?|vendors?|tools?)\b/i;
const CANDIDATE_PATTERN = /\b[A-Z][A-Za-z0-9&+.-]{1,}(?:\s+[A-Z][A-Za-z0-9&+.-]{1,}){0,2}\b/g;
const IGNORED_NAMES = new Set([
  "We", "The", "Our", "For", "From", "Your", "You", "This", "That",
  "Last", "On", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
  "Saturday", "Sunday", "November", "December", "January", "February",
  "March", "April", "May", "June", "July", "August", "September",
  "October", "Team", "Tools", "Providers", "Vendors", "CRM"
]);

const RESEARCH_TERMS = /\b(pricing|prices?|plans?|features?|releases?|changelog|updates?|shipped|changed?|hosting|database|sales|cloud|CRM|Postgres(?:SQL)?)\b/gi;

/**
 * Build a minimal search query from entities in relevant shortlist messages
 * and the research attributes in the current question. This avoids sending
 * whole historical messages to the public search provider on fallback paths.
 */
export function planSearchQuery(
  question: string,
  memory: Array<{ content: string }>
): string {
  const relevantHistory = memory
    .filter((message) => CONTEXT_TERMS.test(message.content))
    .map((message) => message.content)
    .join(" ");

  const names = relevantHistory.match(CANDIDATE_PATTERN) ?? [];
  const entities = [...new Set(names)]
    .filter((name) => !IGNORED_NAMES.has(name))
    .slice(0, 8);

  const attributes = question.match(RESEARCH_TERMS) ?? [];
  const query = [...new Set([...entities, ...attributes])]
    .join(" ")
    .slice(0, 300);

  return query.length >= 2 ? query : question.trim().slice(0, 300);
}
