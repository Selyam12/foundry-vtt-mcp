import type { CreatureIndexAdapter, SystemAdapter } from './system-adapter.js';

// D&D 5e Enhanced Creature Index
export interface DnD5eCreatureIndex {
  id: string;
  name: string;
  type: string;
  pack: string;
  packLabel: string;
  challengeRating: number;
  creatureType: string;
  size: string;
  hitPoints: number;
  armorClass: number;
  hasSpells: boolean;
  hasLegendaryActions: boolean;
  alignment: string;
  description?: string;
  img?: string;
}

/**
 * Check if D&D 5e creature passes all specified criteria
 */
function passesDnD5eCriteria(
  creature: DnD5eCreatureIndex,
  criteria: {
    challengeRating?: number | { min?: number; max?: number };
    creatureType?: string;
    size?: string;
    hasSpells?: boolean;
    hasLegendaryActions?: boolean;
  }
): boolean {
  // Challenge Rating filter
  if (criteria.challengeRating !== undefined) {
    if (typeof criteria.challengeRating === 'number') {
      if (creature.challengeRating !== criteria.challengeRating) {
        return false;
      }
    } else if (typeof criteria.challengeRating === 'object') {
      const { min, max } = criteria.challengeRating;
      if (min !== undefined && creature.challengeRating < min) {
        return false;
      }
      if (max !== undefined && creature.challengeRating > max) {
        return false;
      }
    }
  }

  // Creature Type filter
  if (criteria.creatureType) {
    if (creature.creatureType.toLowerCase() !== criteria.creatureType.toLowerCase()) {
      return false;
    }
  }

  // Size filter
  if (criteria.size) {
    if (creature.size.toLowerCase() !== criteria.size.toLowerCase()) {
      return false;
    }
  }

  // Spellcaster filter
  if (criteria.hasSpells !== undefined) {
    if (creature.hasSpells !== criteria.hasSpells) {
      return false;
    }
  }

  // Legendary Actions filter
  if (criteria.hasLegendaryActions !== undefined) {
    if (creature.hasLegendaryActions !== criteria.hasLegendaryActions) {
      return false;
    }
  }

  return true;
}

function extractDnD5eCreature(doc: any, pack: any): DnD5eCreatureIndex {
  const system = doc.system || {};

  // Extract challenge rating with comprehensive fallbacks
  // Based on debug logs: system.details.cr contains the actual value
  let challengeRating =
    system.details?.cr ??
    system.details?.cr?.value ??
    system.cr?.value ??
    system.cr ??
    system.attributes?.cr?.value ??
    system.attributes?.cr ??
    system.challenge?.rating ??
    system.challenge?.cr ??
    0;

  // Handle null values (spell effects, etc.)
  if (challengeRating === null || challengeRating === undefined) {
    challengeRating = 0;
  }

  if (typeof challengeRating === 'string') {
    if (challengeRating === '1/8') challengeRating = 0.125;
    else if (challengeRating === '1/4') challengeRating = 0.25;
    else if (challengeRating === '1/2') challengeRating = 0.5;
    else challengeRating = parseFloat(challengeRating) || 0;
  }

  // Ensure it's a number
  challengeRating = Number(challengeRating) || 0;

  // Extract creature type with proper type checking
  // Based on debug logs: system.details.type.value contains the actual value
  let creatureType =
    system.details?.type?.value ??
    system.details?.type ??
    system.type?.value ??
    system.type ??
    system.race?.value ??
    system.race ??
    system.details?.race ??
    'unknown';

  // Handle null/undefined values properly
  if (creatureType === null || creatureType === undefined || creatureType === '') {
    creatureType = 'unknown';
  }

  // Ensure creatureType is a string before calling toLowerCase()
  if (typeof creatureType !== 'string') {
    creatureType = String(creatureType || 'unknown');
  }

  // Extract size with proper type checking
  let size =
    system.traits?.size?.value ||
    system.traits?.size ||
    system.size?.value ||
    system.size ||
    system.details?.size ||
    'medium';

  // Ensure size is a string
  if (typeof size !== 'string') {
    size = String(size || 'medium');
  }

  // Extract hit points with more fallbacks
  const hitPoints =
    system.attributes?.hp?.max ||
    system.hp?.max ||
    system.attributes?.hp?.value ||
    system.hp?.value ||
    system.health?.max ||
    system.health?.value ||
    0;

  // Extract armor class with more fallbacks
  const armorClass =
    system.attributes?.ac?.value ||
    system.ac?.value ||
    system.attributes?.ac ||
    system.ac ||
    system.armor?.value ||
    system.armor ||
    10;

  // Extract alignment with proper type checking
  let alignment =
    system.details?.alignment?.value ||
    system.details?.alignment ||
    system.alignment?.value ||
    system.alignment ||
    'unaligned';

  // Ensure alignment is a string
  if (typeof alignment !== 'string') {
    alignment = String(alignment || 'unaligned');
  }

  // Check for spells with more comprehensive detection
  const hasSpells = !!(
    system.spells ||
    system.attributes?.spellcasting ||
    (system.details?.spellLevel && system.details.spellLevel > 0) ||
    (system.resources?.spell && system.resources.spell.max > 0) ||
    system.spellcasting ||
    system.traits?.spellcasting ||
    system.details?.spellcaster
  );

  // Check for legendary actions with more comprehensive detection
  const hasLegendaryActions = !!(
    system.resources?.legact ||
    system.legendary ||
    (system.resources?.legres && system.resources.legres.value > 0) ||
    system.details?.legendary ||
    system.traits?.legendary ||
    (system.resources?.legendary && system.resources.legendary.max > 0)
  );

  return {
    id: doc._id,
    name: doc.name,
    type: doc.type,
    pack: pack.metadata.id,
    packLabel: pack.metadata.label,
    challengeRating,
    creatureType: creatureType.toLowerCase(),
    size: size.toLowerCase(),
    hitPoints,
    armorClass,
    hasSpells,
    hasLegendaryActions,
    alignment: alignment.toLowerCase(),
    description: doc.system?.details?.biography || doc.system?.description || '',
    img: doc.img,
  };
}

