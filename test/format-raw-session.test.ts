import { describe, expect, it } from "bun:test";
import { formatRawSession } from "../src/diary.js";

describe("formatRawSession", () => {
  // =========================================================================
  // Markdown (.md) files
  // =========================================================================
  describe("markdown files", () => {
    it("returns markdown content as-is", () => {
      const content = "# Session Notes\n\nThis is **markdown** content.";
      expect(formatRawSession(content, ".md")).toBe(content);
    });

    it("handles .markdown extension", () => {
      const content = "# Title\n\nParagraph here.";
      expect(formatRawSession(content, ".markdown")).toBe(content);
    });

    it("handles extension without leading dot", () => {
      const content = "Plain text content";
      expect(formatRawSession(content, "md")).toBe(content);
    });

    it("preserves empty markdown content", () => {
      expect(formatRawSession("", ".md")).toBe("");
    });
  });

  // =========================================================================
  // JSONL (.jsonl) files
  // =========================================================================
  describe("JSONL files", () => {
    it("formats single JSONL line", () => {
      const content = '{"role":"user","content":"Hello"}';
      expect(formatRawSession(content, ".jsonl")).toBe("**user**: Hello");
    });

    it("formats multiple JSONL lines", () => {
      const content = '{"role":"user","content":"Hello"}\n{"role":"assistant","content":"Hi there!"}';
      expect(formatRawSession(content, ".jsonl")).toBe(
        "**user**: Hello\n\n**assistant**: Hi there!"
      );
    });

    it("handles empty lines between JSON entries", () => {
      const content = '{"role":"user","content":"First"}\n\n{"role":"assistant","content":"Second"}';
      expect(formatRawSession(content, ".jsonl")).toBe(
        "**user**: First\n\n**assistant**: Second"
      );
    });

    it("uses [unknown] for missing role", () => {
      const content = '{"content":"No role here"}';
      expect(formatRawSession(content, ".jsonl")).toBe("**[unknown]**: No role here");
    });

    it("uses [empty] for missing content", () => {
      const content = '{"role":"system"}';
      expect(formatRawSession(content, ".jsonl")).toBe("**system**: [empty]");
    });

    it("marks invalid JSON lines with [PARSE ERROR]", () => {
      const content = '{"role":"user","content":"Good"}\nnot json at all\n{"role":"assistant","content":"Also good"}';
      const result = formatRawSession(content, ".jsonl");
      expect(result).toContain("**user**: Good");
      expect(result).toContain("[PARSE ERROR] not json at all");
      expect(result).toContain("**assistant**: Also good");
    });

    it("handles extension without leading dot", () => {
      const content = '{"role":"user","content":"Test"}';
      expect(formatRawSession(content, "jsonl")).toBe("**user**: Test");
    });

    it("handles whitespace-only lines", () => {
      const content = '{"role":"user","content":"A"}\n   \n{"role":"user","content":"B"}';
      expect(formatRawSession(content, ".jsonl")).toBe("**user**: A\n\n**user**: B");
    });

    it("handles empty JSONL file", () => {
      expect(formatRawSession("", ".jsonl")).toBe("");
    });

    it("handles multiline content in messages", () => {
      const content = '{"role":"user","content":"Line 1\\nLine 2\\nLine 3"}';
      expect(formatRawSession(content, ".jsonl")).toBe("**user**: Line 1\nLine 2\nLine 3");
    });
  });

  // =========================================================================
  // JSON (.json) files
  // =========================================================================
  describe("JSON files", () => {
    it("formats standard messages array format", () => {
      const content = JSON.stringify({
        messages: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi!" }
        ]
      });
      expect(formatRawSession(content, ".json")).toBe(
        "**user**: Hello\n\n**assistant**: Hi!"
      );
    });

    it("formats direct array format", () => {
      const content = JSON.stringify([
        { role: "user", content: "Question" },
        { role: "assistant", content: "Answer" }
      ]);
      expect(formatRawSession(content, ".json")).toBe(
        "**user**: Question\n\n**assistant**: Answer"
      );
    });

    it("formats conversation array format", () => {
      const content = JSON.stringify({
        conversation: [
          { role: "system", content: "You are helpful" },
          { role: "user", content: "Help me" }
        ]
      });
      expect(formatRawSession(content, ".json")).toBe(
        "**system**: You are helpful\n\n**user**: Help me"
      );
    });

    it("formats turns array format", () => {
      const content = JSON.stringify({
        turns: [
          { role: "human", content: "Hi" },
          { role: "ai", content: "Hello" }
        ]
      });
      expect(formatRawSession(content, ".json")).toBe(
        "**human**: Hi\n\n**ai**: Hello"
      );
    });

    it("uses [unknown] for missing role in JSON", () => {
      const content = JSON.stringify({
        messages: [{ content: "No role" }]
      });
      expect(formatRawSession(content, ".json")).toBe("**[unknown]**: No role");
    });

    it("uses [empty] for missing content in JSON", () => {
      const content = JSON.stringify({
        messages: [{ role: "user" }]
      });
      expect(formatRawSession(content, ".json")).toBe("**user**: [empty]");
    });

    it("warns on unrecognized JSON structure", () => {
      const content = JSON.stringify({ foo: "bar", baz: 123 });
      const result = formatRawSession(content, ".json");
      expect(result).toContain("WARNING: Unrecognized JSON structure");
      expect(result).toContain(content);
    });

    it("returns parse error for invalid JSON", () => {
      const content = "{ not valid json }";
      const result = formatRawSession(content, ".json");
      expect(result).toContain("[PARSE ERROR:");
      expect(result).toContain(content);
    });

    it("handles empty messages array", () => {
      const content = JSON.stringify({ messages: [] });
      expect(formatRawSession(content, ".json")).toBe("");
    });

    it("handles extension without leading dot", () => {
      const content = JSON.stringify({
        messages: [{ role: "user", content: "Test" }]
      });
      expect(formatRawSession(content, "json")).toBe("**user**: Test");
    });

    it("handles nested message content", () => {
      const content = JSON.stringify({
        messages: [{ role: "user", content: "Code:\n```js\nconsole.log('hi');\n```" }]
      });
      const result = formatRawSession(content, ".json");
      expect(result).toContain("**user**: Code:");
      expect(result).toContain("```js");
    });
  });

  // =========================================================================
  // Unsupported formats
  // =========================================================================
  describe("unsupported formats", () => {
    it("returns warning for .txt files", () => {
      const content = "Plain text content";
      const result = formatRawSession(content, ".txt");
      expect(result).toContain("WARNING: Unsupported session format (.txt)");
      expect(result).toContain(content);
    });

    it("returns warning for .yaml files", () => {
      const content = "key: value\nlist:\n  - item1";
      const result = formatRawSession(content, ".yaml");
      expect(result).toContain("WARNING: Unsupported session format (.yaml)");
      expect(result).toContain(content);
    });

    it("returns warning for .xml files", () => {
      const content = "<root><message>Hello</message></root>";
      const result = formatRawSession(content, ".xml");
      expect(result).toContain("WARNING: Unsupported session format (.xml)");
      expect(result).toContain(content);
    });

    it("handles unknown extension without dot", () => {
      const content = "Some content";
      const result = formatRawSession(content, "unknown");
      expect(result).toContain("WARNING: Unsupported session format (.unknown)");
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================
  describe("edge cases", () => {
    it("handles case-insensitive extensions", () => {
      const mdContent = "# Markdown";
      expect(formatRawSession(mdContent, ".MD")).toBe(mdContent);
      expect(formatRawSession(mdContent, ".Md")).toBe(mdContent);

      const jsonlContent = '{"role":"user","content":"Hi"}';
      expect(formatRawSession(jsonlContent, ".JSONL")).toBe("**user**: Hi");
    });

    it("handles very long content", () => {
      const longMessage = "A".repeat(10000);
      const content = JSON.stringify({ messages: [{ role: "user", content: longMessage }] });
      const result = formatRawSession(content, ".json");
      expect(result).toContain("**user**:");
      expect(result).toContain(longMessage);
    });

    it("handles unicode in content", () => {
      const content = '{"role":"user","content":"Hello \u4e16\u754c \ud83d\udc4b"}';
      expect(formatRawSession(content, ".jsonl")).toBe("**user**: Hello 世界 👋");
    });

    it("handles special characters in role names", () => {
      const content = '{"role":"user-agent","content":"Message"}';
      expect(formatRawSession(content, ".jsonl")).toBe("**user-agent**: Message");
    });

    it("handles null values in JSON", () => {
      const content = '{"role":null,"content":null}';
      // null values should fall back to defaults
      expect(formatRawSession(content, ".jsonl")).toBe("**[unknown]**: [empty]");
    });
  });
});
