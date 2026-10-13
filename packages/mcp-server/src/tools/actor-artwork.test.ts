import { describe, expect, it, vi } from 'vitest';
import { ActorArtworkTools, SetActorArtworkRequestSchema } from './actor-artwork.js';

function createTools() {
  const query = vi.fn().mockResolvedValue({ success: true });
  const logger = {
    child: () => logger,
    info: vi.fn(),
    error: vi.fn(),
  };

  return {
    query,
    tools: new ActorArtworkTools({
      foundryClient: { query } as any,
      logger: logger as any,
    }),
  };
}

describe('SetActorArtworkRequestSchema', () => {
  it('defaults sceneTokenScope to none', () => {
    const result = SetActorArtworkRequestSchema.parse({
      actorIdentifier: 'Actor ID',
      tokenPath: 'assets/tokens/actor.png',
    });

    expect(result.sceneTokenScope).toBe('none');
  });

  it('requires at least one artwork path', () => {
    expect(() => SetActorArtworkRequestSchema.parse({ actorIdentifier: 'Actor ID' })).toThrow();
  });

  it('requires tokenPath when propagating to scenes', () => {
    expect(() =>
      SetActorArtworkRequestSchema.parse({
        actorIdentifier: 'Actor ID',
        portraitPath: 'assets/portraits/actor.png',
        sceneTokenScope: 'active',
      })
    ).toThrow();
  });
});

describe('ActorArtworkTools', () => {
  it('exposes set-actor-artwork', () => {
    const { tools } = createTools();
    expect(tools.getToolDefinitions().map(tool => tool.name)).toContain('set-actor-artwork');
  });

  it('forwards validated input to the Foundry bridge', async () => {
    const { tools, query } = createTools();

    await tools.handleSetActorArtwork({
      actorIdentifier: 'Actor ID',
      tokenPath: 'assets/tokens/actor.png',
      sceneTokenScope: 'active',
    });

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.set-actor-artwork', {
      actorIdentifier: 'Actor ID',
      tokenPath: 'assets/tokens/actor.png',
      sceneTokenScope: 'active',
    });
  });
});
