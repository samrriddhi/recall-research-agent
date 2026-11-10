import { describe, expect, it } from "vitest";
import { planSearchQuery, planSearchQueries } from "../src/agent/search-planner.js";

describe("search planning", () => {
  const shortlist = [{
    content: "We shortlisted HubSpot, Salesforce, and Pipedrive for a 20-person sales team."
  }];

  it("carries product names from prior shortlists into a follow-up search", () => {
    const result = planSearchQuery(
      "Has any of them changed pricing or shipped something big since?",
      shortlist
    );

    expect(result).toContain("HubSpot");
    expect(result).toContain("Salesforce");
    expect(result).toContain("Pipedrive");
    expect(result.toLowerCase()).toContain("pricing");
    expect(result).not.toContain("20-person sales team");
  });

  it("creates a separate query for each shortlisted entity", () => {
    const results = planSearchQueries(
      "Has any of them changed pricing or shipped something big since?",
      shortlist
    );

    expect(results).toHaveLength(3);
    expect(results[0]).toContain("HubSpot");
    expect(results[1]).toContain("Salesforce");
    expect(results[2]).toContain("Pipedrive");
    expect(results.every((query) => query.toLowerCase().includes("pricing"))).toBe(true);
  });

  it("does not include unrelated historical messages", () => {
    const result = planSearchQuery("What are the current PostgreSQL hosting prices?", [
      { content: "My personal schedule is Monday and Thursday." }
    ]);

    expect(result).not.toContain("Monday");
    expect(result.toLowerCase()).toContain("postgresql");
    expect(result.toLowerCase()).toContain("prices");
  });

  it("uses one generic query when no shortlist entities were retrieved", () => {
    const results = planSearchQueries("Compare current PostgreSQL hosting prices.", []);
    expect(results).toHaveLength(1);
    expect(results[0]?.toLowerCase()).toContain("postgresql");
  });
});
