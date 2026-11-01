import type { CreatureIndexAdapter, SystemAdapter } from './system-adapter.js';

// ACKS (Adventurer Conqueror King System) Enhanced Creature Index
//
// ACKS monsters are rated by Hit Dice (`system.hp.hd`, e.g. "3d8", "1d4+1")
// rather than CR/level. `challengeRating` mirrors `hitDice` so the existing
// `challengeRating` criterion of listCreaturesByCriteria works as an HD filter.
export interface AcksCreatureIndex {
  id: string;
  name: string;
  type: string; // 'monster' | 'character'
  pack: string;
  packLabel: string;
  hitDice: number; // numeric HD (1d4 => 0.5, 3d8 => 3)
  hd: string; // raw HD string, e.g. "3d8+1"
  challengeRating: number; // alias of hitDice
  creatureType: string;
  size: string;
  hitPoints: number;
  armorClass: number;
  morale: number;
  xp: number;
  alignment: string;
  movement: number;
  attackThrow: number;
  hasSpells: boolean;
  description?: string;
  img?: string;
}

/**
 * Convert an ACKS hit dice string ("3d8", "1d4+1", "2") to a numeric HD.
 * Dice smaller than d8 count proportionally (1d4 => 0.5).
 */
export function parseAcksHitDice(hd: unknown): number {
  if (typeof hd === 'number') return hd;
  const m = /^\s*(\d+(?:\.\d+)?)\s*(?:d\s*(\d+))?/i.exec(String(hd ?? ''));
  if (!m) return 0;
  const count = parseFloat(m[1]);
  const sides = m[2] ? parseInt(m[2], 10) : 8;
  const value = sides < 8 ? (count * sides) / 8 : count;
  return Math.round(value * 100) / 100;
}

function passesAcksCriteria(creature: AcksCreatureIndex, criteria: any): boolean {
  // `challengeRating` is accepted as an alias for Hit Dice; `hitDice` also works.
  const hdCrit = criteria.hitDice ?? criteria.challengeRating;
  if (hdCrit !== undefined) {
    if (typeof hdCrit === 'number') {
      if (creature.hitDice !== hdCrit) return false;
    } else {
      if (hdCrit.min !== undefined && creature.hitDice < hdCrit.min) return false;
      if (hdCrit.max !== undefined && creature.hitDice > hdCrit.max) return false;
    }
  }
  if (criteria.hasSpells !== undefined && creature.hasSpells !== criteria.hasSpells) return false;
  if (criteria.actorType && creature.type !== criteria.actorType) return false;
  if (criteria.alignment && creature.alignment !== criteria.alignment) return false;
  return true;
}

const acksCreatures: CreatureIndexAdapter<AcksCreatureIndex> = {
  label: 'ACKS',
  actorTypes: ['monster', 'character'],
  owns: (creature: any): creature is AcksCreatureIndex => 'hitDice' in creature,
  extract(doc: any, pack: any): AcksCreatureIndex {
    const system = (doc as any).system ?? {};
    const hd = String(system.hp?.hd ?? '');
    const spellSlots = Object.entries(system.spells ?? {}).some(
      ([k, v]: [string, any]) => /^\d+$/.test(k) && (v?.max ?? 0) > 0
    );
    const hasSpellItems = Array.from((doc as any).items ?? []).some((i: any) => i.type === 'spell');
    const hitDice = parseAcksHitDice(hd);
    const bio = typeof system.details?.biography === 'string' ? system.details.biography : '';

    return {
      id: doc.id,
      name: doc.name,
      type: doc.type,
      pack: pack.collection,
      packLabel: pack.metadata?.label ?? pack.collection,
      hitDice,
      hd,
      challengeRating: hitDice,
      creatureType: '',
      size: '',
      hitPoints: system.hp?.max ?? system.hp?.value ?? 0,
      armorClass: system.ac?.value ?? 0,
      morale: system.details?.morale ?? 0,
      xp: system.details?.xp ?? 0,
      alignment: system.details?.alignment ?? '',
      movement: system.movement?.base ?? 0,
      attackThrow: system.attack?.throw ?? 0,
      hasSpells: system.spells?.enabled === true || spellSlots || hasSpellItems,
      description: bio
        .replace(/<[^>]*>/g, '')
        .trim()
        .slice(0, 300),
      img: (doc as any).img,
    };
  },
  matches: passesAcksCriteria,
  powerLevel: (a: AcksCreatureIndex) => a.hitDice,
  toResult: (a: AcksCreatureIndex) => ({
    armorClass: a.armorClass,
    hasSpells: a.hasSpells,
    alignment: a.alignment,
    hitDice: a.hitDice,
    hd: a.hd,
    challengeRating: a.hitDice,
    morale: a.morale,
    xp: a.xp,
    movement: a.movement,
    attackThrow: a.attackThrow,
    summary: `${a.hd || a.hitDice + ' HD'} ${a.type} (AC ${a.armorClass}, morale ${a.morale}, ${a.xp} XP) from ${a.packLabel}`,
  }),
};

/**
 * ACKS (Adventurer Conqueror King System) schema reference. Field paths and enum
 * values observed in the system's compendiums (schema version 5).
 */
