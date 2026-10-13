// Zod schemas for validation of shared types

import { z } from 'zod';

/**
 * MCP Query schemas
 */
export const MCPQuerySchema = z.object({
  method: z.string(),
  data: z.unknown().optional(),
});

export const MCPResponseSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
});

/**
 * Character schemas
 */
export const CharacterItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  img: z.string().optional(),
  system: z.record(z.unknown()),
});

export const CharacterEffectSchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string().optional(),
  disabled: z.boolean(),
  duration: z
    .object({
      type: z.string(),
      duration: z.number().optional(),
      remaining: z.number().optional(),
    })
    .optional(),
});

export const CharacterInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  img: z.string().optional(),
  system: z.record(z.unknown()),
  items: z.array(CharacterItemSchema),
  effects: z.array(CharacterEffectSchema),
});

/**
 * Compendium schemas
 */
export const CompendiumSearchResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  img: z.string().optional(),
  pack: z.string(),
  packLabel: z.string(),
  system: z.record(z.unknown()).optional(),
});

export const CompendiumPackSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.string(),
  system: z.string(),
  private: z.boolean(),
});

/**
 * Scene schemas
 */
export const SceneTokenSchema = z.object({
  id: z.string(),
  name: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  actorId: z.string().optional(),
  img: z.string(),
  hidden: z.boolean(),
  disposition: z.number(),
});

export const SceneNoteSchema = z.object({
  id: z.string(),
  text: z.string(),
  x: z.number(),
  y: z.number(),
});

export const SceneInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  img: z.string().optional(),
  background: z.string().optional(),
  width: z.number(),
  height: z.number(),
  padding: z.number(),
  active: z.boolean(),
  navigation: z.boolean(),
  tokens: z.array(SceneTokenSchema),
  walls: z.number(),
  lights: z.number(),
  sounds: z.number(),
  notes: z.array(SceneNoteSchema),
});

/**
 * Token Manipulation schemas
 */
export const TokenUpdateSchema = z.object({
  tokenId: z.string(),
  updates: z.object({
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    rotation: z.number().min(0).max(360).optional(),
    hidden: z.boolean().optional(),
    disposition: z.union([z.literal(-1), z.literal(0), z.literal(1)]).optional(),
    name: z.string().optional(),
    elevation: z.number().optional(),
    lockRotation: z.boolean().optional(),
  }),
});

export const TokenMoveRequestSchema = z.object({
  tokenId: z.string(),
  x: z.number(),
  y: z.number(),
  animate: z.boolean().optional().default(false),
});

export const TokenUpdateResultSchema = z.object({
  success: z.boolean(),
  tokenId: z.string(),
  updated: z.boolean(),
  error: z.string().optional(),
});

export const SceneTokenScopeSchema = z.enum(['none', 'active', 'all']);

export const SetActorArtworkRequestSchema = z
  .object({
    actorIdentifier: z.string().min(1),
    portraitPath: z.string().min(1).optional(),
    tokenPath: z.string().min(1).optional(),
    sceneTokenScope: SceneTokenScopeSchema.optional().default('none'),
  })
  .refine(data => Boolean(data.portraitPath ?? data.tokenPath), {
    message: 'At least one of portraitPath or tokenPath is required',
  })
  .refine(data => data.sceneTokenScope === 'none' || Boolean(data.tokenPath), {
    message: 'tokenPath is required when sceneTokenScope is active or all',
  });

export const SetActorArtworkResultSchema = z.object({
  success: z.boolean(),
  partial: z.boolean(),
  actorId: z.string(),
  actorName: z.string(),
  previousPortraitPath: z.string().optional(),
  previousTokenPath: z.string().optional(),
  portraitPath: z.string().optional(),
  tokenPath: z.string().optional(),
  updatedProperties: z.array(z.string()),
  sceneTokenScope: SceneTokenScopeSchema,
  scenesProcessed: z.number(),
  sceneTokensUpdated: z.number(),
  errors: z.array(
    z.object({
      sceneId: z.string().optional(),
      sceneName: z.string().optional(),
      error: z.string(),
    })
  ),
});

export const ActorBiographyFieldSchema = z.enum(['value', 'public']);

export const UpdateActorBiographyRequestSchema = z.object({
  actorIdentifier: z.string().min(1),
  biography: z.string(),
  biographyField: ActorBiographyFieldSchema.optional().default('value'),
});

export const UpdateActorBiographyResultSchema = z.object({
  success: z.boolean(),
  actorId: z.string(),
  actorName: z.string(),
  biographyField: ActorBiographyFieldSchema,
  updatedPath: z.string(),
  previousBiography: z.string(),
  biography: z.string(),
  updated: z.boolean(),
});

export const DnD5eSpellbookOperationSchema = z.enum(['update', 'remove', 'set-prepared']);

export const DnD5eSpellbookUpdatesSchema = z
  .object({
    name: z.string().min(1).optional(),
    img: z.string().min(1).optional(),
    level: z.number().int().min(0).max(9).optional(),
    prepared: z.boolean().optional(),
    preparationMode: z
      .enum(['prepared', 'always', 'atwill', 'innate', 'pact', 'daily', 'limited'])
      .optional(),
    description: z.string().optional(),
    system: z.record(z.unknown()).optional(),
  })
  .refine(data => Object.keys(data).length > 0, {
    message: 'At least one update field is required',
  });

