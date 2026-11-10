import { describe, expect, it } from "vitest";
import { planSearchQuery } from "../src/agent/search-planner.js";

describe("planSearchQuery", () => {
  it("carries product names from prior shortlists into a follow-up search", () => {
    const result = planSearchQuery(
      "Has any of them changed pricing or shipped something big since?",
      [{
        content: "We shortlisted HubSpot, Salesforce, and Pipedrive for a 20-person sales team."
      }]
    );

    expect(result).toContain("HubSpot");
    expect(result).toContain("Salesforce");
    expect(result).toContain("Pipedrive");
    expect(result.toLowerCase()).toContain("pricing");
    expect(result).not.toContain("20-person sales team");
  });

  it("does not include unrelated historical messages", () => {
    const result = planSearchQuery("What are the current PostgreSQL hosting prices?", [
      { content: "My personal schedule is Monday and Thursday." }
    ]);

    expect(result).not.toContain("Monday");
    expect(result.toLowerCase()).toContain("postgresql");
    expect(result.toLowerCase()).toContain("prices");
  });
});
