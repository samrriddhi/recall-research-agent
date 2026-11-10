# Recall evaluation

The benchmark is split into two layers.

## Deterministic evaluation

Run:

```bash
npm run evaluate
```

The deterministic suite checks date-window resolution, user-local day boundaries, intent classification and whether an indirect follow-up produces independent queries for each previously shortlisted entity. These checks do not call a model or the public web, so they run quickly in CI and do not incur usage charges.

## Live agent evaluation

The local-model evaluation is intentionally separate because CI should not download model weights or make public search requests. Run these cases manually after installing Ollama and pulling the configured model:

1. **Historical recall:** ask about a date on which a conversation was saved. The answer must name the actual topic and distinguish user messages from assistant claims.
2. **Relative date:** ask what was discussed "last Tuesday". The result should match the user's local calendar day.
3. **Shortlist follow-up:** save a conversation naming several CRM providers, then ask whether any changed pricing or shipped a major feature. Check that every shortlisted entity receives a search query.
4. **Missing history:** ask about a date before any local conversation exists. The agent must say it cannot find the discussion.
5. **No baseline:** ask whether a price changed when no old price was saved. The agent must not infer a change from a current price page.
6. **Plan mismatch:** compare free and paid tiers without treating them as the same plan.
7. **Billing mismatch:** distinguish monthly prices from annual-billing equivalents.
8. **Region mismatch:** do not compare currencies or regional plan pages as if they were identical.
9. **Conflicting sources:** surface conflicts and prefer first-party provider pages where available.
10. **Search outage:** verify that the agent reports the search failure and does not claim a current verification.

Record retrieval precision/recall, date accuracy, source coverage and unsupported-claim rate. Do not report a live-agent score until each case has been run and reviewed.
