// Tests for the CLAG scoring core. Run with:  node --test clag/scoring.test.js
// No build step, no dependencies — uses Node's built-in test runner + assert.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('./scoring.js');

const e = (bid, tricks) => ({ bid, tricks });
const normal = { name: 'X CARDS', cards: 7, special: null };
const misereNT = { special: 'misere_nt', miserePenalty: 2, cards: 7 };
const misereTrump = { special: 'misere', miserePenalty: 3, cards: 7 };
const mostTricks = { special: 'mosttricks', cards: 7 };

// ─── ENGLISH (Foss / Wikipedia): 10 + 2/trick on exact, 0 on miss ───────────────
test('english — exact bid scores 10 + 2 per trick', () => {
  assert.equal(S.roundScore(normal, e(2, 2), 'english'), 14); // 10 + 2*2
  assert.equal(S.roundScore(normal, e(0, 0), 'english'), 10); // 10 + 0
  assert.equal(S.roundScore(normal, e(5, 5), 'english'), 20); // 10 + 2*5
});

test('english — a missed bid scores 0 regardless of tricks taken', () => {
  assert.equal(S.roundScore(normal, e(3, 2), 'english'), 0);
  assert.equal(S.roundScore(normal, e(0, 1), 'english'), 0);
  assert.equal(S.roundScore(normal, e(2, 4), 'english'), 0);
});

// ─── PAGAT (McLeod): 1/trick always + 10 bonus if exact ─────────────────────────
test('pagat — exact bid scores tricks + 10 bonus', () => {
  assert.equal(S.roundScore(normal, e(2, 2), 'pagat'), 12); // 2 + 10
  assert.equal(S.roundScore(normal, e(0, 0), 'pagat'), 10); // 0 + 10
  assert.equal(S.roundScore(normal, e(5, 5), 'pagat'), 15); // 5 + 10
});

test('pagat — a missed bid still keeps 1 point per trick taken', () => {
  assert.equal(S.roundScore(normal, e(3, 2), 'pagat'), 2);  // tricks only
  assert.equal(S.roundScore(normal, e(0, 1), 'pagat'), 1);
  assert.equal(S.roundScore(normal, e(2, 4), 'pagat'), 4);
  assert.equal(S.roundScore(normal, e(4, 0), 'pagat'), 0);  // bid 4, took none
});

// ─── MISÈRE (same under both variations) ────────────────────────────────────────
test('misère — zero tricks scores +10, otherwise loses penalty per trick', () => {
  for (const v of ['english', 'pagat']) {
    assert.equal(S.roundScore(misereNT, e(0, 0), v), 10);
    assert.equal(S.roundScore(misereNT, e(0, 1), v), -2);  // NT penalty 2
    assert.equal(S.roundScore(misereNT, e(0, 3), v), -6);
    assert.equal(S.roundScore(misereTrump, e(0, 0), v), 10);
    assert.equal(S.roundScore(misereTrump, e(0, 2), v), -6); // trump penalty 3
  }
});

test('misère — penalty defaults to 2 when unspecified', () => {
  assert.equal(S.roundScore({ special: 'misere', cards: 7 }, e(0, 2), 'english'), -4);
});

// ─── MOST TRICKS (deal 15) ──────────────────────────────────────────────────────
test('most tricks — sole leader scores 10, everyone else 0', () => {
  const entries = [e(0, 4), e(0, 2), e(0, 1)];
  assert.deepEqual(S.roundScores(mostTricks, entries, 'pagat'), [10, 0, 0]);
});

test('most tricks — a tie for most means nobody scores', () => {
  const entries = [e(0, 3), e(0, 3), e(0, 1)];
  assert.deepEqual(S.roundScores(mostTricks, entries, 'english'), [0, 0, 0]);
});

test('most tricks — all zero tricks means nobody scores', () => {
  const entries = [e(0, 0), e(0, 0), e(0, 0)];
  assert.deepEqual(S.roundScores(mostTricks, entries, 'english'), [0, 0, 0]);
});

// ─── UNENTERED ENTRIES ──────────────────────────────────────────────────────────
test('roundScore returns null when the entry is not yet filled in', () => {
  assert.equal(S.roundScore(normal, e(2, ''), 'english'), null);
  assert.equal(S.roundScore(normal, e('', 2), 'english'), null);
  assert.equal(S.roundScore(normal, e(null, null), 'pagat'), null);
});

// ─── RUNNING TOTALS ─────────────────────────────────────────────────────────────
test('playerTotal sums a mixed game correctly (english)', () => {
  const rounds = [normal, misereTrump, mostTricks];
  // player 0: makes bid (14), takes 1 in misère (-3), wins most tricks (+10) = 21
  const scores = [
    [e(2, 2), e(1, 0)],
    [e(0, 1), e(0, 0)],
    [e(0, 4), e(0, 2)],
  ];
  assert.equal(S.playerTotal(rounds, scores, 0, 2, 'english'), 14 - 3 + 10);
  assert.equal(S.playerTotal(rounds, scores, 1, 2, 'english'), 0 + 10 + 0);
});

test('playerTotal respects the upTo bound and the chosen variation', () => {
  const rounds = [normal, normal];
  const scores = [[e(3, 2)], [e(2, 2)]];          // miss, then hit
  assert.equal(S.playerTotal(rounds, scores, 0, 0, 'english'), 0);   // only round 0
  assert.equal(S.playerTotal(rounds, scores, 0, 1, 'english'), 14);  // 0 + 14
  assert.equal(S.playerTotal(rounds, scores, 0, 1, 'pagat'), 2 + 12); // 2 + 12
});

test('playerTotal ignores an unscored most-tricks round in progress', () => {
  const rounds = [mostTricks];
  const scores = [[e(0, ''), e(0, '')]];
  assert.equal(S.playerTotal(rounds, scores, 0, 0, 'english'), 0);
});

// ─── ROUND STRUCTURE ────────────────────────────────────────────────────────────
test('buildRounds produces the documented deal counts', () => {
  assert.equal(S.buildRounds('standard6').length, 20); // 7 up + 6 specials + 7 down
  assert.equal(S.buildRounds('standard8').length, 22); // 7 up + 8 specials + 7 down
  assert.equal(S.buildRounds('scottish').length, 18);  // 7 down + 4 specials + 7 up
  assert.equal(S.buildRounds('quick').length, 13);     // 5 + 3 + 5
});

test('buildRounds — Scottish runs 7→1, specials, then 1→7', () => {
  const r = S.buildRounds('scottish');
  assert.equal(r[0].cards, 7);
  assert.equal(r[6].cards, 1);
  assert.equal(r[r.length - 1].cards, 7); // big hands (skill) at the end
});

test('buildRounds — standard up-and-down peaks at 7 in the middle', () => {
  const r = S.buildRounds('standard6');
  assert.equal(r[0].cards, 1);
  assert.equal(r[6].cards, 7);
  assert.equal(r[r.length - 1].cards, 1);
});

// ─── VARIATION CONFIG ───────────────────────────────────────────────────────────
test('cfgFor falls back to the default variation for unknown ids', () => {
  assert.equal(S.cfgFor('nonsense').id, S.DEFAULT_VARIATION);
  assert.equal(S.cfgFor('pagat').tricksOnMiss, true);
  assert.equal(S.cfgFor('english').tricksOnMiss, false);
});
