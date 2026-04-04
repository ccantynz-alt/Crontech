import { describe, test, expect } from "bun:test";
import {
  sanitizeHTML,
  sanitizeSQL,
  sanitizeXSS,
  validateURL,
  sanitizeInput,
  sanitizeEmail,
  validatePath,
  detectSQLInjection,
} from "./input-sanitizer";

describe("sanitizeHTML", () => {
  test("strips script tags and their content", () => {
    const input = '<p>Hello</p><script>alert("xss")</script><p>World</p>';
    const result = sanitizeHTML(input);
    expect(result).not.toContain("<script");
    expect(result).not.toContain("alert");
    expect(result).toContain("<p>Hello</p>");
    expect(result).toContain("<p>World</p>");
  });

  test("strips iframe tags", () => {
    const input = '<div><iframe src="https://evil.com"></iframe></div>';
    const result = sanitizeHTML(input);
    expect(result).not.toContain("<iframe");
    expect(result).not.toContain("evil.com");
  });

  test("strips object and embed tags", () => {
    const input = '<object data="malware.swf"></object><embed src="malware.swf">';
    const result = sanitizeHTML(input);
    expect(result).not.toContain("<object");
    expect(result).not.toContain("<embed");
  });

  test("strips event handler attributes", () => {
    const input = '<img src="x" onerror="alert(1)">';
    const result = sanitizeHTML(input);
    expect(result).not.toContain("onerror");
    expect(result).not.toContain("alert");
  });

  test("strips onmouseover attributes", () => {
    const input = '<div onmouseover="steal()">Hover me</div>';
    const result = sanitizeHTML(input);
    expect(result).not.toContain("onmouseover");
    expect(result).not.toContain("steal");
  });

  test("neutralizes javascript: URIs in href", () => {
    const input = '<a href="javascript:alert(1)">Click</a>';
    const result = sanitizeHTML(input);
    expect(result).not.toContain("javascript:");
  });

  test("neutralizes data: URIs in src", () => {
    const input = '<img src="data:text/html,<script>alert(1)</script>">';
    const result = sanitizeHTML(input);
    expect(result).not.toContain("data:text/html");
  });

  test("preserves safe HTML tags", () => {
    const input = "<p>Hello <strong>world</strong> and <em>goodbye</em></p>";
    const result = sanitizeHTML(input);
    expect(result).toContain("<p>");
    expect(result).toContain("<strong>");
    expect(result).toContain("<em>");
  });

  test("strips form tags", () => {
    const input = '<form action="https://evil.com/steal"><input type="password"></form>';
    const result = sanitizeHTML(input);
    expect(result).not.toContain("<form");
    expect(result).not.toContain("<input");
  });

  test("strips svg tags (potential XSS vector)", () => {
    const input = '<svg onload="alert(1)"><circle r="10"></circle></svg>';
    const result = sanitizeHTML(input);
    expect(result).not.toContain("<svg");
  });

  test("handles nested dangerous content", () => {
    const input = '<script><script>alert(1)</script></script>';
    const result = sanitizeHTML(input);
    expect(result).not.toContain("<script");
    expect(result).not.toContain("alert");
  });
});

describe("sanitizeSQL", () => {
  test("escapes single quotes", () => {
    const input = "O'Brien";
    const result = sanitizeSQL(input);
    expect(result).toBe("O''Brien");
  });

  test("removes semicolons", () => {
    const input = "1; DROP TABLE users;";
    const result = sanitizeSQL(input);
    expect(result).not.toContain(";");
  });

  test("removes SQL comments", () => {
    const input = "admin'--";
    const result = sanitizeSQL(input);
    expect(result).not.toContain("--");
  });

  test("removes block comments", () => {
    const input = "admin'/**/OR/**/1=1";
    const result = sanitizeSQL(input);
    expect(result).not.toContain("/*");
    expect(result).not.toContain("*/");
  });

  test("removes null bytes", () => {
    const input = "test\0injection";
    const result = sanitizeSQL(input);
    expect(result).not.toContain("\0");
  });

  test("escapes backslashes", () => {
    const input = "test\\injection";
    const result = sanitizeSQL(input);
    expect(result).toBe("test\\\\injection");
  });
});

