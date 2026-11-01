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
