import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { bootFakeFoundry, loadBridge } from './fake-foundry.mjs';

let da;
before(async () => {
  await bootFakeFoundry('dnd5e');
  da = new (await loadBridge()).FoundryDataAccess();
});

// Regression guard: ACKS changes must not alter the dnd5e behaviour.
test('dnd5e: enhanced index still uses challengeRating', async () => {
  const idx = await da.getEnhancedCreatureIndex();
  assert.ok(idx.length > 0);
  assert.ok(idx.every(c => 'challengeRating' in c && !('hitDice' in c)));
});

test('dnd5e: listCreaturesByCriteria summary is CR based', async () => {
  const r = await da.listCreaturesByCriteria({ challengeRating: { max: 30 } });
  assert.ok(r.creatures.length > 0);
  assert.match(r.creatures[0].summary, /^CR /);
});

test('dnd5e: addSpellsToActor / addFeaturesFromCompendium use dnd5e default packs', async () => {
  const r = await da.createActors({ actors: [{ name: 'Caster test', type: 'npc' }] });
  const id = r.created[0].id;
  const sp = await da.addSpellsToActor({ actorIdentifier: id, spellNames: ['Acid Arrow', 'Nope'] });
  assert.deepEqual(sp.added.map(a => a.name), ['Acid Arrow']);
  assert.equal(sp.added[0].packId, 'dnd5e.spells');
  assert.deepEqual(sp.notFound, ['Nope']);
  const ft = await da.addFeaturesFromCompendium({ actorIdentifier: id, featureNames: ['Acid Absorption'] });
  assert.equal(ft.added.length, 1);
});
