/**
 * Tests for the info command (cm --info).
 */
import { describe, it, expect } from "bun:test";
import { gatherInfo, InfoResult } from "../src/info.js";

describe("info command", () => {
  describe("gatherInfo", () => {
    it("returns structured info object", async () => {
      const info = await gatherInfo();

      // Version
      expect(typeof info.version).toBe("string");
      expect(info.version.length).toBeGreaterThan(0);

      // Configuration
      expect(info.configuration).toBeDefined();
      expect(info.configuration.globalConfig).toBeDefined();
      expect(typeof info.configuration.globalConfig.path).toBe("string");
      expect(typeof info.configuration.globalConfig.exists).toBe("boolean");

      expect(info.configuration.globalPlaybook).toBeDefined();
      expect(typeof info.configuration.globalPlaybook.path).toBe("string");
      expect(typeof info.configuration.globalPlaybook.exists).toBe("boolean");

      // Environment
      expect(info.environment).toBeDefined();
      expect(info.environment.OPENAI_API_KEY).toBeDefined();
      expect(typeof info.environment.OPENAI_API_KEY.set).toBe("boolean");

      // Dependencies
      expect(info.dependencies).toBeDefined();
      expect(info.dependencies.node).toBeDefined();
      expect(info.dependencies.node.version).toMatch(/^v?\d+\.\d+/);
    });

    it("masks API keys correctly", async () => {
      const originalKey = process.env.OPENAI_API_KEY;
      try {
        // Set a test key
        process.env.OPENAI_API_KEY = "sk-test1234567890abcdefghij";
        const info = await gatherInfo();

        expect(info.environment.OPENAI_API_KEY.set).toBe(true);
        expect(info.environment.OPENAI_API_KEY.masked).toBe("sk-...ghij");
        // Ensure the full key is NOT in the output
        expect(info.environment.OPENAI_API_KEY.masked).not.toContain("1234567890");
      } finally {
        if (originalKey !== undefined) {
          process.env.OPENAI_API_KEY = originalKey;
        } else {
          delete process.env.OPENAI_API_KEY;
        }
      }
    });

    it("detects cass CLI availability", async () => {
      const info = await gatherInfo();

      // cass dependency info should be present
      expect(info.dependencies.cass).toBeDefined();
      expect(typeof info.dependencies.cass.available).toBe("boolean");

      // If available, version should be a string
      if (info.dependencies.cass.available) {
        expect(typeof info.dependencies.cass.version).toBe("string");
      }
    });

    it("detects Bun runtime", async () => {
      const info = await gatherInfo();

      // When running under Bun (which we are), bun should be available
      expect(info.dependencies.bun).toBeDefined();
      expect(info.dependencies.bun.available).toBe(true);
      expect(typeof info.dependencies.bun.version).toBe("string");
    });

    it("includes workspace playbook info when in repo", async () => {
      const info = await gatherInfo();

      // We're running in the cass_memory_system repo which has .cass/
      expect(info.configuration.workspacePlaybook.path).not.toBeNull();
    });
  });
});
