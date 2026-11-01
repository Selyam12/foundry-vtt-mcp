// Exports compendium packs of a Foundry system to a JSON fixture so the bridge can be
// tested without running Foundry (one license = one server). Needs Foundry closed
// or packs copied. Usage: node export-fixtures.cjs <acks|dnd5e>
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const FOUNDRY = process.env.FOUNDRY_APP || 'C:/Program Files/Foundry Virtual Tabletop/resources/app';
const DATA = process.env.FOUNDRY_DATA || path.resolve(__dirname, '../../../../Data');
const { ClassicLevel } = require(path.join(FOUNDRY, 'node_modules/classic-level'));
const sys = process.argv[2];
const LIMIT = { dnd5e: { monsters: 40, spells: 30, monsterfeatures: 30 } }[sys] || {};
(async () => {
  const dir = path.join(DATA, 'systems', sys);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'system.json'), 'utf8'));
  const out = { system: { id: manifest.id, title: manifest.title, version: manifest.version, documentTypes: manifest.documentTypes }, packs: [] };
  for (const p of manifest.packs) {
    if (!['Actor', 'Item'].includes(p.type)) continue;
    if (LIMIT && Object.keys(LIMIT).length && !(p.name in LIMIT)) continue;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-'));
    fs.cpSync(path.join(dir, p.path), tmp, { recursive: true });
    const db = new ClassicLevel(tmp, { valueEncoding: 'json' });
    const docs = [], embedded = {};
    const coll = p.type === 'Actor' ? 'actors' : 'items';
    for await (const [k, v] of db.iterator()) {
      if (k.startsWith(`!${coll}!`)) docs.push(v);
      else if (k.startsWith(`!${coll}.items!`)) { const aid = k.split('!')[2].split('.')[0]; (embedded[aid] ||= {})[v._id] = v; }
    }
    await db.close();
    let list = docs.map(d => ({ ...d, items: Array.isArray(d.items) ? d.items.map(i => typeof i === 'string' ? embedded[d._id]?.[i] : i).filter(Boolean) : d.items }));
    list.sort((a, b) => a.name.localeCompare(b.name));
    if (LIMIT[p.name]) list = list.slice(0, LIMIT[p.name]);
    for (const d of list) { delete d.prototypeToken; delete d._stats; }
    out.packs.push({ metadata: { id: `${manifest.id}.${p.name}`, name: p.name, label: p.label, type: p.type, system: manifest.id }, docs: list });
    console.log(p.name, list.length);
  }
  fs.writeFileSync(path.join(__dirname, 'fixtures', `${sys}.json`), JSON.stringify(out));
})();
