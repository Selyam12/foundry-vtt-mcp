/**
 * ACKS (Adventurer Conqueror King System) Adapter
 *
 * Implements SystemAdapter for the `acks` Foundry system. Data model reference
 * (schema version 5): actor types `character` and `monster`; hit dice live in
 * `system.hp.hd` (string such as "3d8"), AC is ascending (`system.ac.value`),
 * saves are d20 roll-over targets (`death`, `paralysis`, `blast`, `spell`,
 * `implements`), movement in feet per turn (`system.movement.base`).
 *
 * Creature indexing and search criteria run inside the Foundry module (see the
 * module's system-acks.ts); this adapter covers what the MCP server formats:
 * character stats, basic info and the manage-actors "describe" notes.
 */

import type { SystemAdapter, SystemMetadata, SystemCreatureIndex } from '../types.js';
import { z } from 'zod';

const AcksFiltersSchema = z
  .object({
    challengeRating: z.any().optional(), // Hit Dice (alias used by list-creatures-by-criteria)
    hitDice: z.any().optional(),
    hasSpells: z.boolean().optional(),
    actorType: z.string().optional(),
    alignment: z.string().optional(),
  })
  .passthrough();

const SAVE_NAMES = ['death', 'paralysis', 'blast', 'spell', 'implements'] as const;

export class AcksAdapter implements SystemAdapter {
  getMetadata(): SystemMetadata {
    return {
      id: 'acks',
      name: 'acks',
      displayName: 'Adventurer Conqueror King System',
      version: '1.0.0',
      description:
        'Support for ACKS: hit dice, ascending AC, five saving throws, morale, XP, ' +
        'arcane/divine spells and monster abilities from the ACKS compendiums.',
      supportedFeatures: {
        creatureIndex: false, // built in the Foundry module
        characterStats: true,
        spellcasting: true,
        powerLevel: false,
      },
    };
  }

  canHandle(systemId: string): boolean {
    return systemId.toLowerCase() === 'acks';
  }

  /** Delegated to the module-side ACKS creature index (browser context). */
  extractCreatureData(
    _doc: any,
    _pack: any
  ): { creature: SystemCreatureIndex; errors: number } | null {
    throw new Error('extractCreatureData is handled by the Foundry module for ACKS');
  }

  getFilterSchema() {
    return AcksFiltersSchema;
  }

  matchesFilters(_creature: SystemCreatureIndex, _filters: Record<string, any>): boolean {
    // Filtering is done by the module's ACKS creature index.
    return true;
  }

  getDataPaths(): Record<string, string | null> {
    return {
      hitDice: 'system.hp.hd',
      hitPoints: 'system.hp.value',
      maxHitPoints: 'system.hp.max',
      armorClass: 'system.ac.value',
      attackThrow: 'system.attack.throw',
      saves: 'system.saves',
      movement: 'system.movement.base',
      morale: 'system.details.morale',
      xp: 'system.details.xp',
      alignment: 'system.details.alignment',
      spells: 'system.spells',
      challengeRating: null,
      creatureType: null,
      legendaryActions: null,
      legendaryResistances: null,
      perception: null,
      rarity: null,
    };
  }

  formatCreatureForList(creature: SystemCreatureIndex): any {
    return {
      id: creature.id,
      name: creature.name,
      type: creature.type,
      pack: { id: creature.packName, label: creature.packLabel },
      hasImage: !!creature.img,
    };
  }

  formatCreatureForDetails(creature: SystemCreatureIndex): any {
    return { ...this.formatCreatureForList(creature), systemData: creature.systemData };
  }

  describeFilters(filters: Record<string, any>): string {
    const parts: string[] = [];
    const hd = filters.hitDice ?? filters.challengeRating;
    if (typeof hd === 'number') parts.push(`HD ${hd}`);
    else if (hd && typeof hd === 'object') parts.push(`HD ${hd.min ?? 0}-${hd.max ?? 30}`);
    if (filters.hasSpells !== undefined)
      parts.push(filters.hasSpells ? 'spellcaster' : 'no spells');
    if (filters.actorType) parts.push(`type=${filters.actorType}`);
    if (filters.alignment) parts.push(`alignment=${filters.alignment}`);
    return parts.length ? parts.join(', ') : 'no filters';
  }

  getPowerLevel(_creature: SystemCreatureIndex): number | undefined {
    return undefined;
  }

  // ─── Character data (MCP server / Node.js context) ───────────────────────────