/** Placeholder record so a creature whose data cannot be read is not lost from the index. */
function dnd5eFallback(doc: any, pack: any): DnD5eCreatureIndex {
  return {
    id: doc._id,
    name: doc.name,
    type: doc.type,
    pack: pack.metadata.id,
    packLabel: pack.metadata.label,
    challengeRating: 0,
    creatureType: 'unknown',
    size: 'medium',
    hitPoints: 1,
    armorClass: 10,
    hasSpells: false,
    hasLegendaryActions: false,
    alignment: 'unaligned',
    description: 'Data extraction failed',
    img: doc.img || '',
  };
}

const dnd5eCreatures: CreatureIndexAdapter<DnD5eCreatureIndex> = {
  label: 'D&D 5e',
  actorTypes: ['npc', 'character', 'creature'],
  owns: (creature: any): creature is DnD5eCreatureIndex => 'hasLegendaryActions' in creature,
  extract: extractDnD5eCreature,
  fallback: dnd5eFallback,
  matches: passesDnD5eCriteria,
  powerLevel: (d: DnD5eCreatureIndex) => d.challengeRating,
  toResult: (d: DnD5eCreatureIndex) => ({
    armorClass: d.armorClass,
    hasSpells: d.hasSpells,
    alignment: d.alignment,
    summary: `CR ${d.challengeRating} ${d.creatureType} from ${d.packLabel}`,
    challengeRating: d.challengeRating,
    hasLegendaryActions: d.hasLegendaryActions,
  }),
};

export const dnd5eAdapter: SystemAdapter = {
  id: 'dnd5e',
  creatures: dnd5eCreatures,
  compendiumImport: {
    spells: {
      defaultPacks: ['dnd5e.spells'],
      packHint: 'Valid pack IDs for D&D 5e: "dnd5e.spells" (2014) or "dnd5e.spells24" (2024).',
    },
    features: {
      defaultPacks: ['dnd5e.monsterfeatures', 'dnd5e.classfeatures'],
      packHint:
        'Valid pack IDs for D&D 5e: "dnd5e.monsterfeatures" or "dnd5e.classfeatures" (2014), ' +
        '"dnd5e.monsterfeatures24" (2024 monster features). ' +
        'Note: 2024 class features are embedded in class items and cannot be imported with this tool.',
    },
  },
};
