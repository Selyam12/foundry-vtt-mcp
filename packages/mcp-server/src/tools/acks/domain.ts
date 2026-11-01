import { z } from 'zod';
import { FoundryClient } from '../../foundry-client.js';
import { Logger } from '../../logger.js';
import { ErrorHandler } from '../../utils/error-handler.js';

/**
 * Incremental edits on `acks-extras.domain` actors (a ruler's domain: territory, holdings,
 * stronghold, monthly revenue/expenses, morale, favors and duties). Like acks-faction: the
 * module stores most of this as arrays that manage-actors would replace wholesale, and Foundry
 * silently drops an update holding an invalid value. This tool reads the current data, edits one
 * row, validates enums and writes back only the changed top-level key.
 */

export interface AcksDomainToolOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

const DOMAIN_TYPE = 'acks-extras.domain';

// Mirrors acks-extras (scripts/domains/constants.mjs, scripts/formation/country-keys.mjs,
// scripts/lib/vocab.mjs).
const CLASSIFICATIONS = ['civilized', 'borderlands', 'outlands'] as const;
const ALIGNMENTS = ['lawful', 'neutral', 'chaotic'] as const;
const HOLDING_ROLES = ['settlement', 'stronghold', 'other'] as const;
const REVENUE_LINES = ['land', 'service', 'tax', 'trade'] as const;
const EXPENSE_LINES = ['garrison', 'liturgy', 'upkeep', 'tithe'] as const;
const SIDES = ['revenue', 'expenses'] as const;
const NOTE_LISTS = ['favors', 'duties'] as const;

const base = { domainIdentifier: z.string().min(1, 'domainIdentifier cannot be empty') };
const gp = z.number().min(0);

const schema = z.discriminatedUnion('action', [
  z.object({
    ...base,
    action: z.literal('set-info'),
    title: z.string().optional(),
    ruler: z.string().optional(),
    rulerName: z.string().optional(),
    liege: z.string().optional(),
    liegeName: z.string().optional(),
    classification: z.enum(CLASSIFICATIONS).optional(),
    alignment: z.union([z.enum(ALIGNMENTS), z.literal('')]).optional(),
    tributeGp: gp.optional(),
    moraleCurrent: z.number().int().optional(),
    moraleBase: z.number().int().optional(),
  }),
  z.object({
    ...base,
    action: z.literal('set-territory'),
    label: z.string().min(1),
    count: z.number().int().min(0).optional(),
    families: z.number().int().min(0).optional(),
    landValue: gp.optional(),
    improvement: gp.optional(),
    hexLabels: z.array(z.string().min(1)).optional(),
    revealed: z.boolean().optional(),
    note: z.string().optional(),
  }),
  z.object({ ...base, action: z.literal('remove-territory'), label: z.string().min(1) }),
  z.object({
    ...base,
    action: z.literal('add-holding'),
    holdingName: z.string().min(1),
    holdingActor: z.string().optional(),
    role: z.enum(HOLDING_ROLES).default('other'),
    families: z.number().int().min(0).optional(),
    marketClass: z.number().int().min(1).max(6).optional(),
    investmentGp: gp.default(0),
    note: z.string().default(''),
    hidden: z.boolean().default(false),
  }),
  z.object({ ...base, action: z.literal('remove-holding'), holdingName: z.string().min(1) }),
  z.object({
    ...base,
    action: z.literal('set-structure'),
    name: z.string().min(1),
    count: z.number().int().min(1).optional(),
    costGp: gp.optional(),
    ac: z.number().optional(),
    unitCapacity: z.number().optional(),
    shp: z.number().optional(),
    note: z.string().optional(),
  }),
  z.object({ ...base, action: z.literal('remove-structure'), name: z.string().min(1) }),
  z.object({
    ...base,
    action: z.literal('set-line'),
    side: z.enum(SIDES),
    line: z.string().min(1),
    peasantPer: gp.optional(),
    urbanPer: gp.optional(),
    peasantGp: gp.optional(),
    urbanGp: gp.optional(),
    note: z.string().optional(),
  }),
  z.object({
    ...base,
    action: z.literal('set-other-line'),
    side: z.enum(SIDES),
    label: z.string().min(1),
    gp: z.number(),
  }),
  z.object({
    ...base,
    action: z.literal('remove-other-line'),
    side: z.enum(SIDES),
    label: z.string().min(1),
  }),
  z.object({
    ...base,
    action: z.literal('set-entry'),
    list: z.enum(NOTE_LISTS),
    label: z.string().min(1),
    note: z.string().default(''),
  }),
  z.object({
    ...base,
    action: z.literal('remove-entry'),
    list: z.enum(NOTE_LISTS),
    label: z.string().min(1),
  }),
]);

type Params = z.infer<typeof schema>;

