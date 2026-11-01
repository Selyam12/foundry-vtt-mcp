import type { SystemAdapter } from './system-adapter.js';
import { acksAdapter } from './system-acks.js';
import { dnd5eAdapter } from './system-dnd5e.js';

const adapters = new Map<string, SystemAdapter>();

export function registerSystemAdapter(adapter: SystemAdapter): void {
  adapters.set(adapter.id, adapter);
}

export function getSystemAdapter(systemId: string | undefined): SystemAdapter | undefined {
  return systemId ? adapters.get(systemId) : undefined;
}

registerSystemAdapter(acksAdapter);
registerSystemAdapter(dnd5eAdapter);