export const DnD5eUpdateActorSpellbookRequestSchema = z
  .object({
    operation: DnD5eSpellbookOperationSchema,
    actorIdentifier: z.string().min(1),
    spellIdentifier: z.string().min(1),
    prepared: z.boolean().optional(),
    updates: DnD5eSpellbookUpdatesSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.operation === 'update' && !data.updates) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['updates'],
        message: 'updates is required for operation "update"',
      });
    }
    if (data.operation === 'set-prepared' && typeof data.prepared !== 'boolean') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['prepared'],
        message: 'prepared is required for operation "set-prepared"',
      });
    }
  });

export const DnD5eUpdateActorSpellbookResultSchema = z.object({
  success: z.boolean(),
  operation: DnD5eSpellbookOperationSchema,
  actorId: z.string(),
  actorName: z.string(),
  spellId: z.string(),
  spellName: z.string(),
  previousSpell: z.record(z.unknown()).optional(),
  spell: z.record(z.unknown()).optional(),
  updatedProperties: z.array(z.string()),
  removed: z.boolean(),
});

export const TokenDeleteResultSchema = z.object({
  success: z.boolean(),
  deletedCount: z.number(),
  tokenIds: z.array(z.string()),
  errors: z.array(z.string()).optional(),
});

export const TokenDetailsSchema = SceneTokenSchema.extend({
  rotation: z.number(),
  elevation: z.number(),
  lockRotation: z.boolean(),
  scale: z.number(),
  alpha: z.number(),
  actorLink: z.boolean(),
  actorData: z
    .object({
      name: z.string(),
      type: z.string(),
      img: z.string().optional(),
    })
    .optional(),
});

/**
 * Configuration schemas
 */
export const FoundryMCPConfigSchema = z.object({
  enabled: z.boolean(),
  mcpHost: z.string(),
  mcpPort: z.number().min(1024).max(65535),
  connectionTimeout: z.number().min(5).max(60),
  debugLogging: z.boolean(),
});

export const MCPServerConfigSchema = z.object({
  logLevel: z.enum(['error', 'warn', 'info', 'debug']),
  foundry: z.object({
    host: z.string(),
    port: z.number().min(1024).max(65535),
    namespace: z.string(),
    reconnectAttempts: z.number().min(1).max(10),
    reconnectDelay: z.number().min(100).max(10000),
  }),
});

/**
 * World info schemas
 */
export const WorldUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  active: z.boolean(),
  isGM: z.boolean(),
});

export const WorldInfoSchema = z.object({
  id: z.string(),
  title: z.string(),
  system: z.string(),
  systemVersion: z.string(),
  foundryVersion: z.string(),
  users: z.array(WorldUserSchema),
});

/**
 * Bridge status schema
 */
export const BridgeStatusSchema = z.object({
  isRunning: z.boolean(),
  config: FoundryMCPConfigSchema,
  timestamp: z.number(),
});

/**
 * Multipart Campaign schemas
 */
export const CampaignPartStatusSchema = z.enum([
  'not_started',
  'in_progress',
  'completed',
  'skipped',
]);

export const CampaignPartTypeSchema = z.enum([
  'main_part',
  'sub_part',
  'chapter',
  'session',
  'optional',
]);

export const LevelRecommendationSchema = z.object({
  start: z.number().min(1).max(20),
  end: z.number().min(1).max(20),
});

export const NPCReferenceSchema = z.object({
  id: z.string(),
  name: z.string(),
  actorId: z.string().optional(),
});

export const ScalingOptionsSchema = z.object({
  adjustForPartySize: z.boolean().default(true),
  adjustForLevel: z.boolean().default(true),
  difficultyModifier: z.number().min(-2).max(2).default(0),
});

// Sub-part schema (no further nesting)
export const CampaignSubPartSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  description: z.string(),
  type: CampaignPartTypeSchema,
  status: CampaignPartStatusSchema.default('not_started'),
  journalId: z.string().optional(),
  createdAt: z.number().optional(),
  completedAt: z.number().optional(),
});

// Main campaign part schema with optional sub-parts
export const CampaignPartSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  description: z.string(),
  type: CampaignPartTypeSchema,
  status: CampaignPartStatusSchema.default('not_started'),
  dependencies: z.array(z.string()).default([]),
  subParts: z.array(CampaignSubPartSchema).optional(),
  questGiver: NPCReferenceSchema.optional(),
  levelRecommendation: LevelRecommendationSchema,
  gmNotes: z.string().default(''),
  playerContent: z.string().default(''),
  scaling: ScalingOptionsSchema.default({}),
  journalId: z.string().optional(),
  createdAt: z.number().optional(),
  completedAt: z.number().optional(),
});

export const CampaignMetadataSchema = z.object({
  defaultQuestGiver: NPCReferenceSchema.optional(),
  defaultLocation: z.string().optional(),
  theme: z.string().optional(),
  estimatedSessions: z.number().optional(),
  targetLevelRange: LevelRecommendationSchema.optional(),
  tags: z.array(z.string()).default([]),
});

export const CampaignStructureSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  description: z.string(),
  parts: z.array(CampaignPartSchema),
  metadata: CampaignMetadataSchema,
  dashboardJournalId: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const CampaignTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  parts: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      type: CampaignPartTypeSchema,
      dependencies: z.array(z.string()).default([]),
      subParts: z
        .array(
          z.object({
            title: z.string(),
            description: z.string(),
            type: CampaignPartTypeSchema,
          })
        )
        .optional(),
      levelRecommendation: LevelRecommendationSchema,
    })
  ),
  metadata: CampaignMetadataSchema.partial(),
});
