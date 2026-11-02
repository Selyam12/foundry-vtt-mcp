/**
 * acks-location tool tests: edits on acks-extras location actors.
 */

import { describe, it, expect, vi } from 'vitest';
import { AcksLocationTool } from './location.js';

const inn = {
  id: 'L1',
  name: 'Silk Pony Inn',
  type: 'acks-extras.location',
  system: {
    notes: '<p>Book text.</p>',
    gmNotes: '',
    stack: { count: 1, label: '' },
    roster: [{ uuid: '', name: 'Innkeeper', kind: 'actor', quantity: 1, notes: '', hidden: false }],
    market: {
      marketClassOverride: null,
      urbanFamilies: 50,
      settlementAlignment: 'lawful',
      postings: [{ id: 'p' }],
    },
  },
};
const cave = { id: 'L2', name: 'Cave', type: 'acks-extras.location', system: { market: null } };
const actors: Record<string, any> = {
  'Silk Pony Inn': inn,
  Cave: cave,
  Town: { id: 'L3', name: 'Town', type: 'acks-extras.location', system: {} },
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
  return { tool: new AcksLocationTool({ foundryClient: { query } as any, logger }), query };
}

const run = async (args: any, id = 'Silk Pony Inn') => {
  const { tool, query } = makeTool();
  await tool.handleLocation({ locationIdentifier: id, ...args });
  return query.mock.calls.find((c: any[]) => c[0] === 'foundry-mcp-bridge.updateActors')?.[1]
    .updates[0];
};

describe('acks-location', () => {
  it('appends GM notes as an escaped paragraph without touching the book notes', async () => {
    const upd = await run({ action: 'set-info', gmNotes: 'Owned by <the guild>' });
    expect(upd.system).toEqual({ gmNotes: '<p>Owned by &lt;the guild&gt;</p>' });
  });

  it('appends to existing notes and replaces on request', async () => {
    const app = await run({ action: 'set-info', notes: 'More.' });
    expect(app.system.notes).toBe('<p>Book text.</p><p>More.</p>');
    const rep = await run({ action: 'set-info', notes: 'Only this', textMode: 'replace' });
    expect(rep.system.notes).toBe('<p>Only this</p>');
  });

  it('links the parent place, merges the stack and clears the role', async () => {
    const upd = await run({
      action: 'set-info',
      parent: 'Town',
      stackCount: 8,
      stackLabel: 'Bay',
      role: '',
    });
    expect(upd.system).toMatchObject({
      parentUuid: 'Actor.L3',
      stack: { count: 8, label: 'Bay' },
      role: '',
    });
  });

  it('adds then removes a roster row', async () => {
    const add = await run({
      action: 'add-roster',
      name: 'Wight',
      actor: 'Wight',
      kind: 'monster',
      quantity: 2,
    });
    expect(add.system.roster).toHaveLength(2);
    expect(add.system.roster[1]).toMatchObject({ uuid: 'Actor.M1', kind: 'monster', quantity: 2 });
    const rm = await run({ action: 'remove-roster', name: 'innkeeper' });
    expect(rm.system.roster).toHaveLength(0);
  });

  it('adjusts an existing market and refuses a place without one', async () => {
    const upd = await run({ action: 'set-market', marketClassOverride: 3 });
    expect(upd.system.market).toMatchObject({
      marketClassOverride: 3,
      urbanFamilies: 50,
      postings: [{ id: 'p' }],
    });
    const { tool } = makeTool();
    await expect(
      tool.handleLocation({ locationIdentifier: 'Cave', action: 'set-market', urbanFamilies: 10 })
    ).rejects.toThrow(/no market/);
  });

  it('validates input and target type', async () => {
    const { tool } = makeTool();
    await expect(
      tool.handleLocation({ locationIdentifier: 'Cave', action: 'set-info', role: 'castle' })
    ).rejects.toThrow();
    await expect(
      tool.handleLocation({ locationIdentifier: 'Wight', action: 'set-info', region: 'x' })
    ).rejects.toThrow(/not an acks-extras.location/);
    await expect(
      tool.handleLocation({ locationIdentifier: 'Cave', action: 'remove-roster', name: 'Nobody' })
    ).rejects.toThrow(/No roster entry/);
    await expect(
      tool.handleLocation({ locationIdentifier: 'Cave', action: 'set-info', parent: 'Cave' })
    ).rejects.toThrow(/inside itself/);
  });
});
