import { z } from 'zod';
import { FoundryClient } from '../../foundry-client.js';
import { Logger } from '../../logger.js';
import { ErrorHandler } from '../../utils/error-handler.js';

/**
 * Incremental edits on `acks-extras.faction` actors (organisations: guilds, temples,
 * noble houses...). The acks-extras module stores members, relations, holdings and the
 * standing ledger as arrays. manage-actors replaces a whole array on update, and Foundry
 * silently drops an update that holds an invalid value (checked live: the call reports
 * success and nothing changes). This tool reads the current arrays, edits one row, validates
 * enum values against the module's own lists and writes the array back.
 */

export interface AcksFactionToolOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

const FACTION_TYPE = 'acks-extras.faction';

// Mirrors acks-extras (scripts/factions/constants.mjs, scripts/lib/place-logic.mjs).
const FACTION_KINDS = [
  'guild',
  'temple',
  'syndicate',
  'noble',
  'watch',
  'merchant',
  'other',
] as const;
const RELATION_STANCES = ['allied', 'friendly', 'neutral', 'rival', 'hostile'] as const;
const STANDING_SOURCES = ['favour', 'offence', 'crime', 'wanted', 'manual'] as const;
const SUBJECT_SCOPES = ['all', 'party', 'character', 'faction'] as const;
const OCCUPANT_KINDS = ['actor', 'group', 'monster', 'henchman', 'place'] as const;

const base = { factionIdentifier: z.string().min(1, 'factionIdentifier cannot be empty') };

const schema = z.discriminatedUnion('action', [
  z.object({
    ...base,
    action: z.literal('add-member'),
    memberName: z.string().min(1),
    memberActor: z.string().optional(),
    kind: z.enum(OCCUPANT_KINDS).default('actor'),
    quantity: z.number().int().min(1).default(1),
    notes: z.string().default(''),
    hidden: z.boolean().default(false),
  }),
  z.object({ ...base, action: z.literal('remove-member'), memberName: z.string().min(1) }),
  z.object({
    ...base,
    action: z.literal('set-relation'),
    otherFaction: z.string().min(1),
    stance: z.enum(RELATION_STANCES),
    note: z.string().optional(),
    hidden: z.boolean().optional(),
  }),
  z.object({ ...base, action: z.literal('remove-relation'), otherFaction: z.string().min(1) }),
  z.object({
    ...base,
    action: z.literal('add-holding'),
    holdingName: z.string().min(1),
    holdingActor: z.string().optional(),
    note: z.string().default(''),
    hidden: z.boolean().default(false),
  }),
  z.object({ ...base, action: z.literal('remove-holding'), holdingName: z.string().min(1) }),
  z.object({
    ...base,
    action: z.literal('add-standing'),
    scope: z.enum(SUBJECT_SCOPES).default('party'),
    subjectName: z.string().default(''),
    subjectActor: z.string().optional(),
    value: z.number().int(),
    reason: z.string().default(''),
    source: z.enum(STANDING_SOURCES).default('manual'),
  }),
  z.object({
    ...base,
    action: z.literal('set-info'),
    kind: z.enum(FACTION_KINDS).optional(),
    leader: z.string().optional(),
    seat: z.string().optional(),
    parent: z.string().optional(),
  }),
]);

type Params = z.infer<typeof schema>;

/** A precise, user-facing failure: surfaced as is instead of the generic error text. */
class FactionError extends Error {}

export class AcksFactionTool {
  private foundryClient: FoundryClient;
  private logger: Logger;
  private errorHandler: ErrorHandler;

