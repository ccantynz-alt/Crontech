import { describe, test, expect } from "bun:test";
import {
  filterAIOutput,
  addContentProvenance,
  detectPII,
  detectProfanity,
  ContentFilterResultSchema,
  ContentProvenanceSchema,
} from "./content-filter";

describe("filterAIOutput", () => {
  describe("PII Detection", () => {
    test("detects and redacts email addresses", () => {
      const result = filterAIOutput("Contact us at admin@example.com for help");
      expect(result.safe).toBe(false);
      expect(result.flags).toContain("pii:email");
      expect(result.filtered).toContain("[EMAIL_REDACTED]");
      expect(result.filtered).not.toContain("admin@example.com");
    });

    test("detects and redacts multiple email addresses", () => {
      const result = filterAIOutput("Send to user@test.com and admin@corp.org");
      expect(result.filtered).not.toContain("user@test.com");
      expect(result.filtered).not.toContain("admin@corp.org");
    });

    test("detects and redacts US phone numbers", () => {
      const inputs = [
        "(555) 123-4567",
        "555-123-4567",
        "555.123.4567",
        "+1-555-123-4567",
      ];

      for (const phone of inputs) {
        const result = filterAIOutput(`Call ${phone} for info`);
        expect(result.flags).toContain("pii:phone_us");
        expect(result.filtered).toContain("[PHONE_REDACTED]");
      }
    });

    test("detects and redacts SSN patterns", () => {
      const result = filterAIOutput("SSN: 123-45-6789");
      expect(result.flags).toContain("pii:ssn");
      expect(result.filtered).toContain("[SSN_REDACTED]");
      expect(result.filtered).not.toContain("123-45-6789");
    });

    test("detects and redacts IP addresses", () => {
      const result = filterAIOutput("Server at 192.168.1.100 responded");
      expect(result.flags).toContain("pii:ip_address");
      expect(result.filtered).toContain("[IP_REDACTED]");
    });

    test("detects multiple PII types in one input", () => {
      const result = filterAIOutput(
        "User admin@test.com with SSN 123-45-6789 called 555-123-4567",
      );
      expect(result.safe).toBe(false);
      expect(result.flags).toContain("pii:email");
      expect(result.flags).toContain("pii:ssn");
      expect(result.flags).toContain("pii:phone_us");
    });
  });

  describe("Profanity Detection", () => {
    test("detects and redacts profanity", () => {
      const result = filterAIOutput("What the fuck is this?");
      expect(result.safe).toBe(false);
      expect(result.flags).toContain("profanity");
      expect(result.filtered).toContain("[REDACTED]");
      expect(result.filtered).not.toContain("fuck");
    });

    test("detects profanity case-insensitively", () => {
      const result = filterAIOutput("That is BULLSHIT");
      expect(result.flags).toContain("profanity");
      expect(result.filtered).not.toMatch(/bullshit/i);
    });
  });

  describe("Copyright Detection", () => {
    test("detects copyright symbol with year", () => {
      const result = filterAIOutput("Content \u00A9 2024 Acme Corp");
      expect(result.flags).toContain("copyright:copyright_symbol");
    });

    test("detects 'Copyright' text", () => {
      const result = filterAIOutput("Copyright 2024 Acme Corp");
      expect(result.flags).toContain("copyright:copyright_text");
    });

    test("detects 'All Rights Reserved'", () => {
      const result = filterAIOutput("Acme Corp. All Rights Reserved.");
      expect(result.flags).toContain("copyright:all_rights_reserved");
    });

    test("detects trademark symbols", () => {
      const result = filterAIOutput("Product\u2122 by Company\u00AE");
      expect(result.flags).toContain("copyright:trademark");
    });

    test("detects license references", () => {
      const result = filterAIOutput("Licensed under the MIT License");
      expect(result.flags).toContain("copyright:license_reference");
    });

    test("copyright content is flagged but not redacted", () => {
      const input = "Copyright 2024 Acme Corp";
      const result = filterAIOutput(input);
      // Copyright is flagged but the text is preserved in filtered output
      expect(result.flags.length).toBeGreaterThan(0);
      expect(result.filtered).toContain("Copyright 2024 Acme Corp");
    });
  });

  describe("Safe Content", () => {
    test("passes clean content without flags", () => {
      const result = filterAIOutput(
        "This is a perfectly normal paragraph about technology.",
      );
      expect(result.safe).toBe(true);
      expect(result.flags).toHaveLength(0);
      expect(result.filtered).toBe(
        "This is a perfectly normal paragraph about technology.",
      );
    });

    test("passes empty string", () => {
      const result = filterAIOutput("");
      expect(result.safe).toBe(true);
      expect(result.flags).toHaveLength(0);
    });
  });

  describe("Schema validation", () => {
    test("result matches ContentFilterResultSchema", () => {
      const result = filterAIOutput("Test content with admin@test.com");
      const parsed = ContentFilterResultSchema.parse(result);
      expect(parsed.safe).toBe(false);
    });
  });
});

describe("addContentProvenance", () => {
  test("adds provenance metadata", async () => {
    const content = "Generated text content";
    const model = "gpt-4";

    const result = await addContentProvenance(content, model);
    const parsed = JSON.parse(result);

    expect(parsed.content).toBe(content);
    expect(parsed.model).toBe(model);
    expect(parsed.generatedAt).toBeDefined();
    expect(parsed.contentHash).toBeDefined();
    expect(parsed.assertionType).toBe("c2pa.ai.generated");
  });

  test("generates consistent hashes for same content", async () => {
    const result1 = await addContentProvenance("same content", "model-1");
    const result2 = await addContentProvenance("same content", "model-1");

    const parsed1 = JSON.parse(result1);
    const parsed2 = JSON.parse(result2);

    expect(parsed1.contentHash).toBe(parsed2.contentHash);
  });

  test("generates different hashes for different content", async () => {
    const result1 = await addContentProvenance("content A", "model-1");
    const result2 = await addContentProvenance("content B", "model-1");

    const parsed1 = JSON.parse(result1);
    const parsed2 = JSON.parse(result2);

    expect(parsed1.contentHash).not.toBe(parsed2.contentHash);
  });

  test("output validates against ContentProvenanceSchema", async () => {
    const result = await addContentProvenance("test", "model");
    const parsed = JSON.parse(result);
    const validated = ContentProvenanceSchema.parse(parsed);

    expect(validated.assertionType).toBe("c2pa.ai.generated");
  });
});

describe("detectPII", () => {
  test("returns list of detected PII types", () => {
    const result = detectPII("Email: user@test.com, SSN: 123-45-6789");
    expect(result).toContain("email");
    expect(result).toContain("ssn");
  });

  test("returns empty array for clean content", () => {
    const result = detectPII("No personal information here.");
    expect(result).toHaveLength(0);
  });
});

describe("detectProfanity", () => {
  test("detects profanity", () => {
    expect(detectProfanity("What the fuck")).toBe(true);
  });

  test("returns false for clean content", () => {
    expect(detectProfanity("Hello world")).toBe(false);
  });
});
