import { z } from 'zod';
import { FoundryClient } from '../../foundry-client.js';
import { Logger } from '../../logger.js';
import { ErrorHandler } from '../../utils/error-handler.js';
import { detectGameSystem, getCachedSystemId } from '../../utils/system-detection.js';

/**
 * ACKS equivalents of the dnd5e feature tools: custom attacks, abilities and
 * spell slots for monsters and characters. Items are built with the ACKS data
 * model (schema v5, as found in the official compendiums) and embedded through
 * the module's generic addActorItems; spell slots are written to `system.spells`.
 */

export interface AcksAddFeatureToolOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

const SPECIAL_FLAGS = [
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
] as const;

const baseShape = {
  actorIdentifier: z.string().min(1, 'actorIdentifier cannot be empty'),
};

const attackSchema = z.object({
  ...baseShape,
  featureType: z.literal('attack'),
  featureName: z.string().min(1),
  damage: z
    .string()
    .regex(
      /^\s*\d*d\d+(\s*[+-]\s*\d+)?\s*$|^\s*\d+\s*$/i,
      'damage must be a dice formula such as "1d6", "2d6+1" or "0"'
    ),
  attackType: z.enum(['melee', 'missile', 'both']).default('melee'),
  damageAlternate: z.string().optional(),
  attackBonus: z.number().int().default(0),
  damageBonus: z.number().int().default(0),
  range: z
    .object({
      short: z.number().int().min(0),
      medium: z.number().int().min(0),
      long: z.number().int().min(0),
    })
    .optional(),
  special: z.array(z.enum(SPECIAL_FLAGS)).default([]),
  equipped: z.boolean().default(false),
  description: z.string().default(''),
});

const abilitySchema = z.object({
  ...baseShape,
  featureType: z.literal('ability'),
  featureName: z.string().min(1),
  description: z.string().default(''),
  requirements: z.string().default(''),
  roll: z.string().default(''),
  rollType: z.enum(['result', 'above', 'below']).default('result'),
  rollTarget: z.number().int().default(0),
  save: z.string().default(''),
});

const spellcastingSchema = z.object({
  ...baseShape,
  featureType: z.literal('spellcasting'),
  spellSlots: z
    .record(z.string().regex(/^[1-6]$/, 'spell levels are 1 to 6'), z.number().int().min(0).max(20))
    .refine(v => Object.keys(v).length > 0, 'spellSlots needs at least one level'),
});

export class AcksAddFeatureTool {
  private foundryClient: FoundryClient;
  private logger: Logger;
  private errorHandler: ErrorHandler;