function getAcksSystemSchema(): Record<string, any> {
  const sys = (game as any).system;
  return {
    system: 'acks',
    systemVersion: sys?.version,
    description:
      'ACKS reference. Actor types: character, monster. Create with createActors / addActorItems; field paths are relative to `system`. Wrong keys are silently ignored.',
    actorTypes: ['character', 'monster'],
    itemTypes: ['item', 'weapon', 'armor', 'spell', 'ability', 'language', 'money', 'bundle'],
    actors: {
      monster: {
        'hp.hd':
          'Hit dice string, e.g. "3d8", "1d8+1", "1d4". Informational; set hp.value and hp.max yourself.',
        'hp.value / hp.max': 'Current / maximum hit points (numbers)',
        'ac.value':
          'Armor class as printed in the monster entry (ACKS AC is ascending: unarmored 0, higher is better); ac.mod is a bonus',
        'attack.throw': 'Attack throw target (d20 roll-over), number',
        'saves.{death|paralysis|blast|spell|implements}.value':
          'Saving throw targets (d20 roll-over), numbers',
        'movement.base': 'Base movement in feet per turn (e.g. 120 = 40 per round)',
        'details.morale': 'Morale modifier (number, e.g. -1..+4)',
        'details.xp': 'XP award (number)',
        'details.alignment':
          'Free text; the compendiums mix "Lawful"/"Neutral"/"Chaotic" and "L"/"N"/"C". Prefer the full word.',
        'details.appearing.d / .w':
          'Number appearing in dungeon / wilderness, dice string e.g. "1d6"',
        'details.treasure.type': 'Treasure type code',
        'spells.enabled': 'Boolean; spells.1..6.max = spell slots per level',
        attacks: 'Free-text attack description shown on the sheet',
      },
      character: {
        note: 'Shares the hp / ac / saves / movement structure with monster; class and ability scores are managed by the sheet.',
      },
    },
    items: {
      weapon: {
        'damage.base.formula': 'Damage dice, e.g. "1d8"',
        'damage.alternate.formula': 'Alternate (two-handed/versatile) damage, may be empty',
        'range.short / .medium / .long': 'Missile ranges in feet',
        melee: 'Boolean',
        missile: 'Boolean (both true = can be thrown/used either way)',
        'bonus.attack / bonus.damage': 'Magic bonuses (numbers)',
        'special.<flag>': [
          'cleave',
          'entangling',
          'flexible',
          'handy',
          'impact',
          'incapacitating',
          'long',
          'mounted',
          'silver',
          'slow',
          'thrown',
        ],
        equipped: 'Boolean',
        cost: 'Cost in gp',
        weight6: 'Weight in sixths of a stone',
      },
      armor: {
        type: ['unarmored', 'light', 'heavy', 'shield'],
        'ac.value': 'AC provided',
        equipped: 'Boolean',
        cost: 'Cost in gp',
        weight6: 'Weight in sixths of a stone',
      },
      spell: {
        lvl: 'Spell level (1-6)',
        class: ['Arcane', 'Divine', 'Mage'],
        duration: 'Free text, e.g. "6 Turns+1/lvl"',
        range: 'Free text, e.g. "Self", "120\'"',
        save: 'Free text, optional',
        'memorized / cast': 'Counters (numbers)',
      },
      ability: {
        proficiencytype: ['general'],
        rollType: ['result', 'above', 'below'],
        rollTarget: 'Number',
        roll: 'Formula, optional',
        requirements: 'Free text',
      },
      item: {
        subtype: ['item', 'clothing'],
        'quantity.value': 'Number',
        cost: 'gp',
        weight6: 'Sixths of a stone',
      },
      money: {
        coppervalue: 'Value in copper',
        quantity: 'Number carried',
        quantitybank: 'Number banked',
      },
      language: { note: 'Only a description.' },
    },
    compendiums: {
      monsters: 'acks.acks-monsters',
      monsterAbilities: 'acks.acks-monster-abilities',
      arcaneSpells: 'acks.acks-arcane-spells',
      divineSpells: 'acks.acks-divine-spells',
      classAbilities: 'acks.acks-class-abilities',
      proficiencies: 'acks.acks-proficiencies',
      equipment: 'acks.acks-all-equipment',
      adventuringEquipment: 'acks.acks-adventuring-equipment',
    },
    creatureSearch:
      'listCreaturesByCriteria: use challengeRating (or hitDice) as {min,max} Hit Dice, hasSpells, actorType, alignment.',
  };
}

export const acksAdapter: SystemAdapter = {
  id: 'acks',
  creatures: acksCreatures,
  schema: getAcksSystemSchema,
  compendiumImport: {
    spells: {
      defaultPacks: ['acks.acks-arcane-spells', 'acks.acks-divine-spells'],
      packHint: 'Valid pack IDs for ACKS: "acks.acks-arcane-spells" or "acks.acks-divine-spells".',
    },
    features: {
      defaultPacks: [
        'acks.acks-monster-abilities',
        'acks.acks-class-abilities',
        'acks.acks-proficiencies',
      ],
      packHint:
        'Valid pack IDs for ACKS: "acks.acks-monster-abilities", "acks.acks-class-abilities" or "acks.acks-proficiencies".',
    },
  },
};