describe("detectSQLInjection", () => {
  test("detects UNION SELECT", () => {
    expect(detectSQLInjection("1 UNION SELECT * FROM users")).toBe(true);
  });

  test("detects OR 1=1", () => {
    expect(detectSQLInjection("' OR 1=1")).toBe(true);
  });

  test("detects DROP TABLE", () => {
    expect(detectSQLInjection("'; DROP TABLE users")).toBe(true);
  });

  test("detects WAITFOR DELAY (time-based)", () => {
    expect(detectSQLInjection("'; WAITFOR DELAY '0:0:5'")).toBe(true);
  });

  test("detects BENCHMARK (MySQL)", () => {
    expect(detectSQLInjection("1 AND BENCHMARK(1000000,SHA1('test'))")).toBe(true);
  });

  test("allows normal input", () => {
    expect(detectSQLInjection("John Smith")).toBe(false);
    expect(detectSQLInjection("user@example.com")).toBe(false);
    expect(detectSQLInjection("Hello World 2024")).toBe(false);
  });
});

describe("sanitizeXSS", () => {
  test("encodes HTML angle brackets", () => {
    const input = "<script>alert('xss')</script>";
    const result = sanitizeXSS(input);
    expect(result).not.toContain("<");
    expect(result).not.toContain(">");
    expect(result).toContain("&lt;");
    expect(result).toContain("&gt;");
  });

  test("encodes double quotes", () => {
    const input = 'value="test"';
    const result = sanitizeXSS(input);
    expect(result).toContain("&quot;");
  });

  test("encodes single quotes", () => {
    const input = "value='test'";
    const result = sanitizeXSS(input);
    expect(result).toContain("&#x27;");
  });

  test("encodes ampersands", () => {
    const input = "a & b";
    const result = sanitizeXSS(input);
    expect(result).toContain("&amp;");
  });

  test("removes null bytes", () => {
    const input = "test\0value";
    const result = sanitizeXSS(input);
    expect(result).not.toContain("\0");
  });

  test("removes control characters", () => {
    const input = "test\x07\x08value";
    const result = sanitizeXSS(input);
    expect(result).not.toContain("\x07");
    expect(result).not.toContain("\x08");
  });

  test("handles complex XSS payloads", () => {
    const input = '"><img src=x onerror=alert(1)>';
    const result = sanitizeXSS(input);
    expect(result).not.toContain("<");
    expect(result).not.toContain(">");
  });
});

describe("validateURL", () => {
  test("allows valid HTTPS URLs", () => {
    expect(validateURL("https://example.com")).toBe(true);
    expect(validateURL("https://api.example.com/v1/data")).toBe(true);
  });

  test("allows valid HTTP URLs", () => {
    expect(validateURL("http://example.com")).toBe(true);
  });

  test("blocks invalid URLs", () => {
    expect(validateURL("not-a-url")).toBe(false);
    expect(validateURL("")).toBe(false);
  });

  test("blocks javascript: protocol", () => {
    expect(validateURL("javascript:alert(1)")).toBe(false);
  });

  test("blocks file: protocol", () => {
    expect(validateURL("file:///etc/passwd")).toBe(false);
  });

  test("blocks ftp: protocol", () => {
    expect(validateURL("ftp://internal-server/files")).toBe(false);
  });

  test("blocks localhost", () => {
    expect(validateURL("http://localhost")).toBe(false);
    expect(validateURL("http://localhost:3000")).toBe(false);
  });

  test("blocks loopback addresses", () => {
    expect(validateURL("http://127.0.0.1")).toBe(false);
    expect(validateURL("http://127.0.0.1:8080")).toBe(false);
  });

  test("blocks private IP ranges (10.x.x.x)", () => {
    expect(validateURL("http://10.0.0.1")).toBe(false);
    expect(validateURL("http://10.255.255.255")).toBe(false);
  });

  test("blocks private IP ranges (172.16-31.x.x)", () => {
    expect(validateURL("http://172.16.0.1")).toBe(false);
    expect(validateURL("http://172.31.255.255")).toBe(false);
  });

  test("blocks private IP ranges (192.168.x.x)", () => {
    expect(validateURL("http://192.168.1.1")).toBe(false);
    expect(validateURL("http://192.168.0.0")).toBe(false);
  });

  test("blocks link-local addresses", () => {
    expect(validateURL("http://169.254.169.254")).toBe(false); // AWS metadata
  });

  test("blocks GCP metadata endpoint", () => {
    expect(validateURL("http://metadata.google.internal")).toBe(false);
  });

  test("blocks credentials in URL", () => {
    expect(validateURL("http://user:pass@example.com")).toBe(false);
  });

  test("blocks numeric IP encoding", () => {
    expect(validateURL("http://2130706433")).toBe(false); // 127.0.0.1 as decimal
  });

  test("blocks hex-encoded IP", () => {
    expect(validateURL("http://0x7f000001")).toBe(false); // 127.0.0.1 as hex
  });

  test("blocks dangerous internal ports", () => {
    expect(validateURL("http://example.com:6379")).toBe(false); // Redis
    expect(validateURL("http://example.com:3306")).toBe(false); // MySQL
    expect(validateURL("http://example.com:5432")).toBe(false); // PostgreSQL
    expect(validateURL("http://example.com:27017")).toBe(false); // MongoDB
  });

  test("allows standard ports", () => {
    expect(validateURL("https://example.com:443")).toBe(true);
    expect(validateURL("http://example.com:80")).toBe(true);
    expect(validateURL("https://example.com:8080")).toBe(true);
  });
});

