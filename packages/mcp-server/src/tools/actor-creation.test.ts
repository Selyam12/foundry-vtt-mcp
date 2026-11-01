/**
 * create-actor-from-compendium: the `folder` parameter and its default.
 * The folder itself is created by the Foundry module; these cover the MCP tool layer.
 */

import { describe, it, expect, vi } from 'vitest';
import { ActorCreationTools } from './actor-creation.js';

function makeTools() {
  const query = vi.fn(async () => ({
    success: true,
    actors: [{ id: 'A1', name: 'Gob', originalName: 'Goblin', sourcePackLabel: 'Monsters' }],
    totalCreated: 1,
    totalRequested: 1,
  }));
  const logger: any = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: () => logger,
  };
  const tools = new ActorCreationTools({ foundryClient: { query } as any, logger });
  return { tools, query };
}

const base = { packId: 'acks.acks-monsters', itemId: 'abc', names: ['Gob'] };

describe('create-actor-from-compendium folder parameter', () => {
  it('is documented with the default folder', () => {
    const def = makeTools().tools.getToolDefinitions()[0];
    const folder = (def.inputSchema.properties as any).folder;
    expect(folder.default).toBe('Foundry MCP Creatures');
    expect(def.inputSchema.required).not.toContain('folder');
  });

  it('defaults to "Foundry MCP Creatures"', async () => {
    const { tools, query } = makeTools();
    await tools.handleCreateActorFromCompendium(base);
    const [method, data] = query.mock.calls[0] as unknown as [string, any];
    expect(method).toBe('foundry-mcp-bridge.createActorFromCompendium');
    expect(data.folder).toBe('Foundry MCP Creatures');
  });

  it('forwards a custom folder', async () => {
    const { tools, query } = makeTools();
    await tools.handleCreateActorFromCompendium({ ...base, folder: 'Mes morts-vivants' });
    const [, data] = query.mock.calls[0] as unknown as [string, any];
    expect(data.folder).toBe('Mes morts-vivants');
  });

  it('rejects an empty folder name', async () => {
    const { tools } = makeTools();
    await expect(
      tools.handleCreateActorFromCompendium({ ...base, folder: '   ' })
    ).rejects.toThrow();
  });
});
