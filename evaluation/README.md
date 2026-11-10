# Recall evaluation set

The challenge's example questions should be treated as regression tests, not just demo prompts.

For every case, record:
- whether the correct prior conversation was retrieved;
- whether a relative or explicit date was resolved to the expected local day;
- whether the search tool was used for current claims;
- whether each factual claim has a valid source;
- whether changed, unchanged and unverified claims are distinguished correctly.

## Starter scenarios

1. Explicit recall: "What did I ask you on 3 November?"
2. Relative recall: "What did we discuss last Tuesday?"
3. Historical comparison: "Last Tuesday I asked about Postgres hosting. Has pricing changed?"
4. Multi-entity comparison: "On Monday we shortlisted five CRM tools. Has pricing or a major release changed?"
5. Missing history: ask about a date before any messages have been stored.
6. No historical baseline: ask whether a current price changed without an earlier price snapshot.
7. Plan mismatch: compare a free plan with a paid plan and ensure they are not treated as equivalent.
8. Billing mismatch: monthly versus annual prices.
9. Region mismatch: prices in different currencies or regions.
10. Search outage: verify that the response says search was unavailable and does not pretend to be current.

The current unit tests cover deterministic date, intent and result-parser behavior. End-to-end evaluation against the local model remains a manual step because CI should not download multi-gigabyte model weights.
