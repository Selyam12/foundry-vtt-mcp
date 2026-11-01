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

const FACTION_TYPE = 'acks-extras.faction';
const DOMAIN_TYPE = 'acks-extras.domain';

/** Plain-text version of an HTML field, truncated (these fields can hold whole book pages). */
function plainText(html: unknown, max = 1000): string | undefined {
  if (typeof html !== 'string' || !html.trim()) return undefined;
  const text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

/** Drop empty values so the output stays compact. */
function compact<T extends Record<string, any>>(obj: T): T {
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) {
      delete obj[key];
    }
  }
  return obj;
}

const sumOf = (rows: any[] | undefined, key: string): number =>
  (rows ?? []).reduce((total, row) => total + (Number(row?.[key]) || 0), 0);

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
    if (actorData.type === FACTION_TYPE) return this.extractFactionStats(actorData.system || {});
    if (actorData.type === DOMAIN_TYPE) return this.extractDomainStats(actorData.system || {});
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

    // Character-only data (adventuring throws, encumbrance, fate points, caster level)
    if (system.adventuring && typeof system.adventuring === 'object') {
      stats.adventuringThrows = system.adventuring;
    }
    if (system.encumbrance && typeof system.encumbrance === 'object') {
      stats.encumbrance = system.encumbrance;
    }
    const details = system.details || {};
    if (details.fatepoints) stats.fatePoints = details.fatepoints;
    if (details.casterlevel) stats.casterLevel = details.casterlevel;

    return stats;
  }

  extractBasicInfo(actorData: any): any {
    if (actorData.type === FACTION_TYPE) return this.extractFactionInfo(actorData);
    if (actorData.type === DOMAIN_TYPE) return this.extractDomainInfo(actorData);
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

  // ─── acks-extras: factions and domains ───────────────────────────────────────
  // These actor types come from the acks-extras module, not the ACKS system. Their
  // `system` holds the module's own data model, not hp/ac/saves.

  private extractFactionInfo(actorData: any): any {
    const system = actorData.system || {};
    return compact({
      actorType: actorData.type,
      kind: system.kind,
      seat: system.seatUuid,
      leader: system.leaderUuid,
      parent: system.parentUuid,
      memberCount: (system.members ?? []).length,
      holdingCount: (system.holdings ?? []).length,
      relationCount: (system.relations ?? []).length,
      controlledRegions: (system.controls ?? []).length,
      notes: plainText(system.notes),
      gmNotes: plainText(system.gmNotes),
    });
  }

  private extractFactionStats(system: any): any {
    const strength = system.strength ?? {};
    return compact({
      members: (system.members ?? []).map((m: any) =>
        compact({ name: m.name, uuid: m.uuid, kind: m.kind, quantity: m.quantity, notes: m.notes })
      ),
      holdings: (system.holdings ?? []).map((h: any) =>
        compact({ name: h.name, uuid: h.uuid, note: h.note })
      ),
      relations: (system.relations ?? []).map((r: any) =>
        compact({ name: r.name, uuid: r.uuid, stance: r.stance, note: r.note, hidden: r.hidden })
      ),
      controls: system.controls,
      standing: (system.standing ?? []).map((row: any) =>
        compact({
          subject: row.subject?.name || row.subject?.uuid,
          scope: row.subject?.scope,
          value: row.value,
          reason: row.reason,
          source: row.source,
        })
      ),
      strength:
        (strength.rows ?? []).length > 0
          ? {
              columns: (strength.columns ?? []).map((c: any) => c.label),
              rows: strength.rows,
              note: strength.note || undefined,
            }
          : undefined,
    });
  }

  private extractDomainInfo(actorData: any): any {
    const system = actorData.system || {};
    return compact({
      actorType: actorData.type,
      title: system.title,
      ruler: system.rulerName || system.rulerUuid,
      liege: system.liegeName || system.parentUuid,
      classification: system.classification,
      alignment: system.alignment,
      peasantFamilies: sumOf(system.territory, 'families'),
      territoryRows: (system.territory ?? []).length,
      morale: system.morale,
      tributeGp: system.tributeGp,
      notes: plainText(system.notes),
      gmNotes: plainText(system.gmNotes),
    });
  }

  private extractDomainStats(system: any): any {
    const lines = (group: any) =>
      Object.fromEntries(
        Object.entries<any>(group ?? {}).filter(([, line]) =>
          Object.values(line ?? {}).some(v => v !== null && v !== '' && v !== undefined)
        )
      );
    return compact({
      territory: system.territory,
      holdings: system.holdings,
      structures: system.structures,
      strongholdCostGp: sumOf(system.structures, 'costGp') || undefined,
      revenue: lines(system.revenue),
      expenses: lines(system.expenses),
      otherRevenue: system.otherRevenue,
      otherExpenses: system.otherExpenses,
      vassals: system.vassalRows,
      favors: system.favors,
      duties: system.duties,
    });
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
      '',
      'ACKS-EXTRAS MODULE ACTOR TYPES (only when the acks-extras module is active):',
      '  acks-extras.faction  An organisation (guild, temple, noble house, watch)',
      '    kind, notes, gmNotes (HTML), seatUuid, leaderUuid, parentUuid,',
      '    members[] {uuid,name,kind,quantity,notes,hidden}, holdings[] {uuid,name,note,hidden},',
      '    relations[] {uuid,name,stance,note,hidden}, standing[] {subject{scope,uuid,name},value,reason,time,source},',
      '    strength {columns[{label}],rows[{level,label,counts[],revenue}],note}, controls[] (Region uuids)',
      '  acks-extras.domain   A ruler domain (lord, liege, territory, holdings, finances)',
      '    rulerUuid/rulerName, title, parentUuid/liegeName, classification, alignment, notes, gmNotes,',
      '    territory[] {id,label,hexLabels[],count,families,landValue,improvement,note},',
      '    holdings[] {uuid,name,role,families,marketClass,investmentGp,note},',
      '    structures[] {id,name,count,ac,unitCapacity,shp,costGp}, revenue/expenses {line:{peasantPer,urbanPer,peasantGp,urbanGp,note}},',
      '    tributeGp, morale {current,base}, vassalRows[], favors[], duties[]',
      '  Also: acks-extras.location, party, group, animal, vehicle, template.',
      '  CAUTION: update merges top-level keys only; an array (members, relations, standing...) is REPLACED,',
      '  so send the whole array. Prefer acks-faction (add-member, add-relation...) for incremental edits.',
    ].join('\n');
  }
}
