
export interface Config {
  playbookPath: string;
  defaultDecayHalfLife?: number;
  pruneHarmfulThreshold: number;
  diaryPath?: string;
  llm?: {
    provider: string;
    model: string;
  };
}

export type BulletMaturity = 'candidate' | 'established' | 'proven' | 'deprecated';

export interface FeedbackEvent {
  timestamp: string;
  type: 'helpful' | 'harmful';
  sessionId?: string;
  reason?: string;
}

export interface PlaybookBullet {
  id: string;
  content: string;
  category: string;
  tags: string[];
  type: string;
  isNegative: boolean;
  state: 'draft' | 'active' | 'retired';
  maturity: BulletMaturity;
  helpfulCount: number; 
  harmfulCount: number;
  feedbackEvents: FeedbackEvent[]; 
  confidenceDecayHalfLifeDays: number;
  pinned: boolean;
  sourceSessions: string[];
  sourceAgents: string[];
  createdAt: string;
  updatedAt: string;
  effectiveScore?: number;
  deprecated?: boolean;
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

export interface DiaryEntry {
  id: string;
  sessionPath: string;
  agent: string;
  workspace: string;
  timestamp: string;
  accomplishments: string[];
  decisions: string[];
  challenges: string[];
  outcomes: string[];
  relatedSessions: RelatedSession[];
}

export interface RelatedSession {
  sessionId: string;
  relevance: number;
  summary?: string;
}

export interface NewBulletData {
  content: string;
  category: string;
  tags?: string[];
}
