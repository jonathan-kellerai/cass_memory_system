import { describe, it, expect } from 'bun:test';
import { getApiKey } from '../src/llm';

describe('getApiKey', () => {
  it('should return API key if set', () => {
    process.env['OPENAI_API_KEY'] = 'sk-test-123';
    expect(getApiKey('openai')).toBe('sk-test-123');
  });

  it('should throw error if API key is missing', () => {
    delete process.env['ANTHROPIC_API_KEY'];
    expect(() => getApiKey('anthropic')).toThrow('ANTHROPIC_API_KEY environment variable not found');
  });

  it('should throw error for unknown provider', () => {
    expect(() => getApiKey('unknown')).toThrow('Unknown LLM provider');
  });
});
