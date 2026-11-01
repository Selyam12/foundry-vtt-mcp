/**
 * ACKS system adapter tests: character stats / basic info extraction.
 */

import { describe, it, expect } from 'vitest';
import { AcksAdapter } from './adapter.js';

const wight = {
  type: 'monster',
  system: {
    hp: { hd: '3d8', value: 14, max: 14, bhr: '1d3' },
    ac: { value: 4, mod: 0 },
    attack: { throw: 8, mod: { melee: 0, missile: 0 } },
    saves: {
      death: { value: 13 },
      paralysis: { value: 14 },
      blast: { value: 15 },
      spell: { value: 16 },
      implements: { value: 16 },
    },
    movement: { base: 90, mod: 0 },
    spells: { enabled: true, '1': { max: 2 }, '2': { max: 0 } },
    details: { morale: 4, xp: 80, alignment: 'C', biography: '<p>Un   mort-vivant.</p>' },
  },
};

describe('AcksAdapter', () => {
  const adapter = new AcksAdapter();

  it('identifies the acks system only', () => {
    expect(adapter.canHandle('acks')).toBe(true);
    expect(adapter.canHandle('dnd5e')).toBe(false);
  });

  it('extracts character stats', () => {
    const stats = adapter.extractCharacterStats(wight);
    expect(stats.hitDice).toBe('3d8');
    expect(stats.hitPoints).toEqual({ current: 14, max: 14 });
    expect(stats.armorClass.value).toBe(4);
    expect(stats.saves).toEqual({ death: 13, paralysis: 14, blast: 15, spell: 16, implements: 16 });
    expect(stats.spellcasting).toEqual({ enabled: true, slots: { '1': { max: 2 } } });
  });

  it('extracts basic info with a plain-text biography', () => {
    const info = adapter.extractBasicInfo(wight);
    expect(info).toMatchObject({
      actorType: 'monster',
      hitDice: '3d8',
      armorClass: 4,
      morale: 4,
      xp: 80,
    });
    expect(info.biography).toBe('Un mort-vivant.');
  });

  it('omits an empty biography', () => {
    const info = adapter.extractBasicInfo({
      type: 'monster',
      system: { details: { biography: '' } },
    });
    expect(info.biography).toBeUndefined();
  });

  it('documents the actor schema for manage-actors describe', () => {
    expect(adapter.describeActorSchema()).toContain('ACKS Actor Schema');
  });
});

// Shape of a real ACKS character (system schema v5), as created by Foundry.
describe('AcksAdapter with a character', () => {
  const adapter = new AcksAdapter();
  const pc = {
    type: 'character',
    system: {
      hp: { hd: '1d8', value: 4, max: 4, bhr: '1d3' },
      ac: { value: 0, mod: 0 },
      attack: { throw: 10, mod: { missile: 0, melee: 0 } },
      saves: {
        paralysis: { value: 13 },
        death: { value: 14 },
        blast: { value: 15 },
        implements: { value: 16 },
        spell: { value: 17 },
      },
      movement: { base: 120, mod: 0 },
      spells: { '1': { max: 0 }, enabled: false },
      scores: { str: { value: 10 }, int: { value: 10 }, wis: { value: 10 } },
      adventuring: { dungeonbashing: 18, climb: 8, listening: 18, searching: 18, trapbreaking: 18 },
      encumbrance: { max: 20, forcemax: -1 },
      details: {
        biography: '',
        class: 'Fighter',
        level: 3,
        alignment: 'Neutral',
        casterlevel: 0,
        fatepoints: 1,
        xp: { share: 100, next: 2000, value: 0, bonus: 0 },
      },
    },
  };

  it('extracts adventuring throws, encumbrance, fate points and scores', () => {
    const stats = adapter.extractCharacterStats(pc);
    expect(stats.adventuringThrows.trapbreaking).toBe(18);
    expect(stats.encumbrance).toEqual({ max: 20, forcemax: -1 });
    expect(stats.fatePoints).toBe(1);
    expect(stats.casterLevel).toBeUndefined();
    expect(stats.abilityScores.str.value).toBe(10);
  });

  it('reports class and level in basic info, keeping the xp object', () => {
    const info = adapter.extractBasicInfo(pc);
    expect(info).toMatchObject({ actorType: 'character', class: 'Fighter', level: 3 });
    expect(info.xp).toEqual({ share: 100, next: 2000, value: 0, bonus: 0 });
  });
});

