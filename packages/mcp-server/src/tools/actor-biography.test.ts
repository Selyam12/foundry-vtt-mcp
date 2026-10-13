import { describe, expect, it, vi } from 'vitest';
import { ActorBiographyTools, UpdateActorBiographyRequestSchema } from './actor-biography.js';

function createTools() {
  const query = vi.fn().mockResolvedValue({ success: true });
  const logger = {
    child: () => logger,
    info: vi.fn(),
    error: vi.fn(),
  };

  return {
    query,
    tools: new ActorBiographyTools({
      foundryClient: { query } as any,
      logger: logger as any,
    }),
  };
}

describe('UpdateActorBiographyRequestSchema', () => {
  it('defaults biographyField to value', () => {
    const result = UpdateActorBiographyRequestSchema.parse({
      actorIdentifier: 'Actor ID',
      biography: '<p>New biography</p>',
    });

    expect(result.biographyField).toBe('value');
  });

  it('allows clearing the biography with an empty string', () => {
    const result = UpdateActorBiographyRequestSchema.parse({
      actorIdentifier: 'Actor ID',
      biography: '',
    });

    expect(result.biography).toBe('');
  });

  it('requires an actor identifier', () => {
    expect(() => UpdateActorBiographyRequestSchema.parse({ biography: 'Text' })).toThrow();
  });
});

describe('ActorBiographyTools', () => {
  it('exposes update-actor-biography', () => {
    const { tools } = createTools();
    expect(tools.getToolDefinitions().map(tool => tool.name)).toContain('update-actor-biography');
  });

  it('forwards validated input to the Foundry bridge', async () => {
    const { tools, query } = createTools();

    await tools.handleUpdateActorBiography({
      actorIdentifier: 'Actor ID',
      biography: '<p>Updated</p>',
      biographyField: 'public',
    });

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.update-actor-biography', {
      actorIdentifier: 'Actor ID',
      biography: '<p>Updated</p>',
      biographyField: 'public',
    });
  });
});
