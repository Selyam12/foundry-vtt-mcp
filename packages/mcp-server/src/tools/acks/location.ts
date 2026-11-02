import { z } from 'zod';
import { FoundryClient } from '../../foundry-client.js';
import { Logger } from '../../logger.js';
import { ErrorHandler } from '../../utils/error-handler.js';

/**
 * Edits on `acks-extras.location` actors (places: settlements, buildings, districts, dungeon
 * areas). Same approach as acks-faction / acks-domain: read the current data, change one thing,
 * validate enums, write back only the changed top-level key (arrays and nested objects are
 * replaced wholesale by manage-actors, and an invalid value is silently dropped by Foundry).
 *
 * Adding a market from scratch is not supported: it needs the module's full default subtree.
 * set-market only adjusts a few fields of a market that already exists.
 */

export interface AcksLocationToolOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

const LOCATION_TYPE = 'acks-extras.location';

// Mirrors acks-extras (scripts/location/constants.mjs, scripts/lib/fields.mjs).
const ROLES = ['gate'] as const;
const OCCUPANT_KINDS = ['actor', 'group', 'monster', 'henchman', 'place'] as const;
const ALIGNMENTS = ['lawful', 'neutral', 'chaotic'] as const;

const base = { locationIdentifier: z.string().min(1, 'locationIdentifier cannot be empty') };

const schema = z.discriminatedUnion('action', [
  z.object({
    ...base,
    action: z.literal('set-info'),
    region: z.string().optional(),
    role: z.union([z.enum(ROLES), z.literal('')]).optional(),
    parent: z.string().optional(),
    notes: z.string().optional(),
    gmNotes: z.string().optional(),
    textMode: z.enum(['append', 'replace']).default('append'),
    stackCount: z.number().int().min(1).optional(),
    stackLabel: z.string().optional(),
  }),
  z.object({
    ...base,
    action: z.literal('add-roster'),
    name: z.string().min(1),
    actor: z.string().optional(),
    kind: z.enum(OCCUPANT_KINDS).default('actor'),
    quantity: z.number().int().min(1).default(1),
    notes: z.string().default(''),
    hidden: z.boolean().default(false),
  }),
  z.object({ ...base, action: z.literal('remove-roster'), name: z.string().min(1) }),
  z.object({
    ...base,
    action: z.literal('set-market'),
    marketClassOverride: z.number().int().min(1).max(6).nullable().optional(),
    urbanFamilies: z.number().int().min(0).nullable().optional(),
    settlementAlignment: z.enum(ALIGNMENTS).optional(),
    tillTargetGp: z.number().min(0).nullable().optional(),
  }),
]);

type Params = z.infer<typeof schema>;

/** A precise, user-facing failure: surfaced as is instead of the generic error text. */
class LocationError extends Error {}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const toHtml = (text: string) =>
  text
    .split(/\n{2,}/)
    .map(par => `<p>${escapeHtml(par).replace(/\n/g, '<br>')}</p>`)
    .join('');

export class AcksLocationTool {
  private foundryClient: FoundryClient;
  private logger: Logger;
  private errorHandler: ErrorHandler;

