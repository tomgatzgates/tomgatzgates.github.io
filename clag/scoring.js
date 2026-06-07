// ─── CLAG SCORING CORE ─────────────────────────────────────────────────────────
// Pure, side-effect-free scoring + round definitions, shared by the browser UI
// (clag/app.js) and the Node test suite (clag/scoring.test.js).
//
// Two scoring variations are supported, drawn from the two rule sources:
//
//   english  — Foss / Wikipedia (https://en.wikipedia.org/wiki/Clag_(card_game))
//              A correct bid scores 10 + 2 per trick; a wrong bid scores 0.
//              (Trick points are earned ONLY when the bid is made exactly.)
//
//   pagat    — McLeod / pagat.com (https://www.pagat.com/exact/clag.html)
//              Every trick won scores 1 point, PLUS a 10-point bonus when the
//              bid is made exactly. A missed bid still keeps its trick points.
//
// Special deals score identically under both variations:
//   • Misère    — forced bid of 0. Taking 0 tricks scores +10; otherwise the
//                 player loses `miserePenalty` points per trick taken.
//   • Most tricks — no bidding. The sole player with the most tricks scores +10;
//                 if there is a tie for most, nobody scores. Everyone else: 0.
//
// (Both special rules are documented in the sources above; the misère penalty is
//  carried on each round definition so the displayed rules and the maths agree.)

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ClagScoring = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ─── SCORING VARIATIONS ──────────────────────────────────────────────────────
  const SCORING = {
    english: { id: 'english', label: 'English', sub: '+10 bid / +2 per trick',
               perTrick: 2, tricksOnMiss: false, bidBonus: 10 },
    pagat:   { id: 'pagat',   label: 'Pagat',   sub: '+1 per trick / +10 bid bonus',
               perTrick: 1, tricksOnMiss: true,  bidBonus: 10 },
  };
  const DEFAULT_VARIATION = 'english';
  function cfgFor(variation) { return SCORING[variation] || SCORING[DEFAULT_VARIATION]; }

  // ─── ROUND DEFINITIONS ───────────────────────────────────────────────────────
  const FOSS_SPECIALS = [
    { name:'NO TRUMPS',  cards:7, special:'notrumps',  desc:'No trump suit — highest of led suit wins' },
    { name:"GUESS 'EM",  cards:7, special:'guess',     desc:'Trumps revealed only after all bids are locked in' },
    { name:'MISÈRE NT',  cards:7, special:'misere_nt', miserePenalty:2, desc:'No trumps — −2 per trick. +10 for taking zero.' },
    { name:'MISÈRE',     cards:7, special:'misere',    miserePenalty:3, desc:'Trumps apply — −3 per trick. +10 for taking zero.' },
    { name:'BLIND',      cards:7, special:'blind',     desc:'Bid before receiving your cards' },
    { name:"ROLL 'EM",   cards:7, special:'rollem',    desc:'Stack face-down — play from the top in order' },
  ];
  const MCLEOD_SPECIALS = [
    { name:'NO TRUMPS',    cards:7, special:'notrumps',    desc:'No trump suit — highest of led suit wins' },
    { name:'MISÈRE',       cards:7, special:'misere',      miserePenalty:2, desc:'Trumps apply — −2 per trick. +10 for taking zero.' },
    { name:'GUESS TRUMPS', cards:7, special:'guess',       desc:'Trumps revealed only after all bids are locked in' },
    { name:'BLIND',        cards:7, special:'blind',       desc:'Bid before receiving your cards' },
    { name:'TWOS WILD',    cards:7, special:'twos',        desc:'Played Twos: name rank/suit — beats the natural card' },
    { name:'ACES LOW',     cards:7, special:'aceslow',     desc:'Aces rank as the lowest cards in the deck' },
    { name:'DEALER CALLS', cards:7, special:'dealercalls', desc:'Dealer names trumps after viewing their hand' },
    { name:'MOST TRICKS',  cards:7, special:'mosttricks',  desc:'No bidding — sole player taking the most tricks scores 10' },
  ];
  const SCOTTISH_SPECIALS = [
    { name:'NO TRUMPS',  cards:7, special:'notrumps',  desc:'No trump suit — highest of led suit wins' },
    { name:'MISÈRE',     cards:7, special:'misere',    miserePenalty:2, desc:'−2 per trick. +10 for taking zero tricks.' },
    { name:"GUESS 'EM",  cards:7, special:'guess',     desc:'Bid before trumps are revealed' },
    { name:'BLIND',      cards:7, special:'blind',     desc:'Bid without seeing cards or trumps' },
  ];

  const mk = n => ({ name:`${n} CARD${n>1?'S':''}`, cards:n, special:null,
                     desc:`Standard — ${n} card${n>1?'s':''} each` });

  function buildRounds(type) {
    const up   = [1,2,3,4,5,6,7].map(mk);
    const down = [7,6,5,4,3,2,1].map(mk);
    if (type==='standard6') return [...up,   ...FOSS_SPECIALS,     ...down];
    if (type==='standard8') return [...up,   ...MCLEOD_SPECIALS,   ...down];
    if (type==='scottish')  return [...down, ...SCOTTISH_SPECIALS, ...up];
    if (type==='quick')     return [...up.slice(0,5), ...FOSS_SPECIALS.slice(0,3), ...down.slice(0,5)];
    return [...up, ...FOSS_SPECIALS, ...down];
  }

  // ─── PREDICATES ──────────────────────────────────────────────────────────────
  const isMisere     = r => !!r && (r.special==='misere' || r.special==='misere_nt');
  const isMostTricks = r => !!r && r.special==='mosttricks';

  // Parse a stored bid/trick value. Empty / null / non-numeric → NaN (unentered).
  function num(v) {
    if (v === '' || v === null || v === undefined) return NaN;
    return parseInt(v, 10);
  }

  // ─── ROUND SCORING ───────────────────────────────────────────────────────────
  // Points for a single player in a non-"most tricks" round.
  // Returns null when the entry hasn't been filled in yet (tricks not numeric,
  // or — for a normal round — bid not numeric).
  function roundScore(round, entry, variation) {
    const cfg = cfgFor(variation);
    const t = num(entry && entry.tricks);
    if (isNaN(t)) return null;

    if (isMostTricks(round)) return 0; // resolved across all players — see roundScores

    if (isMisere(round)) {
      const penalty = round.miserePenalty != null ? round.miserePenalty : 2;
      return t === 0 ? 10 : -penalty * t;
    }

    const b = num(entry && entry.bid);
    if (isNaN(b)) return null;
    const hit = b === t;
    if (hit) return cfg.bidBonus + t * cfg.perTrick;
    return cfg.tricksOnMiss ? t * cfg.perTrick : 0;
  }

  // Resolve the "most tricks" deal across all players.
  // entries: [{tricks}, ...]  →  { counts:[...], max, sole:boolean }
  function mostTricksWinner(entries) {
    const counts = entries.map(e => num(e && e.tricks) || 0);
    const max = counts.length ? Math.max(...counts) : 0;
    const sole = counts.filter(c => c === max).length === 1 && max > 0;
    return { counts, max, sole };
  }

  // Points for every player in a round. entries: [{bid,tricks}, ...]
  function roundScores(round, entries, variation) {
    if (isMostTricks(round)) {
      const { counts, max, sole } = mostTricksWinner(entries);
      return entries.map((_, pi) => (sole && counts[pi] === max ? 10 : 0));
    }
    return entries.map(e => {
      const p = roundScore(round, e, variation);
      return p === null ? 0 : p;
    });
  }

  // Running total for player `pi` across rounds 0..upTo (inclusive).
  // scores is a 2D array indexed [roundIndex][playerIndex].
  function playerTotal(rounds, scores, pi, upTo, variation) {
    let total = 0;
    for (let ri = 0; ri <= upTo && ri < rounds.length; ri++) {
      const round = rounds[ri];
      const entry = scores[ri][pi];
      if (isMostTricks(round)) {
        const t = num(entry && entry.tricks);
        if (isNaN(t)) continue; // not entered yet
        const { counts, max, sole } = mostTricksWinner(scores[ri]);
        if (sole && counts[pi] === max) total += 10;
      } else {
        const p = roundScore(round, entry, variation);
        if (p !== null) total += p;
      }
    }
    return total;
  }

  return {
    SCORING, DEFAULT_VARIATION, cfgFor,
    FOSS_SPECIALS, MCLEOD_SPECIALS, SCOTTISH_SPECIALS,
    buildRounds, isMisere, isMostTricks, num,
    roundScore, roundScores, mostTricksWinner, playerTotal,
  };
});