  constructor({ foundryClient, logger }: AcksFactionToolOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'AcksFactionTool' });
    this.errorHandler = new ErrorHandler(this.logger);
  }

  getToolDefinitions() {
    return [
      {
        name: 'acks-faction',
        description:
          '[ACKS + acks-extras module] Edit one row of an organisation (actor type ' +
          '"acks-extras.faction") without overwriting its lists. Reading a faction: get-character.\n' +
          'Why: manage-actors replaces whole arrays and Foundry silently ignores an update with an ' +
          'invalid value; this tool validates and edits one row at a time.\n\n' +
          'Set `action`:\n' +
          '• add-member — memberName; optional memberActor (name/ID of the actor to link), kind ' +
          `(${OCCUPANT_KINDS.join('|')}, default actor), quantity, notes, hidden\n` +
          '• remove-member — memberName\n' +
          `• set-relation — otherFaction (name/ID), stance (${RELATION_STANCES.join('|')}), note, hidden. ` +
          "Directed: this faction's view of the other; creates or updates the row\n" +
          '• remove-relation — otherFaction\n' +
          '• add-holding — holdingName; optional holdingActor (a location actor), note, hidden\n' +
          '• remove-holding — holdingName\n' +
          `• add-standing — value (integer), scope (${SUBJECT_SCOPES.join('|')}, default party), ` +
          `subjectName, subjectActor, reason, source (${STANDING_SOURCES.join('|')}, default manual)\n` +
          `• set-info — kind (${FACTION_KINDS.join('|')}), leader / seat / parent (actor names or IDs; ` +
          'empty string clears)\n\n' +
          'factionIdentifier is the faction name or ID (list-characters shows them).',
        inputSchema: {
          type: 'object',
          properties: {
            factionIdentifier: { type: 'string', description: 'Name or ID of the faction actor.' },
            action: {
              type: 'string',
              enum: [
                'add-member',
                'remove-member',
                'set-relation',
                'remove-relation',
                'add-holding',
                'remove-holding',
                'add-standing',
                'set-info',
              ],
            },
            memberName: { type: 'string', description: 'add-member / remove-member.' },
            memberActor: { type: 'string', description: 'add-member: actor name/ID to link.' },
            kind: {
              type: 'string',
              description: `add-member: ${OCCUPANT_KINDS.join('|')}; set-info: ${FACTION_KINDS.join('|')}.`,
            },
            quantity: { type: 'number', description: 'add-member: head count (default 1).' },
            notes: { type: 'string', description: 'add-member.' },
            hidden: { type: 'boolean', description: 'Hide the row from players.' },
            otherFaction: { type: 'string', description: 'set-relation / remove-relation.' },
            stance: { type: 'string', enum: [...RELATION_STANCES], description: 'set-relation.' },
            note: { type: 'string', description: 'set-relation / add-holding.' },
            holdingName: { type: 'string', description: 'add-holding / remove-holding.' },
            holdingActor: { type: 'string', description: 'add-holding: location actor name/ID.' },
            scope: { type: 'string', enum: [...SUBJECT_SCOPES], description: 'add-standing.' },
            subjectName: { type: 'string', description: 'add-standing: who it is about.' },
            subjectActor: { type: 'string', description: 'add-standing: actor name/ID to link.' },
            value: { type: 'number', description: 'add-standing: integer standing change.' },
            reason: { type: 'string', description: 'add-standing.' },
            source: { type: 'string', enum: [...STANDING_SOURCES], description: 'add-standing.' },
            leader: { type: 'string', description: 'set-info.' },
            seat: { type: 'string', description: 'set-info.' },
            parent: { type: 'string', description: 'set-info.' },
          },
          required: ['factionIdentifier', 'action'],
        },
      },
    ];
  }

  async handleFaction(args: any): Promise<any> {
    const p: Params = schema.parse(args);
    try {
      const faction = await this.loadFaction(p.factionIdentifier);
      const system = faction.system ?? {};
      const patch: Record<string, any> = {};
      let summary: string;

      switch (p.action) {
        case 'add-member': {
          const linked = p.memberActor ? await this.loadActor(p.memberActor) : undefined;
          const uuid = linked ? `Actor.${linked.id}` : '';
          const members = [...(system.members ?? [])];
          const idx = members.findIndex(
            (m: any) =>
              (uuid && m.uuid === uuid) || m.name.toLowerCase() === p.memberName.toLowerCase()
          );
          const row = {
            ...(idx >= 0 ? members[idx] : {}),
            uuid,
            name: p.memberName,
            kind: p.kind,
            quantity: p.quantity,
            notes: p.notes,
            hidden: p.hidden,
          };
          if (idx >= 0) members[idx] = row;
          else members.push(row);
          patch.members = members;
          summary = `${idx >= 0 ? 'Updated' : 'Added'} member "${p.memberName}" (×${p.quantity})`;
          break;
        }
        case 'remove-member': {
          const before = system.members ?? [];
          patch.members = before.filter(
            (m: any) => m.name.toLowerCase() !== p.memberName.toLowerCase()
          );
          this.requireChange(before.length, patch.members.length, `member "${p.memberName}"`);
          summary = `Removed member "${p.memberName}"`;
          break;
        }
        case 'set-relation': {
          const other = await this.loadActor(p.otherFaction);
          const uuid = `Actor.${other.id}`;
          const relations = [...(system.relations ?? [])];
          const idx = relations.findIndex((r: any) => r.uuid === uuid);
          const row = {
            ...(idx >= 0 ? relations[idx] : { note: '', hidden: false }),
            uuid,
            name: other.name,
            stance: p.stance,
            ...(p.note !== undefined ? { note: p.note } : {}),
            ...(p.hidden !== undefined ? { hidden: p.hidden } : {}),
          };
          if (idx >= 0) relations[idx] = row;
          else relations.push(row);
          patch.relations = relations;
          summary = `${faction.name} now regards ${other.name} as ${p.stance}`;
          break;
        }
        case 'remove-relation': {
          const other = await this.loadActor(p.otherFaction);
          const before = system.relations ?? [];
          patch.relations = before.filter((r: any) => r.uuid !== `Actor.${other.id}`);
          this.requireChange(before.length, patch.relations.length, `relation to "${other.name}"`);
          summary = `Removed relation to ${other.name}`;
          break;
        }
        case 'add-holding': {
          const linked = p.holdingActor ? await this.loadActor(p.holdingActor) : undefined;
          const holdings = [...(system.holdings ?? [])];
          holdings.push({
            uuid: linked ? `Actor.${linked.id}` : '',
            name: linked?.name ?? p.holdingName,
            note: p.note,
            hidden: p.hidden,
          });
          patch.holdings = holdings;
          summary = `Added holding "${linked?.name ?? p.holdingName}"`;
          break;
        }
        case 'remove-holding': {
          const before = system.holdings ?? [];
          patch.holdings = before.filter(
            (h: any) => h.name.toLowerCase() !== p.holdingName.toLowerCase()
          );
          this.requireChange(before.length, patch.holdings.length, `holding "${p.holdingName}"`);
          summary = `Removed holding "${p.holdingName}"`;
          break;
        }
        case 'add-standing': {
          const linked = p.subjectActor ? await this.loadActor(p.subjectActor) : undefined;
          if (!linked && !p.subjectName && p.scope !== 'all') {
            throw new FactionError(
              'add-standing needs subjectName or subjectActor (unless scope is "all")'
            );
          }
          patch.standing = [
            ...(system.standing ?? []),
            {
              subject: {
                scope: p.scope,
                uuid: linked ? `Actor.${linked.id}` : '',
                name: linked?.name ?? p.subjectName,
              },
              value: p.value,
              reason: p.reason,
              time: 0,
              source: p.source,
            },
          ];
          summary = `Standing ${p.value >= 0 ? '+' : ''}${p.value} recorded toward ${linked?.name ?? (p.subjectName || p.scope)}`;
          break;
        }
        case 'set-info': {
          if (p.kind !== undefined) patch.kind = p.kind;
          for (const [arg, field] of [
            ['leader', 'leaderUuid'],
            ['seat', 'seatUuid'],
            ['parent', 'parentUuid'],
          ] as const) {
            const value = p[arg];
            if (value === undefined) continue;
            patch[field] = value === '' ? '' : `Actor.${(await this.loadActor(value)).id}`;
          }
          if (Object.keys(patch).length === 0)
            throw new FactionError('set-info needs at least one field');
          summary = `Updated ${Object.keys(patch).join(', ')}`;
          break;
        }
      }

      await this.foundryClient.query('foundry-mcp-bridge.updateActors', {
        updates: [{ id: faction.id, system: patch }],
      });

      return {
        summary: `✅ ${faction.name}: ${summary}`,
        success: true,
        faction: { id: faction.id, name: faction.name },
        updated: Object.keys(patch),
      };
    } catch (error) {
      if (error instanceof FactionError) throw error;
      this.errorHandler.handleToolError(error, 'acks-faction', 'faction edit');
    }
  }

  private requireChange(before: number, after: number, what: string): void {
    if (before === after) throw new FactionError(`No ${what} found on this faction`);
  }

  private async loadActor(identifier: string): Promise<any> {
    let info: any;
    try {
      info = await this.foundryClient.query('foundry-mcp-bridge.getCharacterInfo', {
        characterName: identifier,
      });
    } catch {
      info = undefined;
    }
    if (!info?.id) throw new FactionError(`Actor not found: "${identifier}"`);
    return info;
  }

  private async loadFaction(identifier: string): Promise<any> {
    const info = await this.loadActor(identifier);
    if (info.type !== FACTION_TYPE) {
      throw new FactionError(`"${info.name}" is a ${info.type}, not an ${FACTION_TYPE} actor`);
    }
    return info;
  }
}
