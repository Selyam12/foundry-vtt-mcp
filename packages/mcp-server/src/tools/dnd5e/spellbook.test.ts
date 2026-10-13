import { describe, expect, it, vi } from 'vitest';
import { DnD5eSpellbookTools, DnD5eUpdateActorSpellbookRequestSchema } from './spellbook.js';
import * as systemDetection from '../../utils/system-detection.js';

vi.mock('../../utils/system-detection.js', () => ({
  detectGameSystem: vi.fn(),
  getCachedSystemId: vi.fn(() => 'dnd5e'),
}));

function createTools() {
  const query = vi.fn().mockResolvedValue({ success: true, actorId: 'a1', spellId: 's1' });
  const logger = {
    child: () => logger,
    info: vi.fn(),
    error: vi.fn(),
  };

  vi.mocked(systemDetection.detectGameSystem).mockResolvedValue('dnd5e');

  return {
    query,
    tools: new DnD5eSpellbookTools({
      foundryClient: { query } as any,
      logger: logger as any,
    }),
  };
}

describe('DnD5eUpdateActorSpellbookRequestSchema', () => {
  it('requires updates for update operations', () => {
    expect(() =>
      DnD5eUpdateActorSpellbookRequestSchema.parse({
        operation: 'update',
        actorIdentifier: 'Mordenkainen',
        spellIdentifier: 'Magic Missile',
      })
    ).toThrow();
  });

  it('requires prepared for set-prepared operations', () => {
    expect(() =>
      DnD5eUpdateActorSpellbookRequestSchema.parse({
        operation: 'set-prepared',
        actorIdentifier: 'Mordenkainen',
        spellIdentifier: 'Magic Missile',
      })
    ).toThrow();
  });

  it('accepts remove operations without updates', () => {
    const result = DnD5eUpdateActorSpellbookRequestSchema.parse({
      operation: 'remove',
      actorIdentifier: 'Mordenkainen',
      spellIdentifier: 'Magic Missile',
    });

    expect(result.operation).toBe('remove');
  });
});

describe('DnD5eSpellbookTools', () => {
  it('exposes dnd5e-update-actor-spellbook', () => {
    const { tools } = createTools();
    expect(tools.getToolDefinitions().map(tool => tool.name)).toContain(
      'dnd5e-update-actor-spellbook'
    );
  });

  it('forwards validated input to the Foundry bridge', async () => {
    const { tools, query } = createTools();

    await tools.handleUpdateActorSpellbook({
      operation: 'set-prepared',
      actorIdentifier: 'Mordenkainen',
      spellIdentifier: 'Magic Missile',
      prepared: true,
    });

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.update-actor-spellbook', {
      operation: 'set-prepared',
      actorIdentifier: 'Mordenkainen',
      spellIdentifier: 'Magic Missile',
      prepared: true,
    });
  });
});
