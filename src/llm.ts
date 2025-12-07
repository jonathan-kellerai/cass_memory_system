// src/llm.ts
// LLM Provider Abstraction - Using Vercel AI SDK
// Supports OpenAI, Anthropic, and Google providers with a unified interface

import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

/**
 * Supported LLM provider names
 */
export type LLMProvider = "openai" | "anthropic" | "google";

/**
 * Minimal config interface for LLM operations.
 * Full Config type will be in types.ts once implemented.
 */
export interface LLMConfig {
  provider: LLMProvider;
  model: string;
}

/**
 * Map of provider names to environment variable names
 */
const ENV_VAR_MAP: Record<LLMProvider, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
};

/**
 * Expected key prefixes for format validation
 */
const KEY_PREFIX_MAP: Record<LLMProvider, string> = {
  openai: "sk-",
  anthropic: "sk-ant-",
  google: "AIza", // Google API keys start with AIza
};

/**
 * Get the API key for a provider from environment variables.
 *
 * @param provider - The LLM provider name
 * @returns The API key string
 * @throws Error if provider is unknown or env var is not set
 *
 * @example
 * ```typescript
 * const key = getApiKey("openai");
 * ```
 */
export function getApiKey(provider: string): string {
  const normalized = provider.trim().toLowerCase() as LLMProvider;

  const envVar = ENV_VAR_MAP[normalized];
  if (!envVar) {
    const supported = Object.keys(ENV_VAR_MAP).join(", ");
    throw new Error(
      `Unknown LLM provider '${provider}'. Supported providers: ${supported}.`
    );
  }

  const apiKey = process.env[envVar];
  if (!apiKey || apiKey.trim() === "") {
    throw new Error(
      `${envVar} environment variable not found. Set it with: export ${envVar}=<your-key>`
    );
  }

  return apiKey.trim();
}

/**
 * Validate API key format (non-blocking, warnings only).
 * Does not make API calls - just checks format patterns.
 *
 * @param provider - The LLM provider name
 * @returns void - logs warnings to stderr if format looks wrong
 *
 * @example
 * ```typescript
 * validateApiKey("openai");
 * // Warning: OpenAI API key does not start with sk- - this may be incorrect
 * ```
 */
export function validateApiKey(provider: string): void {
  const normalized = provider.trim().toLowerCase() as LLMProvider;
  const envVar = ENV_VAR_MAP[normalized];
  if (!envVar) return;

  const apiKey = process.env[envVar];
  if (!apiKey) {
    // getApiKey will handle missing keys - don't duplicate warnings
    return;
  }

  const expectedPrefix = KEY_PREFIX_MAP[normalized];
  if (expectedPrefix && !apiKey.startsWith(expectedPrefix)) {
    console.warn(
      `Warning: ${provider} API key does not start with '${expectedPrefix}' - this may be incorrect`
    );
  }

  // Check for common placeholder patterns
  const placeholders = ["YOUR_API_KEY", "xxx", "test", "demo", "placeholder"];
  const lowerKey = apiKey.toLowerCase();
  for (const placeholder of placeholders) {
    if (lowerKey.includes(placeholder)) {
      console.warn(
        `Warning: ${provider} API key appears to contain a placeholder ('${placeholder}')`
      );
      break;
    }
  }

  // Check minimum length (most keys are 30+ chars)
  if (apiKey.length < 20) {
    console.warn(
      `Warning: ${provider} API key seems too short (${apiKey.length} chars) - this may be incorrect`
    );
  }
}

/**
 * Create a provider-agnostic LanguageModel instance.
 * Uses Vercel AI SDK for unified interface across providers.
 *
 * @param config - Configuration with provider and model name
 * @returns LanguageModel instance for the configured provider/model
 * @throws Error if provider is unknown or API key is not set
 *
 * @example
 * ```typescript
 * const model = getModel({ provider: "anthropic", model: "claude-sonnet-4-20250514" });
 * const { text } = await generateText({ model, prompt: "Hello!" });
 * ```
 */
export function getModel(config: LLMConfig): LanguageModel {
  const apiKey = getApiKey(config.provider);

  // Validate key format (non-blocking warnings)
  validateApiKey(config.provider);

  switch (config.provider) {
    case "openai": {
      const openai = createOpenAI({ apiKey });
      return openai(config.model);
    }
    case "anthropic": {
      const anthropic = createAnthropic({ apiKey });
      return anthropic(config.model);
    }
    case "google": {
      const google = createGoogleGenerativeAI({ apiKey });
      return google(config.model);
    }
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}

/**
 * Check if LLM is available (API key exists) without throwing.
 * Useful for graceful degradation.
 *
 * @param provider - The LLM provider to check
 * @returns true if API key is configured
 */
export function isLLMAvailable(provider: LLMProvider): boolean {
  const envVar = ENV_VAR_MAP[provider];
  return !!process.env[envVar];
}

/**
 * Get a list of available (configured) providers.
 *
 * @returns Array of provider names that have API keys set
 */
export function getAvailableProviders(): LLMProvider[] {
  return (Object.keys(ENV_VAR_MAP) as LLMProvider[]).filter((provider) =>
    isLLMAvailable(provider)
  );
}
