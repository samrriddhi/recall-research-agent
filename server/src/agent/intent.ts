export interface QueryIntent {
  historicalRecall: boolean;
  currentResearch: boolean;
  comparison: boolean;
  shouldSearch: boolean;
}

const HISTORY_PATTERN = /\b(what did i ask|what did we discuss|asked you|told me|previous conversation|previous answer|earlier answer|last answer|your answer|what did you answer|last time|we talked about|we discussed)\b/i;
const COMPARISON_PATTERN = /\b(changed?|change|since then|still correct|still accurate|what's new|anything new|shipped|release(?:d)?|pricing|price|updated|update|compare|versus|vs)\b/i;
const RESEARCH_PATTERN = /\b(search|research|look up|find out|latest|current|today|now|recent|best|who is|what is|how does|how much|where can i)\b/i;

export function classifyIntent(message: string): QueryIntent {
  const historicalRecall = HISTORY_PATTERN.test(message)
    || /\b(last|on)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}\s+[a-z]+)\b/i.test(message);
  const comparison = COMPARISON_PATTERN.test(message);
  const currentResearch = comparison || RESEARCH_PATTERN.test(message);

  return {
    historicalRecall,
    currentResearch,
    comparison,
    shouldSearch: currentResearch
  };
}