  constructor({ foundryClient, logger }: AcksAddFeatureToolOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'AcksAddFeatureTool' });
    this.errorHandler = new ErrorHandler(this.logger);
  }

  getToolDefinitions() {
    return [
      {
        name: 'acks-add-feature',
        description:
          '[ACKS only] Add a custom attack, a special ability, or spell slots to an ACKS ' +
          '(Adventurer Conqueror King System) monster or character. Set featureType:\n\n' +
          '• attack — a weapon item (monster attack such as Claw, Bite, Body Slam).\n' +
          '  Required: actorIdentifier, featureName, damage (dice formula, e.g. "1d6", "2d6+1")\n' +
          '  Optional: attackType (melee|missile|both, default melee), damageAlternate, attackBonus, ' +
          'damageBonus, range {short, medium, long} in feet (missile), special (list of cleave, ' +
          'entangling, flexible, handy, impact, incapacitating, long, mounted, silver, slow, thrown), ' +
          'equipped (default false, like the official monsters), description\n\n' +
          '• ability — an ability item (special power, immunity, class ability).\n' +
          '  Required: actorIdentifier, featureName\n' +
          '  Optional: description, requirements, roll, rollType (result|above|below), rollTarget, save\n\n' +
          '• spellcasting — enable spellcasting and set slots per spell level.\n' +
          '  Required: actorIdentifier, spellSlots (e.g. {"1": 2, "2": 1} = two 1st-level and one ' +
          '2nd-level slot). Levels 1–6. Run this to make a monster a caster; import the spells ' +
          'themselves with dnd5e-add-feature featureType "spells".\n\n' +
          'DO NOT USE for official monster abilities by name (use dnd5e-add-features-from-compendium ' +
          'with the ACKS monster-ability pack) or for creating the actor (use ' +
          'create-actor-from-compendium or manage-actors).\n' +
          'Use list-characters or get-character first to find the actorIdentifier.',
        inputSchema: {
          type: 'object',
          properties: {
            featureType: {
              type: 'string',
              enum: ['attack', 'ability', 'spellcasting'],
              description: 'Mode selector.',
            },
            actorIdentifier: {
              type: 'string',
              description: 'Name or ID of the target actor (partial name match supported).',
            },
            featureName: {
              type: 'string',
              description: 'Name of the new attack or ability. Required for: attack, ability.',
            },
            description: {
              type: 'string',
              description: 'Description text/HTML shown on the item. Used by: attack, ability.',
            },
            damage: {
              type: 'string',
              description:
                'Damage dice formula, e.g. "1d6", "2d6+1". Use "0" for a non-damaging attack. Required for: attack.',
            },
            attackType: {
              type: 'string',
              enum: ['melee', 'missile', 'both'],
              description: 'Default "melee". Used by: attack.',
            },
            damageAlternate: {
              type: 'string',
              description: 'Alternate damage formula (two-handed/versatile). Used by: attack.',
            },
            attackBonus: {
              type: 'number',
              description: 'Magic bonus to the attack throw. Default 0. Used by: attack.',
            },
            damageBonus: {
              type: 'number',
              description: 'Magic bonus to damage. Default 0. Used by: attack.',
            },
            range: {
              type: 'object',
              description: 'Missile ranges in feet. Used by: attack (missile / both).',
              properties: {
                short: { type: 'number' },
                medium: { type: 'number' },
                long: { type: 'number' },
              },
              required: ['short', 'medium', 'long'],
            },
            special: {
              type: 'array',
              items: { type: 'string', enum: [...SPECIAL_FLAGS] },
              description: 'Weapon quality flags. Used by: attack.',
            },
            equipped: {
              type: 'boolean',
              description: 'Whether the weapon is equipped. Default false. Used by: attack.',
            },
            requirements: {
              type: 'string',
              description: 'Prerequisite text, e.g. "Thief". Used by: ability.',
            },
            roll: { type: 'string', description: 'Roll formula, optional. Used by: ability.' },
            rollType: {
              type: 'string',
              enum: ['result', 'above', 'below'],
              description: 'Used by: ability. Default "result".',
            },
            rollTarget: { type: 'number', description: 'Roll target number. Used by: ability.' },
            save: { type: 'string', description: 'Saving throw text, optional. Used by: ability.' },
            spellSlots: {
              type: 'object',
              description:
                'Spell slots per spell level, e.g. {"1": 2, "2": 1}. Levels 1–6. Required for: spellcasting.',
              additionalProperties: { type: 'number' },
            },
          },
          required: ['featureType', 'actorIdentifier'],
        },
      },
    ];
  }

  async handleAddFeature(args: any): Promise<any> {
    const featureType = args?.featureType;
    try {
      const system = await detectGameSystem(this.foundryClient, this.logger);
      if (system !== 'acks') {
        throw new Error(
          `acks-add-feature requires ACKS. Detected system: "${getCachedSystemId() ?? 'unknown'}".`
        );
      }

      switch (featureType) {
        case 'attack':
          return await this.handleAttack(attackSchema.parse(args));
        case 'ability':
          return await this.handleAbility(abilitySchema.parse(args));
        case 'spellcasting':
          return await this.handleSpellcasting(spellcastingSchema.parse(args));
        default:
          throw new Error(
            `Unknown featureType "${featureType}". Use attack, ability or spellcasting.`
          );
      }
    } catch (error) {
      this.errorHandler.handleToolError(error, 'acks-add-feature', `${featureType ?? 'feature'}`);
    }
  }

  // ── attack ────────────────────────────────────────────────────────────────

  /** Build the `system` data of an ACKS weapon item (schema v5). */
  buildWeaponSystem(p: z.infer<typeof attackSchema>): Record<string, any> {
    const melee = p.attackType === 'melee' || p.attackType === 'both';
    const missile = p.attackType === 'missile' || p.attackType === 'both';
    const special: Record<string, boolean> = {};
    for (const flag of SPECIAL_FLAGS) special[flag] = p.special.includes(flag);

    return {
      description: p.description,
      damage: {
        base: { formula: p.damage.trim(), types: [], extraordinary: false },
        alternate: { formula: p.damageAlternate?.trim() ?? '', types: [], extraordinary: false },
      },
      bonus: { attack: p.attackBonus, damage: p.damageBonus },
      melee,
      missile,
      range: p.range ?? { short: 0, medium: 0, long: 0 },
      special,
      equipped: p.equipped,
      category: 'other',
      size: 'na',
      customTags: [melee ? 'Melee' : 'Missile'],
    };
  }

  private async handleAttack(p: z.infer<typeof attackSchema>): Promise<any> {
    if ((p.attackType === 'missile' || p.attackType === 'both') && !p.range) {
      this.logger.warn('Missile attack without range: ranges default to 0', {
        name: p.featureName,
      });
    }

    const result = await this.foundryClient.query('foundry-mcp-bridge.addActorItems', {
      actorIdentifier: p.actorIdentifier,
      items: [{ name: p.featureName, type: 'weapon', system: this.buildWeaponSystem(p) }],
    });

    const created = result.created?.[0];
    return {
      summary: `✅ Attack "${p.featureName}" (${p.damage}) added to "${result.actorName}"`,
      success: true,
      actor: { id: result.actorId, name: result.actorName },
      item: created,
      warnings:
        p.attackType !== 'melee' && !p.range
          ? ['Missile attack added without ranges (all 0).']
          : [],
    };
  }

  // ── ability ───────────────────────────────────────────────────────────────

  private async handleAbility(p: z.infer<typeof abilitySchema>): Promise<any> {
    const result = await this.foundryClient.query('foundry-mcp-bridge.addActorItems', {
      actorIdentifier: p.actorIdentifier,
      items: [
        {
          name: p.featureName,
          type: 'ability',
          system: {
            description: p.description,
            requirements: p.requirements,
            roll: p.roll,
            rollType: p.rollType,
            rollTarget: p.rollTarget,
            save: p.save,
            proficiencytype: 'general',
          },
        },
      ],
    });

    return {
      summary: `✅ Ability "${p.featureName}" added to "${result.actorName}"`,
      success: true,
      actor: { id: result.actorId, name: result.actorName },
      item: result.created?.[0],
    };
  }

  // ── spellcasting ─────────────────────────────────────────────────────────────

  private async handleSpellcasting(p: z.infer<typeof spellcastingSchema>): Promise<any> {
    // Resolve the actor and read its current spells block so unrelated keys are kept.
    const info = await this.foundryClient.query('foundry-mcp-bridge.getCharacterInfo', {
      characterName: p.actorIdentifier,
    });
    if (!info?.id) throw new Error(`Actor not found: "${p.actorIdentifier}"`);

    const current: Record<string, any> = { ...(info.system?.spells ?? {}) };
    for (const [level, count] of Object.entries(p.spellSlots)) {
      current[level] = { ...(current[level] ?? {}), max: count };
    }
    current.enabled = Object.values(p.spellSlots).some(n => n > 0) || current.enabled === true;

    await this.foundryClient.query('foundry-mcp-bridge.updateActors', {
      updates: [{ id: info.id, system: { spells: current } }],
    });

    const slots = Object.entries(p.spellSlots)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([level, n]) => `L${level}×${n}`)
      .join(', ');
    return {
      summary: `✅ Spellcasting set on "${info.name}": ${slots}`,
      success: true,
      actor: { id: info.id, name: info.name },
      spells: current,
    };
  }
}