  extractCharacterStats(actorData: any): any {
    const system = actorData.system || {};
    const stats: any = {};

    if (system.hp) {
      stats.hitDice = system.hp.hd;
      stats.hitPoints = { current: system.hp.value, max: system.hp.max };
      if (system.hp.bhr) stats.baseHealingRate = system.hp.bhr;
    }
    if (system.ac) {
      stats.armorClass = { value: system.ac.value, modifier: system.ac.mod ?? 0 };
    }
    if (system.attack) {
      stats.attackThrow = { value: system.attack.throw, modifiers: system.attack.mod };
    }

    if (system.saves) {
      stats.saves = {};
      for (const name of SAVE_NAMES) {
        if (system.saves[name]?.value !== undefined) stats.saves[name] = system.saves[name].value;
      }
      if (system.save?.mod) stats.saveModifier = system.save.mod;
    }

    if (system.movement) {
      stats.movement = { base: system.movement.base, mod: system.movement.mod ?? 0 };
    }
    if (system.initiative) stats.initiative = system.initiative;

    // Spell slots per level (monsters: spells.1..6.max; characters: max/value)
    const spells = system.spells;
    if (spells) {
      const slots: Record<string, any> = {};
      for (const [key, value] of Object.entries<any>(spells)) {
        if (/^\d+$/.test(key) && (value?.max ?? 0) > 0) slots[key] = value;
      }
      stats.spellcasting = { enabled: spells.enabled === true, slots };
    }

    // Ability scores, when the sheet stores them (characters)
    const scores = system.scores ?? system.abilities;
    if (scores && typeof scores === 'object') stats.abilityScores = scores;

    return stats;
  }

  extractBasicInfo(actorData: any): any {
    const system = actorData.system || {};
    const details = system.details || {};
    const basicInfo: any = { actorType: actorData.type };

    if (system.hp) {
      basicInfo.hitDice = system.hp.hd;
      basicInfo.hitPoints = { current: system.hp.value, max: system.hp.max };
    }
    if (system.ac?.value !== undefined) basicInfo.armorClass = system.ac.value;
    if (system.movement?.base !== undefined) basicInfo.movement = system.movement.base;
    if (details.morale !== undefined) basicInfo.morale = details.morale;
    if (details.xp !== undefined) basicInfo.xp = details.xp;
    if (details.alignment) basicInfo.alignment = details.alignment;
    if (details.level !== undefined) basicInfo.level = details.level;
    if (details.class) basicInfo.class = details.class;
    if (details.appearing) basicInfo.numberAppearing = details.appearing;
    if (details.treasure?.type) basicInfo.treasureType = details.treasure.type;
    if (typeof details.biography === 'string' && details.biography.trim()) {
      // ACKS keeps a single biography string (HTML); expose a short plain-text version.
      basicInfo.biography = details.biography
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 1000);
    }
    return basicInfo;
  }

  describeActorSchema(): string {
    return [
      '=== ACKS Actor Schema Reference (system schema v5) ===',
      '',
      'ACTOR TYPES: character, monster',
      'ITEM TYPES:  item, weapon, armor, spell, ability, language, money, bundle',
      '',
      'MONSTER FIELDS (paths relative to `system`):',
      '  hp.hd            Hit dice string, e.g. "3d8", "1d8+1" (informational)',
      '  hp.value / .max  Current / maximum hit points',
      '  ac.value         Armor class as printed (ASCENDING: unarmored 0, higher is better)',
      '  attack.throw     Attack throw target (d20 roll-over)',
      '  saves.{death|paralysis|blast|spell|implements}.value   Save targets (d20 roll-over)',
      '  movement.base    Feet per turn (120 = 40 per round)',
      '  details.morale   Morale modifier;  details.xp  XP award',
      '  details.alignment  Free text; compendiums mix "Lawful"/"L" etc. Prefer the full word',
      '  details.appearing.d / .w   Number appearing (dungeon / wilderness), e.g. "1d6"',
      '  spells.enabled + spells.1..6.max   Spell slots per level',
      '',
      'Wrong keys are silently ignored: use only the paths above.',
      'Prefer create-actor-from-compendium (acks.acks-monsters) for official monsters.',
      '',
      'ITEMS (manage-actors cannot create them; use the import tools):',
      '  dnd5e-add-features-from-compendium  -> monster abilities / class abilities / proficiencies',
      '  dnd5e-add-feature (featureType spells) -> acks.acks-arcane-spells / acks.acks-divine-spells',
      '  Compendiums: acks.acks-monsters, acks.acks-monster-abilities, acks.acks-arcane-spells,',
      '    acks.acks-divine-spells, acks.acks-class-abilities, acks.acks-proficiencies,',
      '    acks.acks-all-equipment, acks.acks-adventuring-equipment',
      '',
      'weapon: damage.base.formula, range.short/medium/long, melee, missile, bonus.attack/damage',
      'armor:  type (unarmored|light|heavy|shield), ac.value',
      'spell:  lvl (1-6), class (Arcane|Divine|Mage), range, duration',
    ].join('\n');
  }
}
