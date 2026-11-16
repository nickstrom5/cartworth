// Probing the Thanksgiving core list against ~100 likely product names with no aisle (15 Nov 2026):
// "Onion Rings" answered "onions" (0.80), Dr. Brown's "Cel-Ray Celery Soda" answered "celery" (0.92),
// and "Marshmallow Fluff" and Peeps "Marshmallow Chicks" answered "marshmallows" (0.80). None won in
// the 14-state run, where these stores gave an aisle, but a store that gives none (ALDI, Trader Joe's,
// most shelf-price chains) has only the name. Each is now a compound that must be asked for by name.
import test from 'node:test';
import assert from 'node:assert/strict';
import { relevance, RELEVANT } from '../shared/match.js';

test('DEFECT: onion rings, celery soda, marshmallow creme and Peeps are not the staple', () => {
  for (const [q, name] of [
    ['onions', 'Onion Rings'], ['onions', 'Ore-Ida Golden Onion Rings'], ['french fried onions', 'Alexia Onion Rings'],
    ['celery', "Dr. Brown's Cel-Ray Celery Soda"],
    ['marshmallows', 'Marshmallow Fluff'], ['marshmallows', 'Jet-Puffed Marshmallow Creme'], ['marshmallows', 'Peeps Marshmallow Chicks'],
  ]) assert.ok(relevance(q, { name }) < RELEVANT, `${q}: ${name}`);
});

test('control: the staples, and each product asked for by name, still match', () => {
  for (const [q, name] of [
    ['onions', 'Sweet Onions'], ['onions', 'Yellow Onions 3 lb'], ['onions', 'Pearl Onions'], ['french fried onions', "French's Crispy Fried Onions"],
    ['celery', 'Organic Celery'], ['celery', 'Celery Hearts'], ['marshmallows', 'Kraft Jet-Puffed Marshmallows'],
    ['onion rings', 'Alexia Onion Rings'], ['marshmallow fluff', 'Marshmallow Fluff'], ['marshmallow creme', 'Jet-Puffed Marshmallow Creme'],
  ]) assert.ok(relevance(q, { name }) >= RELEVANT, `${q}: ${name}`);
});
