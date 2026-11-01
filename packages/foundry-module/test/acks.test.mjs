import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { bootFakeFoundry, loadBridge } from './fake-foundry.mjs';

let da, game;
before(async () => {
  ({ game } = await bootFakeFoundry('acks'));
  const mod = await loadBridge();
  da = new mod.FoundryDataAccess();
});

test('ACKS: enhanced creature index is built', async () => {
  const idx = await da.getEnhancedCreatureIndex();
  assert.ok(idx.length >= 40, `got ${idx.length}`);
  const wight = idx.find(c => c.name === 'Wight');
  assert.equal(wight.hitDice, 3);
  assert.equal(wight.armorClass, 4);
  assert.equal(wight.morale, 4);
});

test('ACKS: listCreaturesByCriteria filters by HD (challengeRating alias)', async () => {
  const r = await da.listCreaturesByCriteria({ challengeRating: { min: 3, max: 3 } });
  assert.ok(r.creatures.length > 0);
  assert.ok(r.creatures.every(c => c.hitDice === 3));
  assert.match(r.creatures[0].summary, /AC \d+/);
});

test('ACKS: searchCompendium finds monsters, spells', async () => {
  const m = await da.searchCompendium('Wight', 'Actor');
  assert.ok(m.some(r => r.name === 'Wight'));
  const s = await da.searchCompendium('Magic', 'Item');
  assert.ok(s.length > 0);
});

test('ACKS: createActors + addActorItems + getCharacterInfo', async () => {
  const r = await da.createActors({ actors: [{ name: 'Gobelin test', type: 'monster', system: { hp: { hd: '1d8', value: 4, max: 4 }, ac: { value: 6 } } }] });
  assert.equal(r.total, 1);
  const id = r.created[0].id;
  await da.addActorItems({ actorIdentifier: id, items: [{ name: 'Épée courte', type: 'weapon', system: { damage: '1d6' } }] });
  const info = await da.getCharacterInfo(id);
  assert.equal(info.type, 'monster');
  assert.equal(info.system.ac.value, 6);
  assert.equal(info.items.length, 1);
});

test('ACKS: createActorFromCompendium clones a monster', async () => {
  const idx = await da.getEnhancedCreatureIndex();
  const w = idx.find(c => c.name === 'Wight');
  const r = await da.createActorFromCompendiumEntry({ packId: w.pack, itemId: w.id, customNames: ['Wight 1'], quantity: 1 });
  assert.ok(r.success, JSON.stringify(r));
  assert.ok(game.actors.some(a => a.name === 'Wight 1'), 'actor created in world');
});

test('ACKS: pack labels with non-Latin1 characters do not break the index', async () => {
  const pack = [...game.packs.values()].find(p => p.metadata.type === 'Actor');
  pack.metadata = { ...pack.metadata, label: 'Créatures — « Épique » 龍' };
  const idx = await da.getEnhancedCreatureIndex();
  assert.ok(idx.length > 0);
});

test('ACKS: getSystemSchema describes the ACKS model', () => {
  const sc = da.getSystemSchema();
  assert.equal(sc.system, 'acks');
  assert.deepEqual(sc.actorTypes, ['character', 'monster']);
  assert.ok(sc.items.weapon['damage.base.formula']);
  assert.ok(sc.items.armor.type.includes('shield'));
});

test('ACKS: addSpellsToActor imports spells from the default ACKS packs', async () => {
  const r = await da.createActors({ actors: [{ name: 'Mage test', type: 'monster' }] });
  const id = r.created[0].id;
  const res = await da.addSpellsToActor({ actorIdentifier: id, spellNames: ['Burning Hands', 'Augury', 'Nope Spell', 'burning hands'] });
  assert.deepEqual(res.added.map(a => a.name).sort(), ['Augury', 'Burning Hands']);
  assert.deepEqual(res.notFound, ['Nope Spell']);
  assert.ok(res.skipped.some(s => s.reason === 'duplicate in input'));
  const again = await da.addSpellsToActor({ actorIdentifier: id, spellNames: ['Augury'] });
  assert.equal(again.added.length, 0);
  assert.equal(again.skipped[0].reason, 'already on actor');
});

test('ACKS: addFeaturesFromCompendium imports abilities from the default ACKS packs', async () => {
  const r = await da.createActors({ actors: [{ name: 'Fighter test', type: 'monster' }] });
  const id = r.created[0].id;
  const res = await da.addFeaturesFromCompendium({ actorIdentifier: id, featureNames: ['Backstab', 'Body Slam', 'Acrobatics'] });
  assert.equal(res.added.length, 3, JSON.stringify(res));
});

test('ACKS: dnd5e-only write tools still refuse', async () => {
  await assert.rejects(() => da.addAttackToActor({ actorIdentifier: 'x', name: 'y' }), /requires the dnd5e game system/);
});

test('ACKS: searchCharacterItems reports the spell level stored in lvl', async () => {
  const r = await da.createActors({ actors: [{ name: 'Mage lvl test', type: 'monster' }] });
  const id = r.created[0].id;
  await da.addSpellsToActor({ actorIdentifier: id, spellNames: ['Burning Hands', 'Augury'] });
  const res = await da.searchCharacterItems({ characterIdentifier: id, type: 'spell' });
  const byName = Object.fromEntries(res.matches.map(m => [m.name, m]));
  assert.equal(byName['Burning Hands'].level, 1);
  assert.equal(byName['Augury'].level, 2);
  assert.equal(byName['Augury'].spellClass, 'Divine');
  assert.ok(byName['Burning Hands'].duration, 'duration is exposed');
});

test('ACKS: updateActorBiography writes the single biography string', async () => {
  // Real Foundry fills the ACKS schema defaults: biography is a plain string.
  const r = await da.createActors({ actors: [{ name: 'Bio test', type: 'monster', system: { details: { biography: '' } } }] });
  const res = await da.updateActorBiography({
    actorIdentifier: 'Bio test',
    biography: '<p>Un récit.</p>',
    biographyField: 'value',
  });
  assert.equal(res.updatedPath, 'system.details.biography');
  const actor = game.actors.get(r.created[0].id);
  assert.equal(actor.system.details.biography, '<p>Un récit.</p>');
  await assert.rejects(
    () => da.updateActorBiography({ actorIdentifier: 'Bio test', biography: 'x', biographyField: 'public' }),
    /single biography field/
  );
});

test('ACKS: createActorFromCompendiumEntry puts actors in the requested folder, default "Foundry MCP Creatures"', async () => {
  const idx = await da.getEnhancedCreatureIndex();
  const w = idx.find(c => c.name === 'Wight');
  const folderNameOf = actorName => {
    const actor = [...game.actors.values()].find(a => a.name === actorName);
    return game.folders.get(actor._source.folder)?.name;
  };

  await da.createActorFromCompendiumEntry({ packId: w.pack, itemId: w.id, customNames: ['Wight dossier défaut'] });
  assert.equal(folderNameOf('Wight dossier défaut'), 'Foundry MCP Creatures');

  await da.createActorFromCompendiumEntry({ packId: w.pack, itemId: w.id, customNames: ['Wight dossier choisi'], folder: 'Mes morts-vivants' });
  assert.equal(folderNameOf('Wight dossier choisi'), 'Mes morts-vivants');

  // a blank folder name falls back to the default
  await da.createActorFromCompendiumEntry({ packId: w.pack, itemId: w.id, customNames: ['Wight dossier vide'], folder: '   ' });
  assert.equal(folderNameOf('Wight dossier vide'), 'Foundry MCP Creatures');
});
