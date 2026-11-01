/**
 * ACKS acks-add-feature tool tests.
 *
 * The item embedding runs in the Foundry module; these cover the MCP tool layer:
 * the ACKS item data built for attacks/abilities, the spell-slot update, and
 * input validation.
 */

import { describe, it, expect, vi } from 'vitest';
import { AcksAddFeatureTool } from './add-feature.js';

function makeTool(extra?: (method: string, data: any) => unknown) {
  const query = vi.fn(async (method: string, data: any) => {
    if (method === 'foundry-mcp-bridge.getWorldInfo') return { system: { id: 'acks' } };
    const custom = extra?.(method, data);
    if (custom !== undefined) return custom;
    if (method === 'foundry-mcp-bridge.addActorItems') {
      return {
        actorId: 'A1',
        actorName: 'Wight',
        created: data.items.map((i: any, n: number) => ({
          id: `I${n}`,
          name: i.name,
          type: i.type,
        })),
      };
    }
    return { success: true };
  });
  const logger: any = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: () => logger,
  };
  const tool = new AcksAddFeatureTool({ foundryClient: { query } as any, logger });
  return { tool, query };
}

const lastCall = (query: any, method: string) =>
  query.mock.calls.filter((c: any[]) => c[0] === method).at(-1)?.[1];

describe('acks-add-feature definition', () => {
  it('requires featureType and actorIdentifier', () => {
    const [def] = makeTool().tool.getToolDefinitions();
    expect(def.name).toBe('acks-add-feature');
    expect(def.inputSchema.required).toEqual(['featureType', 'actorIdentifier']);
    expect((def.inputSchema.properties as any).featureType.enum).toEqual([
      'attack',
      'ability',
      'spellcasting',
    ]);
  });
});

describe('acks-add-feature attack', () => {
  it('embeds a weapon item with the ACKS schema', async () => {
    const { tool, query } = makeTool();
    const res = await tool.handleAddFeature({
      featureType: 'attack',
      actorIdentifier: 'Wight',
      featureName: 'Claw',
      damage: '1d6',
      special: ['silver'],
    });

    expect(res.success).toBe(true);
    const payload = lastCall(query, 'foundry-mcp-bridge.addActorItems');
    expect(payload.actorIdentifier).toBe('Wight');
    const [item] = payload.items;
    expect(item.type).toBe('weapon');
    expect(item.system.damage.base.formula).toBe('1d6');
    expect(item.system.melee).toBe(true);
    expect(item.system.missile).toBe(false);
    expect(item.system.special.silver).toBe(true);
    expect(item.system.special.cleave).toBe(false);
    expect(item.system.equipped).toBe(false);
    expect(item.system.bonus).toEqual({ attack: 0, damage: 0 });
  });

  it('handles missile attacks with ranges', async () => {
    const { tool, query } = makeTool();
    await tool.handleAddFeature({
      featureType: 'attack',
      actorIdentifier: 'Wight',
      featureName: 'Spit',
      damage: '1d4+1',
      attackType: 'missile',
      range: { short: 30, medium: 60, long: 90 },
    });
    const [item] = lastCall(query, 'foundry-mcp-bridge.addActorItems').items;
    expect(item.system.melee).toBe(false);
    expect(item.system.missile).toBe(true);
    expect(item.system.range).toEqual({ short: 30, medium: 60, long: 90 });
  });

  it('rejects a bad damage formula', async () => {
    const { tool } = makeTool();
    await expect(
      tool.handleAddFeature({
        featureType: 'attack',
        actorIdentifier: 'Wight',
        featureName: 'Claw',
        damage: 'lots',
      })
    ).rejects.toThrow();
  });
});

describe('acks-add-feature ability', () => {
  it('embeds an ability item', async () => {
    const { tool, query } = makeTool();
    await tool.handleAddFeature({
      featureType: 'ability',
      actorIdentifier: 'Wight',
      featureName: 'Regeneration',
      description: 'Regains 3 hp per round.',
    });
    const [item] = lastCall(query, 'foundry-mcp-bridge.addActorItems').items;
    expect(item.type).toBe('ability');
    expect(item.system.description).toBe('Regains 3 hp per round.');
    expect(item.system.rollType).toBe('result');
  });
});

describe('acks-add-feature spellcasting', () => {
  it('sets slots and keeps unrelated spells keys', async () => {
    const { tool, query } = makeTool(method =>
      method === 'foundry-mcp-bridge.getCharacterInfo'
        ? {
            id: 'A1',
            name: 'Wight',
            system: {
              spells: { enabled: false, '1': { max: 0 }, '2': { max: 0 }, '3': { max: 0 } },
            },
          }
        : undefined
    );
    const res = await tool.handleAddFeature({
      featureType: 'spellcasting',
      actorIdentifier: 'Wight',
      spellSlots: { '1': 2, '2': 1 },
    });

    expect(res.success).toBe(true);
    const upd = lastCall(query, 'foundry-mcp-bridge.updateActors');
    expect(upd.updates[0].id).toBe('A1');
    expect(upd.updates[0].system.spells).toEqual({
      enabled: true,
      '1': { max: 2 },
      '2': { max: 1 },
      '3': { max: 0 },
    });
  });

  it('rejects an invalid spell level', async () => {
    const { tool } = makeTool();
    await expect(
      tool.handleAddFeature({
        featureType: 'spellcasting',
        actorIdentifier: 'Wight',
        spellSlots: { '7': 1 },
      })
    ).rejects.toThrow();
  });

  it('rejects an unknown featureType', async () => {
    const { tool } = makeTool();
    await expect(
      tool.handleAddFeature({ featureType: 'aura', actorIdentifier: 'Wight' })
    ).rejects.toThrow();
  });
});
