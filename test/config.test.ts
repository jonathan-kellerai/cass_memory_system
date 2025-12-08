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

  describe("loadConfig()", () => {
    it("returns defaults when no config files exist", async () => {
      await withTempHome(async (_homeDir) => {
        const config = await loadConfig();

        expect(config.provider).toBe("anthropic");
        expect(config.model).toBe("claude-3-5-sonnet-20241022");
      });
    });

    it("loads global config from ~/.cass-memory/config.json", async () => {
      await withTempHome(async (homeDir) => {
        const configPath = path.join(homeDir, ".cass-memory", "config.json");
        const globalConfig = {
          provider: "openai",
          model: "gpt-4-turbo",
        };

        await fs.writeFile(configPath, JSON.stringify(globalConfig));

        const config = await loadConfig();

        expect(config.provider).toBe("openai");
        expect(config.model).toBe("gpt-4-turbo");
        // Other defaults should be preserved
        expect(config.cassPath).toBe("cass");
      });
    });

    it("CLI overrides take precedence over defaults", async () => {
      await withTempHome(async (_homeDir) => {
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
    });

    it("deep merges nested objects (scoring, sanitization)", async () => {
      await withTempHome(async (_homeDir) => {
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
    });

    it("respects CASS_MEMORY_VERBOSE environment variable", async () => {
      const originalVerbose = process.env.CASS_MEMORY_VERBOSE;
      try {
        process.env.CASS_MEMORY_VERBOSE = "1";
        await withTempHome(async (_homeDir) => {
          const config = await loadConfig();
          expect(config.verbose).toBe(true);
        });
      } finally {
        if (originalVerbose === undefined) {
          delete process.env.CASS_MEMORY_VERBOSE;
        } else {
          process.env.CASS_MEMORY_VERBOSE = originalVerbose;
        }
      }
    });

    it("handles malformed JSON gracefully", async () => {
      await withTempHome(async (homeDir) => {
        const configPath = path.join(homeDir, ".cass-memory", "config.json");
        await fs.writeFile(configPath, "{ invalid json }");

        // Should still work, falling back to defaults
        const config = await loadConfig();
        expect(config.provider).toBe("anthropic"); // Default
      });
    });
  });

  describe("loadConfig() with YAML configs", () => {
    it("normalizes snake_case to camelCase", async () => {
      await withTempDir("config-yaml", async (dir) => {
        // Create a git repo to simulate repo context
        await fs.mkdir(path.join(dir, ".git"), { recursive: true });
        await fs.mkdir(path.join(dir, ".cass"), { recursive: true });

        const repoConfig = {
          max_bullets_in_context: 100,
          session_lookback_days: 14,
          scoring: {
            decay_half_life_days: 45,
          },
        };

        await fs.writeFile(
          path.join(dir, ".cass", "config.yaml"),
          yaml.stringify(repoConfig)
        );

        const originalCwd = process.cwd();
        try {
          process.chdir(dir);

          await withTempHome(async (_homeDir) => {
            const config = await loadConfig();

            expect(config.maxBulletsInContext).toBe(100);
            expect(config.sessionLookbackDays).toBe(14);
            expect(config.scoring.decayHalfLifeDays).toBe(45);
          });
        } finally {
          process.chdir(originalCwd);
        }
      });
    });
  });

  describe("saveConfig()", () => {
    it("saves config to global config path", async () => {
      await withTempHome(async (homeDir) => {
        const configPath = path.join(homeDir, ".cass-memory", "config.json");
        const config = getDefaultConfig();
        config.provider = "openai";
        config.model = "gpt-4";

        await saveConfig(config);

        const savedContent = await fs.readFile(configPath, "utf-8");
        const savedConfig = JSON.parse(savedContent);

        expect(savedConfig.provider).toBe("openai");
        expect(savedConfig.model).toBe("gpt-4");
      });
    });

    it("overwrites existing config", async () => {
      await withTempHome(async (homeDir) => {
        const configPath = path.join(homeDir, ".cass-memory", "config.json");

        // Write initial config
        const initialConfig = getDefaultConfig();
        await saveConfig(initialConfig);

        // Write new config
        const newConfig = getDefaultConfig();
        newConfig.provider = "google";
        await saveConfig(newConfig);

        const savedContent = await fs.readFile(configPath, "utf-8");
        const savedConfig = JSON.parse(savedContent);

        expect(savedConfig.provider).toBe("google");
      });
    });
  });

  describe("edge cases", () => {
    it("handles empty config files", async () => {
      await withTempHome(async (homeDir) => {
        const configPath = path.join(homeDir, ".cass-memory", "config.json");
        await fs.writeFile(configPath, "{}");

        const config = await loadConfig();

        // Should have all defaults
        expect(config.provider).toBe("anthropic");
        expect(config.scoring.decayHalfLifeDays).toBe(90);
      });
    });

    it("ignores unknown fields in config files (forward compatibility)", async () => {
      await withTempHome(async (homeDir) => {
        const configPath = path.join(homeDir, ".cass-memory", "config.json");
        const configWithUnknown = {
          provider: "openai",
          unknownField: "should be ignored",
          futureFeature: { enabled: true },
        };

        await fs.writeFile(configPath, JSON.stringify(configWithUnknown));

        const config = await loadConfig();

        expect(config.provider).toBe("openai");
        // Unknown fields should not cause errors
        expect((config as any).unknownField).toBeUndefined();
      });
    });

    it("handles null values in nested objects", async () => {
      await withTempHome(async (homeDir) => {
        const configPath = path.join(homeDir, ".cass-memory", "config.json");
        const configWithNulls = {
          scoring: null,
          sanitization: null,
        };

        await fs.writeFile(configPath, JSON.stringify(configWithNulls));

        const config = await loadConfig();

        // Defaults should be used for null nested objects
        expect(config.scoring).toBeDefined();
        expect(config.scoring.decayHalfLifeDays).toBe(90);
        expect(config.sanitization).toBeDefined();
        expect(config.sanitization.enabled).toBe(true);
      });
    });
  });
});