/** A precise, user-facing failure: surfaced as is instead of the generic error text. */
class DomainError extends Error {}

const newId = () => Math.random().toString(36).slice(2, 10);
const same = (a: string, b: string) => (a ?? '').toLowerCase() === (b ?? '').toLowerCase();

/** Copy only the defined keys of `source` named in `keys`. */
function pick(source: Record<string, any>, keys: readonly string[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of keys) if (source[k] !== undefined) out[k] = source[k];
  return out;
}

export class AcksDomainTool {
  private foundryClient: FoundryClient;
  private logger: Logger;
  private errorHandler: ErrorHandler;

  constructor({ foundryClient, logger }: AcksDomainToolOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'AcksDomainTool' });
    this.errorHandler = new ErrorHandler(this.logger);
  }

  getToolDefinitions() {
    return [
      {
        name: 'acks-domain',
        description:
          "[ACKS + acks-extras module] Edit one part of a ruler's domain (actor type " +
          '"acks-extras.domain") without overwriting its lists. Reading a domain: get-character.\n' +
          'Why: manage-actors replaces whole arrays and Foundry silently ignores an update with an ' +
          'invalid value; this tool validates and edits one row at a time.\n\n' +
          'Set `action`:\n' +
          '• set-info — title, ruler / liege (actor names or IDs; empty string clears), rulerName / ' +
          `liegeName (free text), classification (${CLASSIFICATIONS.join('|')}), alignment ` +
          `(${ALIGNMENTS.join('|')}, empty = the ruler's own), tributeGp, moraleCurrent, moraleBase\n` +
          '• set-territory — label (upserts the row); optional count (hexes), families, landValue, ' +
          'improvement, hexLabels, revealed, note\n' +
          '• remove-territory — label\n' +
          '• add-holding — holdingName; optional holdingActor (a location actor), ' +
          `role (${HOLDING_ROLES.join('|')}), families, marketClass (1-6), investmentGp, note, hidden\n` +
          '• remove-holding — holdingName\n' +
          '• set-structure — name (upserts); optional count, costGp (whole row), ac, unitCapacity, shp, note\n' +
          '• remove-structure — name\n' +
          `• set-line — side (${SIDES.join('|')}), line (revenue: ${REVENUE_LINES.join('|')}; ` +
          `expenses: ${EXPENSE_LINES.join('|')}), peasantPer, urbanPer, peasantGp, urbanGp, note ` +
          '(only the figures you pass change)\n' +
          '• set-other-line / remove-other-line — side, label, gp (extra revenue or expense line)\n' +
          `• set-entry / remove-entry — list (${NOTE_LISTS.join('|')}), label, note (a favor or duty)\n\n` +
          'domainIdentifier is the domain name or ID (list-characters shows them).',
        inputSchema: {
          type: 'object',
          properties: {
            domainIdentifier: { type: 'string', description: 'Name or ID of the domain actor.' },
            action: {
              type: 'string',
              enum: [
                'set-info',
                'set-territory',
                'remove-territory',
                'add-holding',
                'remove-holding',
                'set-structure',
                'remove-structure',
                'set-line',
                'set-other-line',
                'remove-other-line',
                'set-entry',
                'remove-entry',
              ],
            },
            title: { type: 'string', description: 'set-info.' },
            ruler: { type: 'string', description: 'set-info: ruler actor name/ID.' },
            rulerName: { type: 'string', description: 'set-info: ruler as free text.' },
            liege: { type: 'string', description: 'set-info: liege domain actor name/ID.' },
            liegeName: { type: 'string', description: 'set-info: liege as free text.' },
            classification: {
              type: 'string',
              enum: [...CLASSIFICATIONS],
              description: 'set-info.',
            },
            alignment: { type: 'string', description: `set-info: ${ALIGNMENTS.join('|')} or "".` },
            tributeGp: { type: 'number', description: 'set-info: tribute paid to the liege, gp.' },
            moraleCurrent: { type: 'number', description: 'set-info.' },
            moraleBase: { type: 'number', description: 'set-info.' },
            label: {
              type: 'string',
              description: 'set-territory / remove-territory / other-line / entry.',
            },
            count: { type: 'number', description: 'set-territory: hexes; set-structure: units.' },
            families: { type: 'number', description: 'set-territory / add-holding: families.' },
            landValue: { type: 'number', description: 'set-territory: land value, gp.' },
            improvement: { type: 'number', description: 'set-territory: improvement, gp.' },
            hexLabels: {
              type: 'array',
              items: { type: 'string' },
              description: 'set-territory: hex names.',
            },
            revealed: {
              type: 'boolean',
              description: 'set-territory: show land value to players.',
            },
            note: { type: 'string', description: 'Free note on the row.' },
            holdingName: { type: 'string', description: 'add-holding / remove-holding.' },
            holdingActor: { type: 'string', description: 'add-holding: location actor name/ID.' },
            role: { type: 'string', enum: [...HOLDING_ROLES], description: 'add-holding.' },
            marketClass: { type: 'number', description: 'add-holding: market class 1-6.' },
            investmentGp: { type: 'number', description: 'add-holding.' },
            hidden: { type: 'boolean', description: 'add-holding: hide from players.' },
            name: { type: 'string', description: 'set-structure / remove-structure.' },
            costGp: { type: 'number', description: 'set-structure: whole row cost, gp.' },
            ac: { type: 'number', description: 'set-structure.' },
            unitCapacity: { type: 'number', description: 'set-structure.' },
            shp: { type: 'number', description: 'set-structure.' },
            side: { type: 'string', enum: [...SIDES], description: 'set-line / other-line.' },
            line: {
              type: 'string',
              description: `set-line: ${[...REVENUE_LINES, ...EXPENSE_LINES].join('|')}.`,
            },
            peasantPer: { type: 'number', description: 'set-line: gp per peasant family.' },
            urbanPer: { type: 'number', description: 'set-line: gp per urban family.' },
            peasantGp: { type: 'number', description: 'set-line: flat gp, peasant side.' },
            urbanGp: { type: 'number', description: 'set-line: flat gp, urban side.' },
            gp: { type: 'number', description: 'set-other-line: amount, gp.' },
            list: {
              type: 'string',
              enum: [...NOTE_LISTS],
              description: 'set-entry / remove-entry.',
            },
          },
          required: ['domainIdentifier', 'action'],
        },
      },
    ];
  }

  async handleDomain(args: any): Promise<any> {
    const p: Params = schema.parse(args);
    try {
      const domain = await this.loadDomain(p.domainIdentifier);
      const system = domain.system ?? {};
      const patch: Record<string, any> = {};
      let summary: string;

      switch (p.action) {
        case 'set-info': {
          for (const key of [
            'title',
            'rulerName',
            'liegeName',
            'classification',
            'alignment',
            'tributeGp',
          ] as const) {
            if (p[key] !== undefined) patch[key] = p[key];
          }
          for (const [arg, field] of [
            ['ruler', 'rulerUuid'],
            ['liege', 'parentUuid'],
          ] as const) {
            const value = p[arg];
            if (value === undefined) continue;
            patch[field] = value === '' ? '' : `Actor.${(await this.loadActor(value)).id}`;
          }
          if (p.moraleCurrent !== undefined || p.moraleBase !== undefined) {
            patch.morale = {
              ...(system.morale ?? {}),
              ...(p.moraleCurrent !== undefined ? { current: p.moraleCurrent } : {}),
              ...(p.moraleBase !== undefined ? { base: p.moraleBase } : {}),
            };
          }
          if (Object.keys(patch).length === 0)
            throw new DomainError('set-info needs at least one field');
          summary = `Updated ${Object.keys(patch).join(', ')}`;
          break;
        }
        case 'set-territory': {
          const rows = [...(system.territory ?? [])];
          const idx = rows.findIndex((r: any) => same(r.label, p.label));
          const fields = pick(p, [
            'count',
            'families',
            'landValue',
            'improvement',
            'hexLabels',
            'revealed',
            'note',
          ]);
          const row = {
            ...(idx >= 0 ? rows[idx] : { id: newId(), hexLabels: [], families: 0, improvement: 0 }),
            label: p.label,
            ...fields,
          };
          if (idx >= 0) rows[idx] = row;
          else rows.push(row);
          patch.territory = rows;
          summary = `${idx >= 0 ? 'Updated' : 'Added'} territory "${p.label}"`;
          break;
        }
        case 'remove-territory': {
          const before = system.territory ?? [];
          patch.territory = before.filter((r: any) => !same(r.label, p.label));
          this.requireChange(before.length, patch.territory.length, `territory "${p.label}"`);
          summary = `Removed territory "${p.label}"`;
          break;
        }
        case 'add-holding': {
          const linked = p.holdingActor ? await this.loadActor(p.holdingActor) : undefined;
          const holdings = [...(system.holdings ?? [])];
          holdings.push({
            uuid: linked ? `Actor.${linked.id}` : '',
            name: linked?.name ?? p.holdingName,
            role: p.role,
            ...(p.families !== undefined ? { families: p.families } : {}),
            ...(p.marketClass !== undefined ? { marketClass: p.marketClass } : {}),
            investmentGp: p.investmentGp,
            note: p.note,
            hidden: p.hidden,
          });
          patch.holdings = holdings;
          summary = `Added holding "${linked?.name ?? p.holdingName}"`;
          break;
        }
        case 'remove-holding': {
          const before = system.holdings ?? [];
          patch.holdings = before.filter((h: any) => !same(h.name, p.holdingName));
          this.requireChange(before.length, patch.holdings.length, `holding "${p.holdingName}"`);
          summary = `Removed holding "${p.holdingName}"`;
          break;
        }
        case 'set-structure': {
          const rows = [...(system.structures ?? [])];
          const idx = rows.findIndex((r: any) => same(r.name, p.name));
          const row = {
            ...(idx >= 0 ? rows[idx] : { id: newId(), count: 1 }),
            name: p.name,
            ...pick(p, ['count', 'costGp', 'ac', 'unitCapacity', 'shp', 'note']),
          };
          if (idx >= 0) rows[idx] = row;
          else rows.push(row);
          patch.structures = rows;
          summary = `${idx >= 0 ? 'Updated' : 'Added'} structure "${p.name}"`;
          break;
        }
        case 'remove-structure': {
          const before = system.structures ?? [];
          patch.structures = before.filter((r: any) => !same(r.name, p.name));
          this.requireChange(before.length, patch.structures.length, `structure "${p.name}"`);
          summary = `Removed structure "${p.name}"`;
          break;
        }
        case 'set-line': {
          const allowed: readonly string[] = p.side === 'revenue' ? REVENUE_LINES : EXPENSE_LINES;
          if (!allowed.includes(p.line)) {
            throw new DomainError(
              `Unknown ${p.side} line "${p.line}". Allowed: ${allowed.join(', ')}`
            );
          }
          const figures = pick(p, ['peasantPer', 'urbanPer', 'peasantGp', 'urbanGp', 'note']);
          if (Object.keys(figures).length === 0)
            throw new DomainError('set-line needs at least one figure or a note');
          patch[p.side] = {
            ...(system[p.side] ?? {}),
            [p.line]: { ...(system[p.side]?.[p.line] ?? {}), ...figures },
          };
          summary = `Updated ${p.side} line "${p.line}"`;
          break;
        }
        case 'set-other-line': {
          const key = p.side === 'revenue' ? 'otherRevenue' : 'otherExpenses';
          const rows = [...(system[key] ?? [])];
          const idx = rows.findIndex((r: any) => same(r.label, p.label));
          const row = { ...(idx >= 0 ? rows[idx] : { id: newId() }), label: p.label, gp: p.gp };
          if (idx >= 0) rows[idx] = row;
          else rows.push(row);
          patch[key] = rows;
          summary = `${idx >= 0 ? 'Updated' : 'Added'} ${p.side} line "${p.label}" (${p.gp} gp)`;
          break;
        }
        case 'remove-other-line': {
          const key = p.side === 'revenue' ? 'otherRevenue' : 'otherExpenses';
          const before = system[key] ?? [];
          patch[key] = before.filter((r: any) => !same(r.label, p.label));
          this.requireChange(before.length, patch[key].length, `${p.side} line "${p.label}"`);
          summary = `Removed ${p.side} line "${p.label}"`;
          break;
        }
        case 'set-entry': {
          const rows = [...(system[p.list] ?? [])];
          const idx = rows.findIndex((r: any) => same(r.label, p.label));
          const row = { ...(idx >= 0 ? rows[idx] : { id: newId() }), label: p.label, note: p.note };
          if (idx >= 0) rows[idx] = row;
          else rows.push(row);
          patch[p.list] = rows;
          summary = `${idx >= 0 ? 'Updated' : 'Added'} ${p.list} entry "${p.label}"`;
          break;
        }
        case 'remove-entry': {
          const before = system[p.list] ?? [];
          patch[p.list] = before.filter((r: any) => !same(r.label, p.label));
          this.requireChange(before.length, patch[p.list].length, `${p.list} entry "${p.label}"`);
          summary = `Removed ${p.list} entry "${p.label}"`;
          break;
        }
      }

      await this.foundryClient.query('foundry-mcp-bridge.updateActors', {
        updates: [{ id: domain.id, system: patch }],
      });

      return {
        summary: `✅ ${domain.name}: ${summary}`,
        success: true,
        domain: { id: domain.id, name: domain.name },
        updated: Object.keys(patch),
      };
    } catch (error) {
      if (error instanceof DomainError) throw error;
      this.errorHandler.handleToolError(error, 'acks-domain', 'domain edit');
    }
  }

  private requireChange(before: number, after: number, what: string): void {
    if (before === after) throw new DomainError(`No ${what} found on this domain`);
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
    if (!info?.id) throw new DomainError(`Actor not found: "${identifier}"`);
    return info;
  }

  private async loadDomain(identifier: string): Promise<any> {
    const info = await this.loadActor(identifier);
    if (info.type !== DOMAIN_TYPE) {
      throw new DomainError(`"${info.name}" is a ${info.type}, not an ${DOMAIN_TYPE} actor`);
    }
    return info;
  }
}