  constructor({ foundryClient, logger }: AcksLocationToolOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'AcksLocationTool' });
    this.errorHandler = new ErrorHandler(this.logger);
  }

  getToolDefinitions() {
    return [
      {
        name: 'acks-location',
        description:
          '[ACKS + acks-extras module] Edit a place (actor type "acks-extras.location": settlement, ' +
          'building, district, dungeon area) without overwriting its lists. Reading one: get-character.\n' +
          'Why: manage-actors replaces whole arrays/objects and Foundry silently ignores an update with ' +
          'an invalid value; this tool validates and edits one thing at a time.\n\n' +
          'Set `action`:\n' +
          `• set-info — region, role (${ROLES.join('|')} or "" to clear), parent (actor name/ID of the ` +
          'place it is inside; "" clears), notes / gmNotes (plain text; appended as a new paragraph by ' +
          'default, or set textMode "replace"; gmNotes is for the GM only), stackCount, stackLabel\n' +
          `• add-roster — name; optional actor (name/ID to link), kind (${OCCUPANT_KINDS.join('|')}), ` +
          'quantity, notes, hidden (who is kept here)\n' +
          '• remove-roster — name\n' +
          `• set-market — only on a place that already has a market: marketClassOverride (1-6, null ` +
          `clears), urbanFamilies, settlementAlignment (${ALIGNMENTS.join('|')}), tillTargetGp\n\n` +
          'locationIdentifier is the place name or ID (list-characters type=acks-extras.location lists them).',
        inputSchema: {
          type: 'object',
          properties: {
            locationIdentifier: {
              type: 'string',
              description: 'Name or ID of the location actor.',
            },
            action: {
              type: 'string',
              enum: ['set-info', 'set-market', 'add-roster', 'remove-roster'],
            },
            region: { type: 'string', description: 'set-info.' },
            role: { type: 'string', description: `set-info: ${ROLES.join('|')} or "".` },
            parent: { type: 'string', description: 'set-info: enclosing place, actor name/ID.' },
            notes: { type: 'string', description: 'set-info: shared notes; add-roster: row note.' },
            gmNotes: { type: 'string', description: 'set-info: GM-only notes.' },
            textMode: {
              type: 'string',
              enum: ['append', 'replace'],
              description: 'set-info: how notes/gmNotes are written (default append).',
            },
            stackCount: {
              type: 'number',
              description: 'set-info: identical instances (default 1).',
            },
            stackLabel: { type: 'string', description: 'set-info: what one instance is called.' },
            name: { type: 'string', description: 'add-roster / remove-roster: row name.' },
            actor: { type: 'string', description: 'add-roster: actor name/ID to link.' },
            kind: { type: 'string', description: `add-roster: ${OCCUPANT_KINDS.join('|')}.` },
            quantity: { type: 'number', description: 'add-roster: head count (default 1).' },
            hidden: { type: 'boolean', description: 'add-roster: hide from players.' },
            marketClassOverride: { type: ['number', 'null'], description: 'set-market: 1-6.' },
            urbanFamilies: { type: ['number', 'null'], description: 'set-market.' },
            settlementAlignment: {
              type: 'string',
              enum: [...ALIGNMENTS],
              description: 'set-market.',
            },
            tillTargetGp: { type: ['number', 'null'], description: 'set-market: till float, gp.' },
          },
          required: ['locationIdentifier', 'action'],
        },
      },
    ];
  }

  async handleLocation(args: any): Promise<any> {
    const p: Params = schema.parse(args);
    try {
      const location = await this.loadLocation(p.locationIdentifier);
      const system = location.system ?? {};
      const patch: Record<string, any> = {};
      let summary: string;

      switch (p.action) {
        case 'set-info': {
          if (p.region !== undefined) patch.region = p.region;
          if (p.role !== undefined) patch.role = p.role;
          if (p.parent !== undefined) {
            patch.parentUuid =
              p.parent === '' ? '' : `Actor.${(await this.loadActor(p.parent)).id}`;
            if (patch.parentUuid === `Actor.${location.id}`)
              throw new LocationError('A place cannot be inside itself');
          }
          for (const key of ['notes', 'gmNotes'] as const) {
            const text = p[key];
            if (text === undefined) continue;
            const html = text === '' ? '' : toHtml(text);
            patch[key] = p.textMode === 'replace' ? html : `${system[key] ?? ''}${html}`;
          }
          if (p.stackCount !== undefined || p.stackLabel !== undefined) {
            patch.stack = {
              ...(system.stack ?? {}),
              ...(p.stackCount !== undefined ? { count: p.stackCount } : {}),
              ...(p.stackLabel !== undefined ? { label: p.stackLabel } : {}),
            };
          }
          if (Object.keys(patch).length === 0)
            throw new LocationError('set-info needs at least one field');
          summary = `Updated ${Object.keys(patch).join(', ')}`;
          break;
        }
        case 'add-roster': {
          const linked = p.actor ? await this.loadActor(p.actor) : undefined;
          const uuid = linked ? `Actor.${linked.id}` : '';
          const roster = [...(system.roster ?? [])];
          const idx = roster.findIndex(
            (r: any) =>
              (uuid && r.uuid === uuid) || (r.name ?? '').toLowerCase() === p.name.toLowerCase()
          );
          const row = {
            ...(idx >= 0 ? roster[idx] : {}),
            uuid,
            name: p.name,
            kind: p.kind,
            quantity: p.quantity,
            notes: p.notes,
            hidden: p.hidden,
          };
          if (idx >= 0) roster[idx] = row;
          else roster.push(row);
          patch.roster = roster;
          summary = `${idx >= 0 ? 'Updated' : 'Added'} "${p.name}" (×${p.quantity}) in the roster`;
          break;
        }
        case 'remove-roster': {
          const before = system.roster ?? [];
          patch.roster = before.filter(
            (r: any) => (r.name ?? '').toLowerCase() !== p.name.toLowerCase()
          );
          if (before.length === patch.roster.length)
            throw new LocationError(`No roster entry "${p.name}" found on this place`);
          summary = `Removed "${p.name}" from the roster`;
          break;
        }
        case 'set-market': {
          if (system.market == null)
            throw new LocationError(
              'This place has no market; adding one from scratch is not supported by this tool'
            );
          const changes: Record<string, any> = {};
          for (const key of [
            'marketClassOverride',
            'urbanFamilies',
            'settlementAlignment',
            'tillTargetGp',
          ] as const) {
            if (p[key] !== undefined) changes[key] = p[key];
          }
          if (Object.keys(changes).length === 0)
            throw new LocationError('set-market needs at least one field');
          patch.market = { ...system.market, ...changes };
          summary = `Updated market ${Object.keys(changes).join(', ')}`;
          break;
        }
      }

      await this.foundryClient.query('foundry-mcp-bridge.updateActors', {
        updates: [{ id: location.id, system: patch }],
      });

      return {
        summary: `✅ ${location.name}: ${summary}`,
        success: true,
        location: { id: location.id, name: location.name },
        updated: Object.keys(patch),
      };
    } catch (error) {
      if (error instanceof LocationError) throw error;
      this.errorHandler.handleToolError(error, 'acks-location', 'location edit');
    }
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
    if (!info?.id) throw new LocationError(`Actor not found: "${identifier}"`);
    return info;
  }

  private async loadLocation(identifier: string): Promise<any> {
    const info = await this.loadActor(identifier);
    if (info.type !== LOCATION_TYPE) {
      throw new LocationError(`"${info.name}" is a ${info.type}, not an ${LOCATION_TYPE} actor`);
    }
    return info;
  }
}
