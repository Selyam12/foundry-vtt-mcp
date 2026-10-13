import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';

export interface ActorBiographyToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

export const UpdateActorBiographyRequestSchema = z.object({
  actorIdentifier: z.string().min(1),
  biography: z.string(),
  biographyField: z.enum(['value', 'public']).optional().default('value'),
});

export class ActorBiographyTools {
  private foundryClient: FoundryClient;
  private logger: Logger;

  constructor({ foundryClient, logger }: ActorBiographyToolsOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'ActorBiographyTools' });
  }

  getToolDefinitions() {
    return [
      {
        name: 'update-actor-biography',
        description:
          'Replace an existing actor biography field. Uses exact actor name or actor ID to avoid mutating the wrong actor.',
        inputSchema: {
          type: 'object',
          properties: {
            actorIdentifier: {
              type: 'string',
              description: 'Exact actor name or actor ID',
            },
            biography: {
              type: 'string',
              description:
                'New biography HTML/text content. Empty string clears the selected biography field.',
            },
            biographyField: {
              type: 'string',
              enum: ['value', 'public'],
              default: 'value',
              description:
                'Biography field to replace: value for GM/private biography, public for public notes',
            },
          },
          required: ['actorIdentifier', 'biography'],
        },
      },
    ];
  }

  async handleUpdateActorBiography(args: unknown): Promise<any> {
    const request = UpdateActorBiographyRequestSchema.parse(args);

    this.logger.info('Updating actor biography', {
      actorIdentifier: request.actorIdentifier,
      biographyField: request.biographyField,
    });

    try {
      return await this.foundryClient.query('foundry-mcp-bridge.update-actor-biography', request);
    } catch (error) {
      this.logger.error('Failed to update actor biography', error);
      throw new Error(
        `Failed to update actor biography: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }
}
