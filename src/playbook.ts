
import { z } from 'zod';
import { parse, stringify } from 'yaml';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Config } from './types';
import { generateBulletId, extractAgentFromPath, warn, error } from './utils';

const PLAYBOOK_SCHEMA_VERSION = 2;
const DEFAULT_DECAY_HALF_LIFE_DAYS = 90;

export interface PlaybookEvent {
  timestamp: string;
  sessionId?: string;
  reason?: string;
}

export interface PlaybookBullet {
  id: string;
  content: string;
  category: string;
  tags: string[];
  type: 'rule' | 'anti-pattern';
  isNegative: boolean;
  state: 'draft' | 'active' | 'retired';
  maturity: 'candidate' | 'established' | 'proven' | 'deprecated';
  helpfulCount: number;
  harmfulCount: number;
  helpfulEvents: PlaybookEvent[];
  harmfulEvents: PlaybookEvent[];
  confidenceDecayHalfLifeDays: number;
  pinned: boolean;
  pinnedReason?: string;
  searchPointer?: string;
  scope?: string;
  workspace?: string;
  sourceSessions: string[];
  sourceAgents: string[];
  createdAt: string;
  updatedAt: string;
  effectiveScore?: number;
}

export interface NewBulletData {
  content: string;
  category: string;
  tags?: string[];
  searchPointer?: string;
  scope?: string;
  workspace?: string;
}

export interface PlaybookMetadata {
  createdAt: string;
  lastReflection?: string;
  totalReflections: number;
  totalSessionsProcessed: number;
}

export interface Playbook {
  schema_version: number;
  name: string;
  description: string;
  metadata: PlaybookMetadata;
  deprecatedPatterns: PlaybookBullet[];
  bullets: PlaybookBullet[];
}

// Zod Schemas
const PlaybookEventSchema = z.object({
  timestamp: z.string(),
  sessionId: z.string().optional(),
  reason: z.string().optional(),
});

const PlaybookBulletSchema = z.object({
  id: z.string(),
  content: z.string(),
  category: z.string(),
  tags: z.array(z.string()),
  type: z.enum(['rule', 'anti-pattern']),
  isNegative: z.boolean(),
  state: z.enum(['draft', 'active', 'retired']),
  maturity: z.enum(['candidate', 'established', 'proven', 'deprecated']),
  helpfulCount: z.number(),
  harmfulCount: z.number(),
  helpfulEvents: z.array(PlaybookEventSchema),
  harmfulEvents: z.array(PlaybookEventSchema),
  confidenceDecayHalfLifeDays: z.number(),
  pinned: z.boolean(),
  pinnedReason: z.string().optional(),
  searchPointer: z.string().optional(),
  scope: z.string().optional(),
  workspace: z.string().optional(),
  sourceSessions: z.array(z.string()),
  sourceAgents: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  effectiveScore: z.number().optional(),
});

const PlaybookMetadataSchema = z.object({
  createdAt: z.string(),
  lastReflection: z.string().optional(),
  totalReflections: z.number(),
  totalSessionsProcessed: z.number(),
});

export const PlaybookSchema = z.object({
  schema_version: z.number(),
  name: z.string(),
  description: z.string(),
  metadata: PlaybookMetadataSchema,
  deprecatedPatterns: z.array(PlaybookBulletSchema),
  bullets: z.array(PlaybookBulletSchema),
});

function normalizeBullet(bullet: Partial<PlaybookBullet>): PlaybookBullet {
  const now = new Date().toISOString();
  return {
    id: bullet.id ?? generateBulletId(),
    content: bullet.content ?? '',
    category: bullet.category ?? 'uncategorized',
    tags: bullet.tags ?? [],
    type: (bullet.type as PlaybookBullet['type']) ?? 'rule',
    isNegative: bullet.isNegative ?? false,
    state: (bullet.state as PlaybookBullet['state']) ?? 'draft',
    maturity: (bullet.maturity as PlaybookBullet['maturity']) ?? 'candidate',
    helpfulCount: bullet.helpfulCount ?? 0,
    harmfulCount: bullet.harmfulCount ?? 0,
    helpfulEvents: bullet.helpfulEvents ?? [],
    harmfulEvents: bullet.harmfulEvents ?? [],
    confidenceDecayHalfLifeDays:
      bullet.confidenceDecayHalfLifeDays ?? DEFAULT_DECAY_HALF_LIFE_DAYS,
    pinned: bullet.pinned ?? false,
    pinnedReason: bullet.pinnedReason,
    searchPointer: bullet.searchPointer,
    scope: bullet.scope,
    workspace: bullet.workspace,
    sourceSessions: bullet.sourceSessions ?? [],
    sourceAgents: bullet.sourceAgents ?? [],
    createdAt: bullet.createdAt ?? now,
    updatedAt: bullet.updatedAt ?? now,
    effectiveScore: bullet.effectiveScore,
  };
}

