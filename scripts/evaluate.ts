import { readFile } from "node:fs/promises";
import { resolveDateWindow } from "../server/src/research/date-window.js";
import { classifyIntent } from "../server/src/agent/intent.js";
import { planSearchQueries } from "../server/src/agent/search-planner.js";

interface EvaluationCase {
  id: string;
  category: "date" | "date-none" | "intent";
  question: string;
  referenceTime?: string;
  timeZone?: string;
  expectedFrom?: string;
  expectedTo?: string;
  expectedSearch?: boolean;
  expectedComparison?: boolean;
  expectedHistoricalRecall?: boolean;
}

const cases = JSON.parse(
  await readFile(new URL("../evaluation/cases.json", import.meta.url), "utf8")
) as EvaluationCase[];

const failures: string[] = [];
for (const testCase of cases) {
  if (testCase.category === "date" || testCase.category === "date-none") {
    const actual = resolveDateWindow(
      testCase.question,
      testCase.referenceTime,
      testCase.timeZone
    );

    if (testCase.category === "date-none") {
      if (actual !== undefined) failures.push(testCase.id + ": expected no date window");
      continue;
    }

    if (!actual) {
      failures.push(testCase.id + ": expected a date window");
      continue;
    }
    if (actual.from !== testCase.expectedFrom) {
      failures.push(testCase.id + ": expected from " + testCase.expectedFrom + ", got " + actual.from);
    }
    if (actual.to !== testCase.expectedTo) {
      failures.push(testCase.id + ": expected to " + testCase.expectedTo + ", got " + actual.to);
    }
    continue;
  }

  const intent = classifyIntent(testCase.question);
  if (testCase.expectedSearch !== undefined && intent.shouldSearch !== testCase.expectedSearch) {
    failures.push(testCase.id + ": search intent mismatch");
  }
  if (testCase.expectedComparison !== undefined && intent.comparison !== testCase.expectedComparison) {
    failures.push(testCase.id + ": comparison intent mismatch");
  }
  if (testCase.expectedHistoricalRecall !== undefined && intent.historicalRecall !== testCase.expectedHistoricalRecall) {
    failures.push(testCase.id + ": historical recall intent mismatch");
  }
}

const shortlistQueries = planSearchQueries(
  "Has any of them changed pricing or shipped something big since?",
  [{ content: "We shortlisted HubSpot, Salesforce, and Pipedrive for a sales team." }]
);
if (shortlistQueries.length !== 3) {
  failures.push("shortlist-entity-sweep: expected three independent search queries");
}

console.log("Recall deterministic evaluation");
console.log("Cases: " + cases.length + " | Checks: " + (cases.length + 1));
console.log("Passed: " + (cases.length + 1 - failures.length));
console.log("Failed: " + failures.length);
for (const failure of failures) console.error(" - " + failure);

if (failures.length > 0) process.exitCode = 1;
