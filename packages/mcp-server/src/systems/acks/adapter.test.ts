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