function normalizePlaybookShape(parsed: unknown): Playbook {
  if (!parsed || typeof parsed !== 'object') {
    return createEmptyPlaybook();
  }

  const maybe = parsed as Partial<Playbook>;
  const base = createEmptyPlaybook();

  const normalizedBullets = Array.isArray(maybe.bullets)
    ? maybe.bullets.map((b) => normalizeBullet(b))
    : base.bullets;

  return {
    schema_version: maybe.schema_version ?? base.schema_version,
    name: maybe.name ?? base.name,
    description: maybe.description ?? base.description,
    metadata: {
      createdAt: maybe.metadata?.createdAt ?? base.metadata.createdAt,
      lastReflection: maybe.metadata?.lastReflection,
      totalReflections: maybe.metadata?.totalReflections ?? base.metadata.totalReflections,
      totalSessionsProcessed:
        maybe.metadata?.totalSessionsProcessed ?? base.metadata.totalSessionsProcessed,
    },
    deprecatedPatterns: maybe.deprecatedPatterns ?? base.deprecatedPatterns,
    bullets: normalizedBullets,
  };
}

async function backupCorruptFile(playbookPath: string) {
  const backupPath = `${playbookPath}.backup.${Date.now()}`;
  try {
    await fs.cp(playbookPath, backupPath);
    warn(`Corrupted playbook backed up to ${backupPath}`);
  } catch (backupError) {
    error(`Failed to backup corrupted playbook: ${backupError}`);
  }
}

export function createEmptyPlaybook(): Playbook {
  return {
    schema_version: PLAYBOOK_SCHEMA_VERSION,
    name: 'playbook',
    description: 'Auto-generated by cass-memory',
    metadata: {
      createdAt: new Date().toISOString(),
      totalReflections: 0,
      totalSessionsProcessed: 0,
    },
    deprecatedPatterns: [],
    bullets: [],
  };
}

export async function loadPlaybook(config: Config): Promise<Playbook> {
  const playbookPath = path.resolve(config.playbookPath);

  try {
    const fileContent = await fs.readFile(playbookPath, 'utf-8');
    if (!fileContent.trim()) {
      return createEmptyPlaybook();
    }

    const parsed = parse(fileContent);
    const normalized = normalizePlaybookShape(parsed);
    const result = PlaybookSchema.safeParse(normalized);

    if (!result.success) {
      warn(`Playbook schema validation failed: ${result.error.message}`);
      await backupCorruptFile(playbookPath);
      return createEmptyPlaybook();
    }

    return result.data as Playbook;
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      return createEmptyPlaybook();
    }

    if (err?.code === 'EACCES') {
      throw err;
    }

    await backupCorruptFile(playbookPath);
    return createEmptyPlaybook();
  }
}

export async function savePlaybook(playbook: Playbook, config: Config): Promise<void> {
  const { playbookPath } = config;
  
  // Update metadata
  playbook.metadata.lastReflection = new Date().toISOString();
  
  // Ensure parent directory
  const dir = path.dirname(playbookPath);
  await fs.mkdir(dir, { recursive: true });

  // Stringify
  const yamlString = stringify(playbook);

  // Atomic Write
  const tmpPath = `${playbookPath}.tmp`;
  try {
    await fs.writeFile(tmpPath, yamlString, 'utf-8');
    await fs.rename(tmpPath, playbookPath);
  } catch (error) {
    try {
      await fs.unlink(tmpPath);
    } catch {}
    throw error;
  }
}

export function addBullet(
  playbook: Playbook,
  data: NewBulletData,
  sourceSession: string,
  config: Config
): PlaybookBullet {
  const now = new Date().toISOString();
  
  const bullet: PlaybookBullet = {
    id: generateBulletId(),
    content: data.content,
    category: data.category,
    tags: data.tags || [],
    type: "rule",
    isNegative: false,
    state: "draft",
    maturity: "candidate",
    helpfulCount: 0,
    harmfulCount: 0,
    helpfulEvents: [],
    harmfulEvents: [],
    confidenceDecayHalfLifeDays: config.defaultDecayHalfLife || 90,
    pinned: false,
    sourceSessions: [sourceSession],
    sourceAgents: [extractAgentFromPath(sourceSession)],
    createdAt: now,
    updatedAt: now,
    effectiveScore: 0
  };

  playbook.bullets.push(bullet);
  return bullet;
}
