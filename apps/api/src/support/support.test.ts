import { describe, it, expect } from "bun:test";
import { classifyWithRules } from "./classifier";
import { shouldEscalate, ESCALATION_KEYWORDS } from "./escalation-rules";
import { searchKnowledgeBase, KNOWLEDGE_BASE } from "./knowledge-base";

describe("classifier (rule fallback)", () => {
  it("classifies billing emails", () => {
    const result = classifyWithRules(
      "Refund for last invoice",
      "I was charged twice on my card and need a refund.",
    );
    expect(result.category).toBe("billing");
  });

  it("classifies bug reports", () => {
    const result = classifyWithRules(
      "App is broken",
      "I get a 500 error when I click the export button.",
    );
    expect(result.category).toBe("bug");
  });

  it("classifies feature requests with low priority", () => {
    const result = classifyWithRules(
      "Feature request: dark mode",
      "It would be nice if you could add a feature for dark mode.",
    );
    expect(result.category).toBe("feature");
    expect(result.priority).toBe("low");
  });

  it("flags urgent emails", () => {
    const result = classifyWithRules(
      "URGENT: production down",
      "Our production environment is down right now, this is critical.",
    );
    expect(result.priority).toBe("urgent");
  });

  it("falls back to other when no keywords match", () => {
    const result = classifyWithRules("Hello", "Just saying hi");
    expect(result.category).toBe("other");
  });
});

describe("escalation rules", () => {
  it("escalates legal threats", () => {
    expect(shouldEscalate("I will get my lawyer to sue you.")).toBe(true);
  });

  it("escalates GDPR requests", () => {
    expect(shouldEscalate("I am submitting a GDPR request for my data.")).toBe(true);
  });

  it("does not escalate normal questions", () => {
    expect(shouldEscalate("How do I upgrade my plan?")).toBe(false);
  });

  it("has at least 10 escalation keywords", () => {
    expect(ESCALATION_KEYWORDS.length).toBeGreaterThanOrEqual(10);
  });
});

describe("knowledge base", () => {
  it("has at least 30 entries", () => {
    expect(KNOWLEDGE_BASE.length).toBeGreaterThanOrEqual(30);
  });

  it("finds billing entries by keyword", () => {
    const results = searchKnowledgeBase("how do I cancel my subscription");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.entry.category).toBe("billing");
  });

  it("finds API entries", () => {
    const results = searchKnowledgeBase("how do I get an api key");
    expect(results.length).toBeGreaterThan(0);
    const hasApi = results.some((r) => r.entry.category === "api");
    expect(hasApi).toBe(true);
  });

  it("returns empty for unrelated query", () => {
    const results = searchKnowledgeBase("xyzzy plugh");
    expect(results.length).toBe(0);
  });
});

describe("auto-responder pipeline (rule path, no DB)", () => {
  it("classifier + escalation can be composed", async () => {
    const subject = "Refund please, this is a scam";
    const body = "I want a refund. This product is fraud.";
    const classification = classifyWithRules(subject, body);
    const escalate = shouldEscalate(`${subject}\n${body}`);
    expect(classification.category).toBe("billing");
    expect(escalate).toBe(true);
  });
});
