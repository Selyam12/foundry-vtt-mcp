// Shared TypeScript types for Foundry MCP Integration

/**
 * MCP Query types
 */
export interface MCPQuery {
  method: string;
  data?: unknown;
}

export interface MCPResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Character/Actor types
 */
export interface CharacterInfo {
  id: string;
  actorId?: string;
  tokenId?: string;
  sceneId?: string;
  isToken?: boolean;
  name: string;
  type: string;
  img?: string;
  system: Record<string, unknown>;
  items: CharacterItem[];
  effects: CharacterEffect[];
}

export interface CharacterItem {
  id: string;
  name: string;
  type: string;
  img?: string;
  system: Record<string, unknown>;
}

export interface CharacterEffect {
  id: string;
  name: string;
  icon?: string;
  disabled: boolean;
  duration?: {
    type: string;
    duration?: number;
    remaining?: number;
  };
}

/**
 * Compendium types
 */
export interface CompendiumSearchResult {
  id: string;
  name: string;
  type: string;
  img?: string;
  pack: string;
  packLabel: string;
  system?: Record<string, unknown>;
}

export interface CompendiumPack {
  id: string;
  label: string;
  type: string;
  system: string;
  private: boolean;
}

/**
 * Scene types
 */
export interface SceneInfo {
  id: string;
  name: string;
  img?: string;
  background?: string;
  width: number;
  height: number;
  padding: number;
  active: boolean;
  navigation: boolean;
  tokens: SceneToken[];
  walls: number;
  lights: number;
  sounds: number;
  notes: SceneNote[];
}

export interface SceneToken {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  actorId?: string;
  img: string;
  hidden: boolean;
  disposition: number;
}

export interface SceneNote {
  id: string;
  text: string;
  x: number;
  y: number;
}

/**
 * Token Manipulation types
 */
export interface TokenUpdate {
  tokenId: string;
  updates: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    rotation?: number;
    hidden?: boolean;
    disposition?: -1 | 0 | 1; // hostile, neutral, friendly
    name?: string;
    elevation?: number;
    lockRotation?: boolean;
  };
}

export interface TokenMoveRequest {
  tokenId: string;
  x: number;
  y: number;
  animate?: boolean;
}

export interface TokenUpdateResult {
  success: boolean;
  tokenId: string;
  updated: boolean;
  error?: string;
}

export type SceneTokenScope = 'none' | 'active' | 'all';

export interface SetActorArtworkRequest {
  actorIdentifier: string;
  portraitPath?: string;
  tokenPath?: string;
  sceneTokenScope?: SceneTokenScope;
}

export interface SetActorArtworkResult {
  success: boolean;
  partial: boolean;
  actorId: string;
  actorName: string;
  previousPortraitPath?: string;
  previousTokenPath?: string;
  portraitPath?: string;
  tokenPath?: string;
  updatedProperties: string[];
  sceneTokenScope: SceneTokenScope;
  scenesProcessed: number;
  sceneTokensUpdated: number;
  errors: Array<{ sceneId?: string; sceneName?: string; error: string }>;
}

export type ActorBiographyField = 'value' | 'public';

export interface UpdateActorBiographyRequest {
  actorIdentifier: string;
  biography: string;
  biographyField?: ActorBiographyField;
}

export interface UpdateActorBiographyResult {
  success: boolean;
  actorId: string;
  actorName: string;
  biographyField: ActorBiographyField;
  updatedPath: string;
  previousBiography: string;
  biography: string;
  updated: boolean;
}

export type DnD5eSpellbookOperation = 'update' | 'remove' | 'set-prepared';

export interface DnD5eSpellbookUpdates {
  name?: string;
  img?: string;
  level?: number;
  prepared?: boolean;
  preparationMode?: 'prepared' | 'always' | 'atwill' | 'innate' | 'pact' | 'daily' | 'limited';
  description?: string;
  system?: Record<string, unknown>;
}