describe('AcksAdapter - acks-extras faction and domain', () => {
  const adapter = new AcksAdapter();

  // Shape taken from a real faction actor (system data of the acks-extras module).
  const faction = {
    type: 'acks-extras.faction',
    system: {
      kind: 'merchant',
      seatUuid: 'Actor.seat',
      leaderUuid: 'Actor.leader',
      notes: '',
      gmNotes: '<div><p>The Merchant   Guild controls trade.</p></div>',
      holdings: [{ uuid: 'Actor.emporium', name: '7. Emporium', note: '', hidden: false }],
      members: [
        { uuid: 'Actor.leader', name: 'Guildmaster', kind: 'monster', quantity: 1, notes: '' },
      ],
      relations: [
        {
          uuid: 'Actor.family',
          name: 'The Family',
          stance: 'friendly',
          note: 'p.42',
          hidden: true,
        },
      ],
      parentUuid: '',
      strength: { columns: [], rows: [], note: '', hidden: false },
      controls: [],
      standing: [],
      // compatibility stubs the module adds to every actor
      saves: { implements: { value: 0 } },
      movement: { base: 0 },
    },
  };

  it('reads faction identity and counts without leaking compatibility stubs', () => {
    const info = adapter.extractBasicInfo(faction);
    expect(info).toMatchObject({
      actorType: 'acks-extras.faction',
      kind: 'merchant',
      seat: 'Actor.seat',
      leader: 'Actor.leader',
      memberCount: 1,
      holdingCount: 1,
      relationCount: 1,
    });
    expect(info.gmNotes).toBe('The Merchant Guild controls trade.');
    expect(info.notes).toBeUndefined();
    expect(info.movement).toBeUndefined();
  });

  it('lists members, holdings and relations, hiding empty collections', () => {
    const stats = adapter.extractCharacterStats(faction);
    expect(stats.members).toEqual([
      { name: 'Guildmaster', uuid: 'Actor.leader', kind: 'monster', quantity: 1 },
    ]);
    expect(stats.holdings[0].name).toBe('7. Emporium');
    expect(stats.relations[0]).toMatchObject({
      name: 'The Family',
      stance: 'friendly',
      hidden: true,
    });
    expect(stats.standing).toBeUndefined();
    expect(stats.strength).toBeUndefined();
    expect(stats.saves).toBeUndefined();
  });

  it('flattens standing rows', () => {
    const stats = adapter.extractCharacterStats({
      type: 'acks-extras.faction',
      system: {
        standing: [
          {
            subject: { scope: 'party', uuid: 'Actor.p', name: 'The Party' },
            value: -2,
            reason: 'Theft',
            source: 'manual',
          },
        ],
      },
    });
    expect(stats.standing).toEqual([
      { subject: 'The Party', scope: 'party', value: -2, reason: 'Theft', source: 'manual' },
    ]);
  });

  const domain = {
    type: 'acks-extras.domain',
    system: {
      rulerName: 'Lady Aela',
      title: 'Baroness',
      liegeName: 'The Count',
      classification: 'borderlands',
      territory: [
        { id: 'a', label: 'North', families: 120, count: 2 },
        { id: 'b', label: 'South', families: 80, count: 1 },
      ],
      structures: [{ id: 's', name: 'Keep', count: 1, costGp: 50000 }],
      revenue: {
        land: { peasantPer: 1, note: '' },
        trade: { peasantPer: null, urbanPer: null, note: '' },
      },
      expenses: {},
      tributeGp: 500,
      morale: { current: 1, base: 0 },
      vassalRows: [{ id: 'v', name: 'Ser Orm' }],
    },
  };

  it('summarises a domain with derived peasant families', () => {
    const info = adapter.extractBasicInfo(domain);
    expect(info).toMatchObject({
      ruler: 'Lady Aela',
      liege: 'The Count',
      title: 'Baroness',
      peasantFamilies: 200,
      tributeGp: 500,
    });
  });

  it('keeps only revenue lines that hold a figure', () => {
    const stats = adapter.extractCharacterStats(domain);
    expect(Object.keys(stats.revenue)).toEqual(['land']);
    expect(stats.strongholdCostGp).toBe(50000);
    expect(stats.vassals).toHaveLength(1);
    expect(stats.expenses).toEqual({});
  });
});
