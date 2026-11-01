// Minimal in-memory Foundry runtime so the bridge's data-access can run under Node
// against real system data (fixtures/<system>.json). Not a full Foundry emulation:
// add what a test needs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
let counter = 0;
const rid = () => (++counter).toString(36).padStart(16, '0');

class Coll extends Map {
  [Symbol.iterator]() { return this.values(); } // Foundry collections iterate over values
  get contents() { return [...this.values()]; }
  find(fn) { return this.contents.find(fn); }
  filter(fn) { return this.contents.filter(fn); }
  map(fn) { return this.contents.map(fn); }
  some(fn) { return this.contents.some(fn); }
  forEach(fn) { this.contents.forEach(fn); }
  getName(n) { return this.find(d => d.name === n); }
}

const clone = o => (o === undefined ? undefined : structuredClone(o));
function setPath(obj, p, v) {
  const parts = p.split('.'); let o = obj;
  for (const k of parts.slice(0, -1)) o = o[k] ??= {};
  o[parts.at(-1)] = v;
}

export function makeDocClass(name, game) {
  return class FakeDoc {
    constructor(data, { parent = null, pack = null } = {}) {
      this._source = clone(data); this._source._id ??= rid();
      this.parent = parent; this.pack = pack;
      this.items = new Coll(); this.effects = new Coll();
      for (const i of this._source.items ?? []) {
        const it = new FakeDoc(i, { parent: this }); it.documentName = 'Item'; this.items.set(it.id, it);
      }
      this.documentName = name;
    }
    get id() { return this._source._id; }
    get _id() { return this._source._id; }
    get name() { return this._source.name; }
    get type() { return this._source.type; }
    get img() { return this._source.img; }
    get system() { return this._source.system; }
    get flags() { return this._source.flags ?? {}; }
    get uuid() { return `${this.documentName}.${this.id}`; }
    getFlag(s, k) { return this._source.flags?.[s]?.[k]; }
    toObject() { const o = clone(this._source); o.items = this.items.map(i => i.toObject()); return o; }
    async update(changes) {
      for (const [k, v] of Object.entries(changes)) k.includes('.') ? setPath(this._source, k, v) : (this._source[k] = v);
      return this;
    }
    async createEmbeddedDocuments(_t, datas) {
      const out = datas.map(d => { const it = new FakeDoc({ ...d }, { parent: this }); it.documentName = 'Item'; this.items.set(it.id, it); return it; });
      return out;
    }
    async deleteEmbeddedDocuments(_t, ids) { ids.forEach(i => this.items.delete(i)); return []; }
    async delete() { game.actors.delete(this.id); return this; }
    static async create(data) {
      const d = new FakeDoc(data); d.documentName = name;
      if (name === 'Actor') game.actors.set(d.id, d);
      if (name === 'Item') game.items.set(d.id, d);
      return d;
    }
    static async createDocuments(datas) { return Promise.all(datas.map(d => FakeDoc.create(d))); }
  };
}

/** Install globals as if Foundry had booted `system` ('acks' | 'dnd5e'). */
export async function bootFakeFoundry(systemId, { withWorldActors = [] } = {}) {
  const fx = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', `${systemId}.json`), 'utf8'));
  const game = {
    system: { id: fx.system.id, version: fx.system.version, title: fx.system.title, documentTypes: fx.system.documentTypes ?? {} },
    world: { id: 'test-world', title: 'Test World' },
    user: { id: 'gm', isGM: true, name: 'GM' },
    users: new Coll(), scenes: new Coll(), actors: new Coll(), items: new Coll(), packs: new Coll(),
    journal: new Coll(), folders: new Coll(), modules: new Coll(), combats: new Coll(), playlists: new Coll(),
    settings: { get: (_m, key) => ({ enableEnhancedCreatureIndex: true, enableWriteOperations: true }[key] ?? true), set: async () => {}, register() {} },
    i18n: { localize: s => s, format: s => s },
    version: '14.359', ready: true,
  };
  globalThis.game = game;
  const Actor = makeDocClass('Actor', game), Item = makeDocClass('Item', game);
  globalThis.Actor = Actor; globalThis.Item = Item;
  for (const p of fx.packs) {
    const cls = p.metadata.type === 'Actor' ? Actor : Item;
    const docs = p.docs.map(d => { const x = new cls(d); x.documentName = p.metadata.type; return x; });
    const pack = {
      collection: p.metadata.id, metadata: p.metadata, indexed: true, documentName: p.metadata.type,
      index: new Coll(docs.map(d => [d.id, { _id: d.id, name: d.name, type: d.type, img: d.img }])),
      getIndex: async () => pack.index,
      getDocuments: async () => docs,
      getDocument: async id => docs.find(d => d.id === id) ?? null,
    };
    game.packs.set(p.metadata.id, pack);
  }
  const ui = { notifications: { info: () => ({ remove() {} }), warn() {}, error() {} } };
  globalThis.ui = ui;
  globalThis.foundry = { applications: { apps: { FilePicker: { implementation: { browse: async () => ({ files: [] }), upload: async () => ({ path: 'x' }) } } } }, utils: { randomID: rid, deepClone: clone, mergeObject: (a, b) => Object.assign(a, b), getProperty: (o, p) => p.split('.').reduce((x, k) => x?.[k], o), setProperty: setPath } };
  globalThis.CONFIG = { Actor: { documentClass: Actor }, Item: { documentClass: Item } };
  globalThis.Folder = { create: async d => { const f = { id: rid(), ...d }; game.folders.set(f.id, f); return f; } };
  globalThis.Hooks = { on() {}, once() {}, callAll() {}, call() {} };
  globalThis.File = globalThis.File ?? class {};
  for (const a of withWorldActors) game.actors.set(a.id, a);
  return { game, Actor, Item };
}

/** Strip TS types like install-module.cjs does, into test/.build, and import it. */
export async function loadBridge() {
  const src = path.resolve(here, '../src'), out = path.join(here, '.build');
  fs.mkdirSync(out, { recursive: true });
  for (const f of fs.readdirSync(src)) {
    if (!f.endsWith('.ts')) continue;
    fs.writeFileSync(path.join(out, f.replace(/\.ts$/, '.js')), stripTypeScriptTypes(fs.readFileSync(path.join(src, f), 'utf8'), { mode: 'transform' }));
  }
  return import(pathToFileURL(path.join(out, 'data-access.js')).href + '?t=' + Date.now());
}

/**
 * Load the module's query layer (what the MCP server actually calls) and return
 * the registered handlers, keyed by method name without the module prefix.
 * Call after loadBridge() (which builds test/.build) and bootFakeFoundry().
 */
export async function loadQueryHandlers() {
  const out = path.join(here, '.build');
  globalThis.CONFIG.queries = {};
  const mod = await import(pathToFileURL(path.join(out, 'queries.js')).href + '?t=' + Date.now());
  new mod.QueryHandlers().registerHandlers();
  const prefix = 'foundry-mcp-bridge.';
  return new Proxy({}, { get: (_t, name) => globalThis.CONFIG.queries[prefix + String(name)] });
}
