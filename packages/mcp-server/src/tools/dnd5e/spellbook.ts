import { z } from 'zod';
import { FoundryClient } from '../../foundry-client.js';
import { Logger } from '../../logger.js';
import { ErrorHandler } from '../../utils/error-handler.js';
import { detectGameSystem, getCachedSystemId } from '../../utils/system-detection.js';

export interface DnD5eSpellbookToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

const SpellbookOperationSchema = z.enum(['update', 'remove', 'set-prepared']);

const SpellbookUpdatesSchema = z
  .object({
    name: z.string().min(1).optional(),
    img: z.string().min(1).optional(),
    level: z.number().int().min(0).max(9).optional(),
    prepared: z.boolean().optional(),
    preparationMode: z
      .enum(['prepared', 'always', 'atwill', 'innate', 'pact', 'daily', 'limited'])
      .optional(),
    description: z.string().optional(),
    system: z.record(z.any()).optional(),
  })
  .refine(data => Object.keys(data).length > 0, {
    message: 'At least one update field is required',
  });

export const DnD5eUpdateActorSpellbookRequestSchema = z
  .object({
    operation: SpellbookOperationSchema,
    actorIdentifier: z.string().min(1),
    spellIdentifier: z.string().min(1),
    prepared: z.boolean().optional(),
    updates: SpellbookUpdatesSchema.optional(),
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

export class DnD5eSpellbookTools {
  private foundryClient: FoundryClient;
  private logger: Logger;
  private errorHandler: ErrorHandler;

  constructor({ foundryClient, logger }: DnD5eSpellbookToolsOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'DnD5eSpellbookTools' });
    this.errorHandler = new ErrorHandler(this.logger);
  }

  getToolDefinitions() {
    return [
      {
        name: 'dnd5e-update-actor-spellbook',
        description:
          '[D&D 5e only] Update an existing spell item on an actor spellbook, remove it, or set its prepared state. ' +
          'Uses exact actor name or actor ID, and exact spell name or spell item ID, to avoid mutating the wrong sheet. ' +
          'This tool edits only embedded actor items of type "spell"; it does not import new spells from compendium. ' +
          'Use dnd5e-add-feature with featureType "spells" to import spells first.',
        inputSchema: {
          type: 'object',
          properties: {
            operation: {
              type: 'string',
              enum: ['update', 'remove', 'set-prepared'],
              description:
                '"update" changes spell fields, "remove" deletes the spell from the actor, "set-prepared" toggles prepared state.',
            },
            actorIdentifier: {
              type: 'string',
              description: 'Exact actor name or actor ID',
            },
            spellIdentifier: {
              type: 'string',
              description: 'Exact spell name on the actor or embedded spell item ID',
            },
            prepared: {
              type: 'boolean',
              description: 'Required for operation "set-prepared".',
            },
            updates: {
              type: 'object',
              description:
                'Required for operation "update". Supports name, img, level, prepared, preparationMode, description, and system.',
              properties: {
                name: { type: 'string', description: 'New spell name' },
                img: { type: 'string', description: 'New icon path' },
                level: {
                  type: 'number',
                  minimum: 0,
                  maximum: 9,
                  description: 'Spell level, 0 for cantrip',
                },
                prepared: { type: 'boolean', description: 'Prepared state' },
                preparationMode: {
                  type: 'string',
                  enum: ['prepared', 'always', 'atwill', 'innate', 'pact', 'daily', 'limited'],
                  description: 'D&D 5e spell preparation mode',
                },
                description: {
                  type: 'string',
                  description: 'Spell description HTML/text, written to system.description.value',
                },
                system: {
                  type: 'object',
                  additionalProperties: true,
                  description:
                    'Advanced D&D 5e system-data patch, passed through to Foundry DataModel.',
                },
              },
            },
          },
          required: ['operation', 'actorIdentifier', 'spellIdentifier'],
        },
      },
    ];
  }

  async handleUpdateActorSpellbook(args: unknown): Promise<any> {
    const request = DnD5eUpdateActorSpellbookRequestSchema.parse(args);

    this.logger.info('Updating D&D 5e actor spellbook', {
      operation: request.operation,
      actorIdentifier: request.actorIdentifier,
      spellIdentifier: request.spellIdentifier,
    });

    try {
      const system = await detectGameSystem(this.foundryClient, this.logger);
      if (system !== 'dnd5e') {
        throw new Error(
          `dnd5e-update-actor-spellbook requires D&D 5e. ` +
            `Detected system: "${getCachedSystemId() ?? 'unknown'}".`
        );
      }

      const result = await this.foundryClient.query(
        'foundry-mcp-bridge.update-actor-spellbook',
        request
      );

      this.logger.info('D&D 5e actor spellbook update complete', {
        actorId: result.actorId,
        spellId: result.spellId,
        operation: request.operation,
      });

      return result;
    } catch (error) {
      this.errorHandler.handleToolError(error, 'dnd5e-update-actor-spellbook', 'spellbook update');
    }
  }
}