export interface DnD5eUpdateActorSpellbookRequest {
  operation: DnD5eSpellbookOperation;
  actorIdentifier: string;
  spellIdentifier: string;
  prepared?: boolean;
  updates?: DnD5eSpellbookUpdates;
}

export interface DnD5eUpdateActorSpellbookResult {
  success: boolean;
  operation: DnD5eSpellbookOperation;
  actorId: string;
  actorName: string;
  spellId: string;
  spellName: string;
  previousSpell?: Record<string, unknown>;
  spell?: Record<string, unknown>;
  updatedProperties: string[];
  removed: boolean;
}

export interface TokenDeleteResult {
  success: boolean;
  deletedCount: number;
  tokenIds: string[];
  errors?: string[];
}

export interface TokenDetails extends SceneToken {
  rotation: number;
  elevation: number;
  lockRotation: boolean;
  scale: number;
  alpha: number;
  actorLink: boolean;
  actorData?: {
    name: string;
    type: string;
    img?: string;
  };
}

/**
 * Configuration types
 */
export interface FoundryMCPConfig {
  enabled: boolean;
  mcpHost: string;
  mcpPort: number;
  connectionTimeout: number;
  debugLogging: boolean;
}

export interface MCPServerConfig {
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  foundry: {
    host: string;
    port: number;
    namespace: string;
    reconnectAttempts: number;
    reconnectDelay: number;
  };
}

/**
 * World info types
 */
export interface WorldInfo {
  id: string;
  title: string;
  system: string;
  systemVersion: string;
  foundryVersion: string;
  users: WorldUser[];
}

export interface WorldUser {
  id: string;
  name: string;
  active: boolean;
  isGM: boolean;
}

/**
 * Bridge status types
 */
export interface BridgeStatus {
  isRunning: boolean;
  config: FoundryMCPConfig;
  timestamp: number;
}

/**
 * Multipart Campaign types
 */
export type CampaignPartStatus = 'not_started' | 'in_progress' | 'completed' | 'skipped';
export type CampaignPartType = 'main_part' | 'sub_part' | 'chapter' | 'session' | 'optional';

export interface LevelRecommendation {
  start: number;
  end: number;
}

export interface NPCReference {
  id: string;
  name: string;
  actorId?: string;
}

export interface ScalingOptions {
  adjustForPartySize: boolean;
  adjustForLevel: boolean;
  difficultyModifier: number;
}

export interface CampaignSubPart {
  id: string;
  title: string;
  description: string;
  type: CampaignPartType;
  status: CampaignPartStatus;
  journalId?: string;
  createdAt?: number;
  completedAt?: number;
}

export interface CampaignPart {
  id: string;
  title: string;
  description: string;
  type: CampaignPartType;
  status: CampaignPartStatus;
  dependencies: string[];
  subParts?: CampaignSubPart[];
  questGiver?: NPCReference;
  levelRecommendation: LevelRecommendation;
  gmNotes: string;
  playerContent: string;
  scaling: ScalingOptions;
  journalId?: string;
  createdAt?: number;
  completedAt?: number;
}

export interface CampaignMetadata {
  defaultQuestGiver?: NPCReference;
  defaultLocation?: string;
  theme?: string;
  estimatedSessions?: number;
  targetLevelRange?: LevelRecommendation;
  tags: string[];
}

export interface CampaignStructure {
  id: string;
  title: string;
  description: string;
  parts: CampaignPart[];
  metadata: CampaignMetadata;
  dashboardJournalId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CampaignTemplate {
  id: string;
  name: string;
  description: string;
  parts: Array<{
    title: string;
    description: string;
    type: CampaignPartType;
    dependencies: string[];
    subParts?: Array<{
      title: string;
      description: string;
      type: CampaignPartType;
    }>;
    levelRecommendation: LevelRecommendation;
  }>;
  metadata: Partial<CampaignMetadata>;
}
