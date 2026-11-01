/**
 * acks-domain tool tests: row edits on acks-extras domain actors.
 */

import { describe, it, expect, vi } from 'vitest';
import { AcksDomainTool } from './domain.js';

const realm = {
  id: 'D1',
  name: 'Barony of Test',
  type: 'acks-extras.domain',
  system: {
    territory: [
      { id: 't1', label: 'North', hexLabels: [], count: 3, families: 100, improvement: 0 },
    ],
    holdings: [
      { uuid: '', name: 'Old Mill', role: 'other', investmentGp: 0, note: '', hidden: false },
    ],
    structures: [{ id: 's1', name: 'Keep', count: 1, costGp: 5000 }],
    revenue: { land: { peasantPer: 5 }, tax: {} },
    expenses: {},
    otherRevenue: [{ id: 'o1', label: 'Toll', gp: 40 }],
    otherExpenses: [],
    favors: [{ id: 'f1', label: 'Levy', note: '' }],
    duties: [],
    morale: { current: 0, base: 1 },
  },
};
const actors: Record<string, any> = {
  'Barony of Test': realm,
  Hallam: { id: 'H1', name: 'Hallam', type: 'character', system: {} },
  Mill: { id: 'L1', name: 'Mill', type: 'acks-extras.location', system: {} },
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
  return { tool: new AcksDomainTool({ foundryClient: { query } as any, logger }), query };
}

const written = (query: any) =>
  query.mock.calls.find((c: any[]) => c[0] === 'foundry-mcp-bridge.updateActors')?.[1].updates[0];
const run = (args: any) => {
  const ctx = makeTool();
  return ctx.tool
    .handleDomain({ domainIdentifier: 'Barony of Test', ...args })
    .then(() => written(ctx.query));
};

describe('acks-domain', () => {
  it('sets info, linking the ruler and merging morale', async () => {
    const upd = await run({
      action: 'set-info',
      ruler: 'Hallam',
      classification: 'borderlands',
      moraleCurrent: 2,
    });
    expect(upd.id).toBe('D1');
    expect(upd.system).toMatchObject({
      rulerUuid: 'Actor.H1',
      classification: 'borderlands',
      morale: { current: 2, base: 1 },
    });
  });

  it('clears the ruler with an empty string', async () => {
    const upd = await run({ action: 'set-info', ruler: '' });
    expect(upd.system.rulerUuid).toBe('');
  });

  it('upserts a territory row and keeps the others', async () => {
    const upd = await run({ action: 'set-territory', label: 'north', families: 150 });
    expect(upd.system.territory).toHaveLength(1);
    expect(upd.system.territory[0]).toMatchObject({
      label: 'north',
      families: 150,
      count: 3,
      id: 't1',
    });
    const added = await run({ action: 'set-territory', label: 'South', count: 2 });
    expect(added.system.territory).toHaveLength(2);
    expect(Object.keys(added.system)).toEqual(['territory']);
  });

  it('adds and removes a holding', async () => {
    const add = await run({
      action: 'add-holding',
      holdingName: 'x',
      holdingActor: 'Mill',
      role: 'settlement',
      marketClass: 5,
    });
    expect(add.system.holdings).toHaveLength(2);
    expect(add.system.holdings[1]).toMatchObject({
      uuid: 'Actor.L1',
      name: 'Mill',
      role: 'settlement',
      marketClass: 5,
    });
    const rm = await run({ action: 'remove-holding', holdingName: 'old mill' });
    expect(rm.system.holdings).toHaveLength(0);
  });

  it('upserts a structure', async () => {
    const upd = await run({ action: 'set-structure', name: 'Keep', costGp: 9000 });
    expect(upd.system.structures[0]).toMatchObject({ id: 's1', costGp: 9000, count: 1 });
  });

  it('merges one finance line without touching the others', async () => {
    const upd = await run({ action: 'set-line', side: 'revenue', line: 'land', urbanPer: 2 });
    expect(upd.system.revenue).toEqual({ land: { peasantPer: 5, urbanPer: 2 }, tax: {} });
    expect(Object.keys(upd.system)).toEqual(['revenue']);
  });

  it('refuses a line that belongs to the other side', async () => {
    const { tool } = makeTool();
    await expect(
      tool.handleDomain({
        domainIdentifier: 'Barony of Test',
        action: 'set-line',
        side: 'revenue',
        line: 'garrison',
        urbanGp: 1,
      })
    ).rejects.toThrow(/Unknown revenue line "garrison"/);
  });

  it('adds an other-line and a favor', async () => {
    const line = await run({ action: 'set-other-line', side: 'expenses', label: 'Bribes', gp: 25 });
    expect(line.system.otherExpenses).toMatchObject([{ label: 'Bribes', gp: 25 }]);
    const fav = await run({
      action: 'set-entry',
      list: 'duties',
      label: 'Muster',
      note: '40 days',
    });
    expect(fav.system.duties).toMatchObject([{ label: 'Muster', note: '40 days' }]);
  });

  it('removes entries and reports a missing one', async () => {
    const ok = await run({ action: 'remove-entry', list: 'favors', label: 'levy' });
    expect(ok.system.favors).toHaveLength(0);
    const { tool } = makeTool();
    await expect(
      tool.handleDomain({
        domainIdentifier: 'Barony of Test',
        action: 'remove-other-line',
        side: 'expenses',
        label: 'None',
      })
    ).rejects.toThrow(/No expenses line "None" found/);
  });

  it('validates enums and the target type', async () => {
    const { tool } = makeTool();
    await expect(
      tool.handleDomain({
        domainIdentifier: 'Barony of Test',
        action: 'set-info',
        classification: 'wild',
      })
    ).rejects.toThrow();
    await expect(
      tool.handleDomain({ domainIdentifier: 'Wight', action: 'set-info', title: 'x' })
    ).rejects.toThrow(/not an acks-extras.domain/);
    await expect(
      tool.handleDomain({ domainIdentifier: 'Nobody', action: 'set-info', title: 'x' })
    ).rejects.toThrow(/Actor not found/);
  });
});
