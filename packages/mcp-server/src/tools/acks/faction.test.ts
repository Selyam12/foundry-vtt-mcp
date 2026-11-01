/**
 * acks-faction tool tests: row edits on acks-extras faction actors.
 */

import { describe, it, expect, vi } from 'vitest';
import { AcksFactionTool } from './faction.js';

const guild = {
  id: 'F1',
  name: 'Merchant Guild',
  type: 'acks-extras.faction',
  system: {
    members: [
      { uuid: '', name: 'Guildmaster', kind: 'actor', quantity: 1, notes: '', hidden: false },
    ],
    relations: [
      { uuid: 'Actor.F2', name: 'The Family', stance: 'friendly', note: 'p.42', hidden: true },
    ],
    holdings: [{ uuid: 'Actor.L1', name: 'Emporium', note: '', hidden: false }],
    standing: [],
  },
};
const family = { id: 'F2', name: 'The Family', type: 'acks-extras.faction', system: {} };
const hall = { id: 'L2', name: 'Guildhouse', type: 'acks-extras.location', system: {} };
const actors: Record<string, any> = {
  'Merchant Guild': guild,
  'The Family': family,
  Guildhouse: hall,
  Wight: { id: 'M1', name: 'Wight', type: 'monster', system: {} },
};

function makeTool() {
  const query = vi.fn(async (method: string, data: any) => {
    if (method === 'foundry-mcp-bridge.getCharacterInfo') {
      const found = actors[data.characterName];
      if (!found) throw new Error('not found');
      return found;
    }
    return { updated: [], total: 1 };
  });
  const logger: any = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: () => logger,
  };
  return { tool: new AcksFactionTool({ foundryClient: { query } as any, logger }), query };
}

const written = (query: any) =>
  query.mock.calls.find((c: any[]) => c[0] === 'foundry-mcp-bridge.updateActors')?.[1].updates[0];

describe('acks-faction', () => {
  it('adds a member while keeping the existing ones', async () => {
    const { tool, query } = makeTool();
    await tool.handleFaction({
      factionIdentifier: 'Merchant Guild',
      action: 'add-member',
      memberName: 'Wight',
      memberActor: 'Wight',
      kind: 'monster',
      quantity: 2,
    });
    const upd = written(query);
    expect(upd.id).toBe('F1');
    expect(upd.system.members).toHaveLength(2);
    expect(upd.system.members[1]).toMatchObject({ uuid: 'Actor.M1', kind: 'monster', quantity: 2 });
    expect(Object.keys(upd.system)).toEqual(['members']);
  });

  it('upserts a relation without losing its note when only the stance changes', async () => {
    const { tool, query } = makeTool();
    await tool.handleFaction({
      factionIdentifier: 'Merchant Guild',
      action: 'set-relation',
      otherFaction: 'The Family',
      stance: 'hostile',
    });
    const relations = written(query).system.relations;
    expect(relations).toHaveLength(1);
    expect(relations[0]).toMatchObject({
      uuid: 'Actor.F2',
      stance: 'hostile',
      note: 'p.42',
      hidden: true,
    });
  });

  it('rejects an invalid stance before anything is written', async () => {
    const { tool, query } = makeTool();
    await expect(
      tool.handleFaction({
        factionIdentifier: 'Merchant Guild',
        action: 'set-relation',
        otherFaction: 'The Family',
        stance: 'enemy',
      })
    ).rejects.toThrow();
    expect(written(query)).toBeUndefined();
  });

  it('rejects an invalid faction kind', async () => {
    const { tool } = makeTool();
    await expect(
      tool.handleFaction({
        factionIdentifier: 'Merchant Guild',
        action: 'set-info',
        kind: 'thieves',
      })
    ).rejects.toThrow();
  });

  it('refuses a target that is not a faction', async () => {
    const { tool, query } = makeTool();
    await expect(
      tool.handleFaction({ factionIdentifier: 'Wight', action: 'remove-member', memberName: 'x' })
    ).rejects.toThrow(/not an acks-extras.faction/);
    expect(written(query)).toBeUndefined();
  });

  it('fails when removing a member that does not exist', async () => {
    const { tool, query } = makeTool();
    await expect(
      tool.handleFaction({
        factionIdentifier: 'Merchant Guild',
        action: 'remove-member',
        memberName: 'Nobody',
      })
    ).rejects.toThrow(/No member/);
    expect(written(query)).toBeUndefined();
  });

  it('adds a holding linked to a location actor and a standing row', async () => {
    const { tool, query } = makeTool();
    await tool.handleFaction({
      factionIdentifier: 'Merchant Guild',
      action: 'add-holding',
      holdingName: 'x',
      holdingActor: 'Guildhouse',
    });
    expect(written(query).system.holdings.at(-1)).toMatchObject({
      uuid: 'Actor.L2',
      name: 'Guildhouse',
    });

    const second = makeTool();
    await second.tool.handleFaction({
      factionIdentifier: 'Merchant Guild',
      action: 'add-standing',
      subjectName: 'The Party',
      value: -2,
      reason: 'Theft',
    });
    expect(written(second.query).system.standing[0]).toEqual({
      subject: { scope: 'party', uuid: '', name: 'The Party' },
      value: -2,
      reason: 'Theft',
      time: 0,
      source: 'manual',
    });
  });

  it('sets the leader as an actor uuid and clears the seat with an empty string', async () => {
    const { tool, query } = makeTool();
    await tool.handleFaction({
      factionIdentifier: 'Merchant Guild',
      action: 'set-info',
      kind: 'guild',
      leader: 'Wight',
      seat: '',
    });
    expect(written(query).system).toEqual({ kind: 'guild', leaderUuid: 'Actor.M1', seatUuid: '' });
  });
});
