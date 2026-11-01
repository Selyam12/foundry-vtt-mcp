/**
 * Per-system adapter contract.
 *
 * Everything that differs between Foundry game systems (data model, creature
 * index, search criteria, schema documentation) lives in an adapter instead of
 * `if (systemId === ...)` branches inside data-access.ts. A system without an
 * adapter keeps the generic behaviour, so adapters can be migrated one by one.
 *
 * Only erasable TypeScript is allowed here (the module is built by stripping
 * types): no enums, no parameter properties, and `import type` for type-only
 * imports.
 */

/** Creature index behaviour for one system. `T` is the system's index entry type. */
export interface CreatureIndexAdapter<T = any> {
  /** Human label used in log messages, e.g. "ACKS". */
  label: string;
  /** Actor document types that should be indexed. */
  actorTypes: string[];
  /** True if an index entry was produced by this adapter. */
  owns(creature: any): creature is T;
  /** Build an index entry from one actor document. May throw; the caller counts errors. */
  extract(doc: any, pack: any): T;
  /** Placeholder entry used when `extract` throws, so the creature is not dropped from the index. */
  fallback?(doc: any, pack: any): T;
  /** Does the entry satisfy the criteria of listCreaturesByCriteria? */
  matches(creature: T, criteria: any): boolean;
  /** Numeric "strength" used to sort results (CR, level, HD...). */
  powerLevel(creature: T): number;
  /** System-specific fields of a listCreaturesByCriteria result row, including `summary`. */
  toResult(creature: T): Record<string, unknown>;
}

/** How a system exposes compendium content to the generic "import by name" tools. */
export interface CompendiumImportConfig {
  /** Item compendium ids searched when the caller gives none, in priority order. */
  defaultPacks: string[];
  /** Shown in the error message when none of the requested packs is usable. */
  packHint: string;
}

export interface SystemAdapter {
  id: string;
  /** Enhanced creature index; absent = system uses the legacy generic code paths. */
  creatures?: CreatureIndexAdapter;
  /** Static documentation of the system's data model, returned by getSystemSchema. */
  schema?(): Record<string, any>;
  /** Support for addSpellsToActor / addFeaturesFromCompendium; absent = tool unavailable. */
  compendiumImport?: {
    spells?: CompendiumImportConfig;
    features?: CompendiumImportConfig;
  };
  /**
   * Names of the write tools this adapter supports beyond the generic ones.
   * Reserved for the migration of the dnd5e-only tools; unused for now.
   */
  capabilities?: string[];
}
