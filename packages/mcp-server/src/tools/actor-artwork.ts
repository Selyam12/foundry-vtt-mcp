import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';

export interface ActorArtworkToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

export const SetActorArtworkRequestSchema = z
  .object({
    actorIdentifier: z.string().min(1),
    portraitPath: z.string().min(1).optional(),
    tokenPath: z.string().min(1).optional(),
    sceneTokenScope: z.enum(['none', 'active', 'all']).optional().default('none'),
  })
  .refine(data => Boolean(data.portraitPath ?? data.tokenPath), {
    message: 'At least one of portraitPath or tokenPath is required',
  })
  .refine(data => data.sceneTokenScope === 'none' || Boolean(data.tokenPath), {
    message: 'tokenPath is required when sceneTokenScope is active or all',
  });

export class ActorArtworkTools {
  private foundryClient: FoundryClient;
  private logger: Logger;

  constructor({ foundryClient, logger }: ActorArtworkToolsOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'ActorArtworkTools' });
  }

  getToolDefinitions() {
    return [
      {
        name: 'set-actor-artwork',
        description:
          'Set an existing actor portrait and/or prototype token image. Optionally propagate the token image to existing scene tokens.',
        inputSchema: {
          type: 'object',
          properties: {
            actorIdentifier: {
              type: 'string',
              description: 'Exact actor name or actor ID',
            },
            portraitPath: {
              type: 'string',
              description: 'Existing Foundry data path for the actor portrait',
            },
            tokenPath: {
              type: 'string',
              description: 'Existing Foundry data path for the prototype token image',
            },
            sceneTokenScope: {
              type: 'string',
              enum: ['none', 'active', 'all'],
              default: 'none',
              description: 'Propagate tokenPath to no scenes, the active scene, or all scenes',
            },
          },
          required: ['actorIdentifier'],
        },
      },
    ];
  }

  async handleSetActorArtwork(args: unknown): Promise<any> {
    const request = SetActorArtworkRequestSchema.parse(args);

    this.logger.info('Setting actor artwork', {
      actorIdentifier: request.actorIdentifier,
      sceneTokenScope: request.sceneTokenScope,
    });

    try {
      return await this.foundryClient.query('foundry-mcp-bridge.set-actor-artwork', request);
    } catch (error) {
      this.logger.error('Failed to set actor artwork', error);
      throw new Error(
        `Failed to set actor artwork: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