describe("sanitizeInput", () => {
  test("trims whitespace", () => {
    expect(sanitizeInput("  hello  ")).toBe("hello");
  });

  test("removes null bytes", () => {
    expect(sanitizeInput("hello\0world")).toBe("helloworld");
  });

  test("enforces max length", () => {
    const input = "a".repeat(20000);
    const result = sanitizeInput(input, 100);
    expect(result.length).toBe(100);
  });

  test("removes control characters", () => {
    expect(sanitizeInput("hello\x07world")).toBe("helloworld");
  });

  test("preserves normal whitespace", () => {
    expect(sanitizeInput("hello world")).toBe("hello world");
    expect(sanitizeInput("hello\nworld")).toBe("hello\nworld");
  });
});

describe("sanitizeEmail", () => {
  test("accepts valid emails", () => {
    expect(sanitizeEmail("user@example.com")).toBe("user@example.com");
    expect(sanitizeEmail("USER@Example.COM")).toBe("user@example.com");
  });

  test("rejects invalid emails", () => {
    expect(sanitizeEmail("not-an-email")).toBeNull();
    expect(sanitizeEmail("@example.com")).toBeNull();
    expect(sanitizeEmail("user@")).toBeNull();
  });

  test("rejects excessively long emails", () => {
    const longEmail = `${"a".repeat(250)}@example.com`;
    expect(sanitizeEmail(longEmail)).toBeNull();
  });

  test("trims whitespace", () => {
    expect(sanitizeEmail("  user@example.com  ")).toBe("user@example.com");
  });
});

describe("validatePath", () => {
  test("allows safe relative paths", () => {
    expect(validatePath("documents/file.pdf")).toBe(true);
    expect(validatePath("images/photo.jpg")).toBe(true);
  });

  test("blocks path traversal with ..", () => {
    expect(validatePath("../etc/passwd")).toBe(false);
    expect(validatePath("documents/../../etc/passwd")).toBe(false);
  });

  test("blocks absolute paths", () => {
    expect(validatePath("/etc/passwd")).toBe(false);
    expect(validatePath("C:\\Windows\\system32")).toBe(false);
  });

  test("blocks UNC paths", () => {
    expect(validatePath("\\\\server\\share")).toBe(false);
  });

  test("blocks null bytes", () => {
    expect(validatePath("file.txt\0.jpg")).toBe(false);
  });

  test("blocks URL-encoded traversal", () => {
    expect(validatePath("%2e%2e/etc/passwd")).toBe(false);
  });

  test("blocks tilde (home directory)", () => {
    expect(validatePath("~/secret")).toBe(false);
  });
});
