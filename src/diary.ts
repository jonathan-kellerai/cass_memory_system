import { z } from 'zod';
import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai'; 
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { exec } from 'node:child_process';
import { Config, DiaryEntry, RelatedSession } from './types';
import { sanitize } from './security';
import { extractAgentFromPath } from './utils';
import { getApiKey } from './llm';

const execAsync = promisify(exec);

const DiarySchema = z.object({
  accomplishments: z.array(z.string()).describe("List of concrete achievements"),
  decisions: z.array(z.string()).describe("Key technical decisions made"),
  challenges: z.array(z.string()).describe("Problems encountered and blockers"),
  outcomes: z.array(z.string()).describe("Results and key learnings"),
});

export async function generateDiary(sessionPath: string, config: Config): Promise<DiaryEntry> {
  const content = await exportSessionSafe(sessionPath);
  const sanitized = sanitize(content, { enabled: true });
  
  const agent = extractAgentFromPath(sessionPath);
  const workspace = path.basename(path.dirname(path.dirname(sessionPath))); 

  const extracted = await extractDiarySafe(sanitized, config);
  const related = await enrichWithRelatedSessions(sanitized, config);
  
  const entry: DiaryEntry = {
    id: `diary-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    sessionPath,
    agent,
    workspace,
    timestamp: new Date().toISOString(),
    ...extracted,
    relatedSessions: related
  };
  
  await saveDiaryEntry(entry, config);
  
  return entry;
}

async function exportSessionSafe(sessionPath: string): Promise<string> {
  try {
    // Use markdown for better LLM readability
    const { stdout } = await execAsync(`cass export "${sessionPath}" --format markdown`);
    return stdout;
  } catch (error) {
    throw new Error(`Failed to export session: ${error}`);
  }
}

async function extractDiarySafe(content: string, config: Config) {
  if (!config.llm) {
    return { accomplishments: [], decisions: [], challenges: [], outcomes: [] };
  }
  
  try {
    const provider = config.llm.provider;
    const apiKey = getApiKey(provider);
    
    let model;
    if (provider === 'openai') {
      const openai = createOpenAI({ apiKey });
      model = openai(config.llm.model);
    } else if (provider === 'anthropic') {
      const anthropic = createAnthropic({ apiKey });
      model = anthropic(config.llm.model);
    } else if (provider === 'google') {
      const google = createGoogleGenerativeAI({ apiKey });
      model = google(config.llm.model);
    } else {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    const { object } = await generateObject({
      model,
      schema: DiarySchema,
      prompt: `Analyze the following coding session log and extract the key accomplishments, decisions, challenges, and outcomes.
      
      Session Log:
      ${content.slice(0, 50000)}
      `
    });
    
    return object;
  } catch (error) {
    console.error(`LLM extraction failed: ${error}`);
    return { accomplishments: [], decisions: [], challenges: [], outcomes: [] };
  }
}

async function enrichWithRelatedSessions(content: string, config: Config): Promise<RelatedSession[]> {
  // Placeholder for cross-agent enrichment
  return []; 
}

async function saveDiaryEntry(entry: DiaryEntry, config: Config): Promise<void> {
  if (!config.diaryPath) return;
  
  await fs.mkdir(config.diaryPath, { recursive: true });
  const filename = `${entry.id}.json`;
  const filePath = path.join(config.diaryPath, filename);
  
  await fs.writeFile(filePath, JSON.stringify(entry, null, 2));
}