import { describe, it, expect } from "bun:test";
import {
  loadConfig,
  getDefaultConfig,
  getSanitizeConfig,
  DEFAULT_CONFIG,
} from "../src/config.js";
import type { Config } from "../src/types.js";

describe("config", () => {
  describe("getDefaultConfig()", () => {
    it("returns a deep clone of DEFAULT_CONFIG", () => {
      const config1 = getDefaultConfig();
      const config2 = getDefaultConfig();

      // Should be equal in value
      expect(config1).toEqual(config2);

      // Should be different objects (deep clone)
      expect(config1).not.toBe(config2);
      expect(config1.scoring).not.toBe(config2.scoring);
      expect(config1.sanitization).not.toBe(config2.sanitization);
    });

    it("returns all required fields", () => {
      const config = getDefaultConfig();

      // Core fields
      expect(config.provider).toBe("anthropic");
      expect(config.model).toBe("claude-3-5-sonnet-20241022");
      expect(config.cassPath).toBe("cass");

      // Paths
      expect(config.playbookPath).toBe("~/.cass-memory/playbook.yaml");
      expect(config.diaryDir).toBe("~/.cass-memory/diary");

      // Numeric settings
      expect(config.maxReflectorIterations).toBe(3);
      expect(config.dedupSimilarityThreshold).toBe(0.85);
      expect(config.pruneHarmfulThreshold).toBe(3);
      expect(config.defaultDecayHalfLife).toBe(90);
      expect(config.maxBulletsInContext).toBe(50);
      expect(config.maxHistoryInContext).toBe(10);
      expect(config.sessionLookbackDays).toBe(7);
      expect(config.validationLookbackDays).toBe(90);
      expect(config.relatedSessionsDays).toBe(30);
      expect(config.minRelevanceScore).toBe(0.1);
      expect(config.maxRelatedSessions).toBe(5);

      // Boolean settings
      expect(config.autoReflect).toBe(false);
      expect(config.validationEnabled).toBe(true);
      expect(config.enrichWithCrossAgent).toBe(true);
      expect(config.semanticSearchEnabled).toBe(false);
      expect(config.verbose).toBe(false);
      expect(config.jsonOutput).toBe(false);

      // Nested objects
      expect(config.scoring).toBeDefined();
      expect(config.budget).toBeDefined();
      expect(config.sanitization).toBeDefined();
    });

    it("returns sensible scoring defaults", () => {
      const config = getDefaultConfig();

      expect(config.scoring.decayHalfLifeDays).toBe(90);
      expect(config.scoring.harmfulMultiplier).toBe(4);
      expect(config.scoring.minFeedbackForActive).toBe(3);
      expect(config.scoring.minHelpfulForProven).toBe(10);
      expect(config.scoring.maxHarmfulRatioForProven).toBe(0.1);
    });

    it("returns sensible budget defaults", () => {
      const config = getDefaultConfig();

      expect(config.budget.dailyLimit).toBe(0.10);
      expect(config.budget.monthlyLimit).toBe(2.00);
      expect(config.budget.warningThreshold).toBe(80);
      expect(config.budget.currency).toBe("USD");
    });

    it("returns sensible sanitization defaults", () => {
      const config = getDefaultConfig();

      expect(config.sanitization.enabled).toBe(true);
      expect(config.sanitization.extraPatterns).toEqual([]);
      expect(config.sanitization.auditLog).toBe(false);
    });

    it("mutations to returned config do not affect DEFAULT_CONFIG", () => {
      const config = getDefaultConfig();
      config.provider = "openai";
      config.scoring.decayHalfLifeDays = 30;

      expect(DEFAULT_CONFIG.provider).toBe("anthropic");
      expect(DEFAULT_CONFIG.scoring.decayHalfLifeDays).toBe(90);
    });
  });

  describe("getSanitizeConfig()", () => {
    it("returns defaults when no config provided", () => {
      const sanitize = getSanitizeConfig();

      expect(sanitize.enabled).toBe(true);
      expect(sanitize.extraPatterns).toEqual([]);
      expect(sanitize.auditLog).toBe(false);
    });

    it("returns defaults when config has no sanitization", () => {
      const config = { provider: "openai" } as Config;
      const sanitize = getSanitizeConfig(config);

      expect(sanitize.enabled).toBe(true);
      expect(sanitize.extraPatterns).toEqual([]);
    });

    it("merges config sanitization with defaults", () => {
      const config = {
        sanitization: {
          enabled: false,
          auditLog: true,
        },
      } as Config;

      const sanitize = getSanitizeConfig(config);

      expect(sanitize.enabled).toBe(false);
      expect(sanitize.auditLog).toBe(true);
      expect(sanitize.extraPatterns).toEqual([]); // Default preserved
    });
  });

  describe("loadConfig() with CLI overrides", () => {
    it("CLI overrides take precedence over defaults", async () => {
      const config = await loadConfig({
        provider: "openai",
        verbose: true,
        model: "gpt-4",
      });

      expect(config.provider).toBe("openai"); // CLI override
      expect(config.model).toBe("gpt-4"); // CLI override
      expect(config.verbose).toBe(true); // CLI override
      expect(config.cassPath).toBe("cass"); // Default preserved
    });

    it("deep merges nested objects (scoring)", async () => {
      const config = await loadConfig({
        scoring: {
          harmfulMultiplier: 6, // Override one property
          decayHalfLifeDays: 60,
        },
      } as Partial<Config>);

      expect(config.scoring.decayHalfLifeDays).toBe(60); // CLI override
      expect(config.scoring.harmfulMultiplier).toBe(6); // CLI override
      expect(config.scoring.minFeedbackForActive).toBe(3); // Default preserved
    });

    it("deep merges nested objects (sanitization)", async () => {
      const config = await loadConfig({
        sanitization: {
          enabled: false,
          auditLog: true,
        },
      } as Partial<Config>);

      expect(config.sanitization.enabled).toBe(false); // CLI override
      expect(config.sanitization.auditLog).toBe(true); // CLI override
      expect(config.sanitization.extraPatterns).toEqual([]); // Default preserved
    });

    it("deep merges nested objects (budget)", async () => {
      const config = await loadConfig({
        budget: {
          dailyLimit: 1.00,
          monthlyLimit: 10.00,
        },
      } as Partial<Config>);

      expect(config.budget.dailyLimit).toBe(1.00); // CLI override
      expect(config.budget.monthlyLimit).toBe(10.00); // CLI override
      expect(config.budget.warningThreshold).toBe(80); // Default preserved
      expect(config.budget.currency).toBe("USD"); // Default preserved
    });

    it("respects CASS_MEMORY_VERBOSE environment variable", async () => {
      const originalVerbose = process.env.CASS_MEMORY_VERBOSE;
      try {
        process.env.CASS_MEMORY_VERBOSE = "1";
        const config = await loadConfig();
        expect(config.verbose).toBe(true);
      } finally {
        if (originalVerbose === undefined) {
          delete process.env.CASS_MEMORY_VERBOSE;
        } else {
          process.env.CASS_MEMORY_VERBOSE = originalVerbose;
        }
      }
    });

    it("handles empty CLI overrides", async () => {
      const config = await loadConfig({});
      expect(config.provider).toBeDefined();
      expect(config.model).toBeDefined();
    });
  });

  describe("config validation", () => {
    it("accepts valid provider values", async () => {
      // Test each valid provider
      for (const provider of ["openai", "anthropic", "google"]) {
        const config = await loadConfig({ provider: provider as any });
        expect(config.provider).toBe(provider);
      }
    });

    it("validates schema version", async () => {
      const config = await loadConfig({ schema_version: 1 });
      expect(config.schema_version).toBe(1);
    });

    it("validates numeric constraints", async () => {
      const config = await loadConfig({
        maxBulletsInContext: 100,
        sessionLookbackDays: 30,
        dedupSimilarityThreshold: 0.9,
      });

      expect(config.maxBulletsInContext).toBe(100);
      expect(config.sessionLookbackDays).toBe(30);
      expect(config.dedupSimilarityThreshold).toBe(0.9);
    });
  });

  describe("edge cases", () => {
    it("handles undefined nested objects in overrides", async () => {
      const config = await loadConfig({
        scoring: undefined,
        sanitization: undefined,
      } as Partial<Config>);

      // Defaults should be used
      expect(config.scoring).toBeDefined();
      expect(config.scoring.decayHalfLifeDays).toBe(90);
      expect(config.sanitization).toBeDefined();
      expect(config.sanitization.enabled).toBe(true);
    });

    it("handles partial nested overrides", async () => {
      const config = await loadConfig({
        scoring: {
          decayHalfLifeDays: 45,
          // Other properties not specified
        },
      } as Partial<Config>);

      expect(config.scoring.decayHalfLifeDays).toBe(45);
      // Unspecified properties should use defaults
      expect(config.scoring.harmfulMultiplier).toBe(4);
      expect(config.scoring.minFeedbackForActive).toBe(3);
    });
  });
});
