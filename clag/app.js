// ─── SCORING CORE ─────────────────────────────────────────────────────────────
// Round definitions and all scoring maths live in clag/scoring.js (loaded first),
// so the rules logic can be unit-tested with `node --test clag/scoring.test.js`.

const { buildRounds, isMisere, isMostTricks, roundScore, mostTricksWinner,
        playerTotal: scorePlayerTotal, SCORING } = ClagScoring;

// ─── STATE ────────────────────────────────────────────────────────────────────

let G = null;                   // game state
let scReturnPhase = null;       // which phase the scorecard "Back" returns to

const SAVE_KEY  = 'clag_v4';
const NAMES_KEY = 'clag_names';

const save      = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(G)); } catch(e){} };
const loadSave  = () => { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch(e){ return null; } };
const clearSave = () => localStorage.removeItem(SAVE_KEY);
const saveNames = n  => { try { localStorage.setItem(NAMES_KEY, JSON.stringify(n)); } catch(e){} };
const loadNames = () => { try { return JSON.parse(localStorage.getItem(NAMES_KEY))||[]; } catch(e){ return []; } };

// ─── SCORING (thin wrappers over the ClagScoring core, bound to game state) ─────

// Points for one player in the current game's chosen variation.
const ptsFor = (round, entry) => roundScore(round, entry, G.variation);

// Resolve the "most tricks" deal for a given round index across all players.
const mostTricksFor = ri => mostTricksWinner(G.scores[ri]);

// Running total for player `pi` across rounds 0..upTo.
const playerTotal = (pi, upTo) =>
  scorePlayerTotal(G.rounds, G.scores, pi, upTo, G.variation);

// ─── BID ORDER / DEALER ───────────────────────────────────────────────────────

const dealerFor = ri => ri % G.players.length;

function bidOrder(ri) {
  const n = G.players.length, d = dealerFor(ri), order=[];
  for (let i=1; i<=n; i++) order.push((d+i)%n);
  return order; // last = dealer
}

// ─── TRUMPS ────────────────────────────────────────────────────────────────────
// The app is a score-keeper, not a dealer, so whoever turns the trump card taps
// it here. Card count + trump are shown on the bid and trick-entry screens.

const SUITS = [
  { id:'S',  sym:'♠', cls:'blk', label:'Spades'   },
  { id:'H',  sym:'♥', cls:'red', label:'Hearts'   },
  { id:'D',  sym:'♦', cls:'red', label:'Diamonds' },
  { id:'C',  sym:'♣', cls:'blk', label:'Clubs'    },
  { id:'NT', sym:'NT', cls:'nt', label:'No Trumps' },
];

// Rounds with no trump suit at all.
const trumpLocked = round => round.special==='notrumps' || round.special==='misere_nt';

// Build the trumps array for a fresh game (locked rounds default to No Trumps).
const freshTrumps = rounds => rounds.map(r => trumpLocked(r) ? 'NT' : null);

// Back-fill trumps on older saved games that predate this feature.
function ensureTrumps() {
  if (G && !Array.isArray(G.trumps)) G.trumps = freshTrumps(G.rounds);
}

function renderTrumpBar(prefix, ri) {
  const el = document.getElementById(`${prefix}-trump`);
  if (!el) return;
  const round = G.rounds[ri];
  const locked = trumpLocked(round);
  const sel = locked ? 'NT' : (G.trumps[ri] || null);
  const chips = SUITS.map(s => {
    const on = sel === s.id;
    return `<button type="button" class="trump-chip ${s.cls}${on?' on':''}"
      ${locked?'disabled':''} onclick="setTrump(${ri},'${s.id}')"
      aria-label="${s.label}" aria-pressed="${on}">${s.sym}</button>`;
  }).join('');
  el.innerHTML = `
    <div class="trump-bar-inner">
      <div class="tb-cards"><span class="tb-label">CARDS</span><span class="tb-num">${round.cards}</span></div>
      <div class="tb-pick">
        <span class="tb-label">TRUMP</span>
        <div class="tb-chips">${chips}</div>
      </div>
    </div>`;
}

function setTrump(ri, suit) {
  if (trumpLocked(G.rounds[ri])) return;
  G.trumps[ri] = suit;
  save();
  renderTrumpBar('bid', ri);
  renderTrumpBar('tricks', ri);
}

// Display name for a round's trump (faint subtext on the scorecard).
function trumpName(ri) {
  const s = SUITS.find(x => x.id === (G.trumps && G.trumps[ri]));
  if (!s) return '—';
  if (s.id === 'NT') return 'No Trumps';
  const sym = s.cls === 'red' ? `<span class="suit-red">${s.sym}</span>` : s.sym;
  return `${sym} ${s.label}`;
}

// ─── SCREENS ─────────────────────────────────────────────────────────────────

function show(id) {
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0,0);
}

// ─── SETUP ───────────────────────────────────────────────────────────────────

function initSetup() {
  const saved = loadNames();
  const c = document.getElementById('player-inputs');
  c.innerHTML = '';
  for (let i=0; i<7; i++) {
    const d = document.createElement('div');
    d.className = 'pinput-row';
    d.innerHTML = `<span class="pnum">P${i+1}</span>
      <input type="text" id="pi${i}" value="${saved[i]||''}"
        placeholder="${i<3?'Required':'Optional'}"
        maxlength="14" autocomplete="off" autocorrect="off" spellcheck="false">
      <div class="pmove">
        <button type="button" class="pmove-btn" onclick="movePlayer(${i},-1)" aria-label="Move up" ${i===0?'disabled':''}>▲</button>
        <button type="button" class="pmove-btn" onclick="movePlayer(${i},1)" aria-label="Move down" ${i===6?'disabled':''}>▼</button>
      </div>`;
    c.appendChild(d);
  }

  const sv = loadSave();
  const banner = document.getElementById('resume-banner');
  if (sv && sv.players && sv.rounds) {
    document.getElementById('resume-desc').textContent =
      `${sv.players.join(', ')} — Rd ${sv.currentRound+1}/${sv.rounds.length}`;
    banner.style.display = 'block';
  } else {
    banner.style.display = 'none';
  }
}

// Swap a player's name with the adjacent slot, so seating/dealer order can be
// rearranged after typing. Empty slots swap fine (the name just shifts).
function movePlayer(i, dir) {
  const j = i + dir;
  if (j < 0 || j > 6) return;
  const a = document.getElementById(`pi${i}`);
  const b = document.getElementById(`pi${j}`);
  if (!a || !b) return;
  [a.value, b.value] = [b.value, a.value];
}

function resumeGame() {
  const sv = loadSave();
  if (!sv) return;
  G = sv;
  ensureTrumps();
  document.getElementById('resume-banner').style.display = 'none';
  goPhase(G.phase||'bid');
}

function discardSave() {
  clearSave();
  document.getElementById('resume-banner').style.display = 'none';
}

function startGame() {
  // Collect non-empty names in slot order (seating/play order). Reordering may
  // leave gaps, so compact rather than requiring specific slots to be filled.
  const players = [];
  for (let i=0; i<7; i++) {
    const v = document.getElementById(`pi${i}`).value.trim();
    if (v) players.push(v);
  }
  if (players.length < 3) { alert('Enter at least 3 player names.'); return; }
  const gameType = document.querySelector('input[name="gametype"]:checked').value;
  const variation = document.querySelector('input[name="scoring"]:checked').value;
  const rounds = buildRounds(gameType);

  G = {
    players,
    rounds,
    currentRound: 0,
    phase: 'bid',
    variation: SCORING[variation] ? variation : 'english',
    trumps: freshTrumps(rounds),
    scores: rounds.map(()=>players.map(()=>({bid:0, tricks:0}))),
  };

  saveNames(players);
  save();
  goPhase('bid');
}

// ─── PHASE NAVIGATION ────────────────────────────────────────────────────────

function goPhase(phase) {
  G.phase = phase;
  save();
  if (phase==='bid')       { show('bid-screen');       renderBid(); }
  if (phase==='tricks')    { show('tricks-screen');    renderTricks(); }
  if (phase==='scorecard') { show('scorecard-screen'); renderScorecard(); }
}

function openScorecard(fromPhase) {
  scReturnPhase = fromPhase;
  goPhase('scorecard');
}

function scorecardBack() {
  if (scReturnPhase) { goPhase(scReturnPhase); scReturnPhase = null; }
}

function scorecardAdvance() {
  if (G.currentRound === G.rounds.length-1) { showGameOver(); return; }
  G.currentRound++;
  // Entries for every round are pre-initialised at startGame, so don't reset
  // here — that would wipe data the user entered before stepping back.
  scReturnPhase = null;
  save();
  goPhase('bid');
}

// Step back one place in the timeline to correct a mistake:
//   tricks → bid (same round); bid (or a no-bid "most tricks" round) → the
//   previous round's trick entry. All previously entered values are preserved.
function stepBack() {
  const round = G.rounds[G.currentRound];
  if (G.phase === 'tricks' && !isMostTricks(round)) { goPhase('bid'); return; }
  if (G.currentRound > 0) { G.currentRound--; save(); goPhase('tricks'); }
}

// Is there an earlier step to go back to from the given phase?
function canStepBack(phase) {
  if (G.currentRound > 0) return true;
  return phase === 'tricks' && !isMostTricks(G.rounds[G.currentRound]);
}

// ─── BID SCREEN ───────────────────────────────────────────────────────────────

function renderBid() {
  const ri = G.currentRound, round = G.rounds[ri];

  // MOST TRICKS has no bidding — skip straight to tricks
  if (isMostTricks(round)) { goPhase('tricks'); return; }

  document.getElementById('bid-rd').textContent = `ROUND ${ri+1} / ${G.rounds.length}`;
  document.getElementById('bid-rname').textContent = round.name;
  document.getElementById('bid-rdesc').textContent = round.desc;
  document.getElementById('bid-sbadge').innerHTML = round.special
    ? `<div class="sbadge">⚡ ${round.desc}</div>` : '';
  renderTrumpBar('bid', ri);
  document.getElementById('btn-bid-back').style.display = canStepBack('bid') ? '' : 'none';

  const order = bidOrder(ri);
  const dealer = dealerFor(ri);
  const mis = isMisere(round);

  const c = document.getElementById('bid-players');
  c.innerHTML = '';
  order.forEach((pi, oi) => {
    const isDealer  = pi === dealer;
    const isEldest  = oi === 0;
    const val = parseInt(G.scores[ri][pi].bid)||0;

    const row = document.createElement('div');
    row.className = 'stepper-row' + (isDealer?' is-dealer':(isEldest?' is-eldest':''));
    row.id = `br${pi}`;

    let tag = isDealer ? 'DEALER — BIDS LAST' : (isEldest ? 'ELDEST HAND — LEADS FIRST' : '');

    row.innerHTML = `
      <div class="sinfo">
        <div class="sname">${G.players[pi].toUpperCase()}</div>
        ${tag ? `<div class="stag">${tag}</div>` : ''}
        <div class="ssub" id="bsub${pi}"></div>
      </div>
      <div class="scontrols">
        <button class="sbtn dec" id="bdec${pi}" onclick="adjBid(${pi},-1)" ${mis?'disabled':''}>−</button>
        <div class="sval" id="bval${pi}">${mis?0:val}</div>
        <button class="sbtn inc" id="binc${pi}" onclick="adjBid(${pi},+1)" ${mis?'disabled':''}>+</button>
      </div>`;
    c.appendChild(row);
  });

  if (mis) G.players.forEach((_,pi)=>{ G.scores[ri][pi].bid=0; });

  updateBidBar();
  updateBidBtns();
}

function bidTotal() {
  const ri = G.currentRound;
  return G.players.reduce((s,_,pi)=>s+(parseInt(G.scores[ri][pi].bid)||0),0);
}

function updateBidBar() {
  const ri = G.currentRound, round = G.rounds[ri];
  const total = bidTotal(), forbidden = round.cards;
  const warn = total === forbidden;
  document.getElementById('bid-bar').innerHTML = `
    <div class="bid-bar${warn?' warn':''}">
      <div class="bid-bar-lhs">
        <span style="font-size:0.7rem">Total bids:</span>
        <span class="bid-total${warn?' warn':''}">${total}</span>
      </div>
      <span class="bid-forbidden">Forbidden: <span>${forbidden}</span></span>
    </div>`;
  const btn = document.getElementById('btn-confirm-bids');
  if (btn) btn.disabled = warn;
}

function adjBid(pi, delta) {
  const ri = G.currentRound, round = G.rounds[ri];
  const dealer = dealerFor(ri);
  let v = (parseInt(G.scores[ri][pi].bid)||0) + delta;
  if (v<0 || v>round.cards) return;

  if (pi === dealer) {
    const others = G.players.reduce((s,_,i)=>i===pi?s:s+(parseInt(G.scores[ri][i].bid)||0),0);
    const forb = round.cards - others;
    if (v === forb) { v += delta; if (v<0||v>round.cards) return; }
  }

  G.scores[ri][pi].bid = v;
  document.getElementById(`bval${pi}`).textContent = v;
  save();
  updateBidBar();
  updateBidBtns();
}

function updateBidBtns() {
  const ri = G.currentRound, round = G.rounds[ri];
  const dealer = dealerFor(ri);
  G.players.forEach((_,pi) => {
    const v = parseInt(G.scores[ri][pi].bid)||0;
    const dec = document.getElementById(`bdec${pi}`);
    const inc = document.getElementById(`binc${pi}`);
    const sub = document.getElementById(`bsub${pi}`);
    if (!dec||!inc) return;
    dec.disabled = v<=0;

    if (pi===dealer) {
      const others = G.players.reduce((s,_,i)=>i===pi?s:s+(parseInt(G.scores[ri][i].bid)||0),0);
      const forb = round.cards - others;
      const next = v+1===forb ? v+2 : v+1;
      inc.disabled = next>round.cards;
      if (sub && forb>=0 && forb<=round.cards) {
        sub.textContent = `Cannot bid ${forb}`;
        sub.className = 'ssub warn';
      }
    } else {
      inc.disabled = v>=round.cards;
    }
  });
}

function confirmBids() {
  const ri = G.currentRound, round = G.rounds[ri];
  if (bidTotal()===round.cards) { alert(`Total bids equal ${round.cards} — dealer must adjust.`); return; }
  goPhase('tricks');
}

// ─── TRICKS SCREEN ────────────────────────────────────────────────────────────

function renderTricks() {
  const ri = G.currentRound, round = G.rounds[ri];
  const mis = isMisere(round), hn = isMostTricks(round);

  document.getElementById('tricks-rd').textContent = `ROUND ${ri+1} / ${G.rounds.length}`;
  document.getElementById('tricks-rname').textContent = round.name;
  document.getElementById('tricks-sbadge').innerHTML = round.special
    ? `<div class="sbadge">⚡ ${round.desc}</div>` : '';
  renderTrumpBar('tricks', ri);
  document.getElementById('btn-tricks-back').style.display = canStepBack('tricks') ? '' : 'none';

  const c = document.getElementById('tricks-players');
  c.innerHTML = '';

  // Order top→bottom as first-to-play down to dealer (same as bidding order).
  const order = bidOrder(ri);
  const dealer = dealerFor(ri);

  order.forEach((pi, oi) => {
    const name = G.players[pi];
    const isDealer = pi === dealer;
    const isEldest = oi === 0;
    const bid = parseInt(G.scores[ri][pi].bid)||0;
    const val = parseInt(G.scores[ri][pi].tricks)||0;
    const tag = isDealer ? 'DEALER' : (isEldest ? 'LEADS FIRST' : '');
    const row = document.createElement('div');
    row.className = 'stepper-row' + (isDealer?' is-dealer':(isEldest?' is-eldest':''));
    row.id = `tr${pi}`;
    row.innerHTML = `
      <div class="sinfo">
        <div class="sname">${name.toUpperCase()}</div>
        ${tag ? `<div class="stag">${tag}</div>` : ''}
        <div class="ssub" id="tsub${pi}">${mis?'Must take 0': hn?'Most tricks wins':`Bid: ${bid}`}</div>
      </div>
      <div class="scontrols">
        <button class="sbtn dec" id="tdec${pi}" onclick="adjTricks(${pi},-1)">−</button>
        <div class="sval green" id="tval${pi}">${val}</div>
        <button class="sbtn inc" id="tinc${pi}" onclick="adjTricks(${pi},+1)">+</button>
      </div>
      <div class="sind" id="tind${pi}"></div>`;
    c.appendChild(row);
  });

  updateTricksBar();
  updateTrickIndicators();
}

function tricksTotal() {
  const ri = G.currentRound;
  return G.players.reduce((s,_,pi)=>s+(parseInt(G.scores[ri][pi].tricks)||0),0);
}

function updateTricksBar() {
  const ri = G.currentRound, round = G.rounds[ri];
  const total = tricksTotal(), remaining = round.cards - total;
  const warn = remaining < 0;
  document.getElementById('tricks-bar').innerHTML = `
    <div class="tricks-bar${warn?' warn':''}">
      <span>Tricks remaining:</span>
      <span class="tricks-remaining${warn?' warn':''}">${remaining}</span>
    </div>`;
}

function adjTricks(pi, delta) {
  const ri = G.currentRound, round = G.rounds[ri];
  const cur = parseInt(G.scores[ri][pi].tricks)||0;
  const newv = cur+delta;
  if (newv<0) return;
  const total = tricksTotal();
  if (delta>0 && (total-cur+newv)>round.cards) return;
  G.scores[ri][pi].tricks = newv;
  document.getElementById(`tval${pi}`).textContent = newv;
  save();
  updateTricksBar();
  updateTrickIndicators();
}

function updateTrickIndicators() {
  const ri = G.currentRound, round = G.rounds[ri];
  const mis = isMisere(round), hn = isMostTricks(round);
  const total = tricksTotal(), remaining = round.cards - total;

  G.players.forEach((_,pi) => {
    const tricks = parseInt(G.scores[ri][pi].tricks)||0;
    const bid    = parseInt(G.scores[ri][pi].bid)||0;
    const dec = document.getElementById(`tdec${pi}`);
    const inc = document.getElementById(`tinc${pi}`);
    const sub = document.getElementById(`tsub${pi}`);
    const ind = document.getElementById(`tind${pi}`);
    if (dec) dec.disabled = tricks<=0;
    if (inc) { const after=(total-tricks)+(tricks+1); inc.disabled=after>round.cards; }

    if (hn) {
      if (sub) sub.textContent = 'Most tricks wins';
      if (ind) { ind.textContent=''; }
      return;
    }
    if (mis) {
      const pts = ptsFor(round, {bid:0, tricks});
      if (sub) { sub.textContent=`${pts>=0?'+':''}${pts} pts`; sub.className=`ssub ${tricks===0?'hit':'miss'}`; }
      if (ind) { ind.textContent=tricks===0?'✓':'✗'; ind.style.color=tricks===0?'var(--green-bright)':'var(--red)'; }
      return;
    }
    const hit = tricks===bid;
    const pts = ptsFor(round, {bid, tricks});
    if (sub) {
      if (hit) { sub.textContent=`Bid ${bid} ✓ +${pts} pts`; sub.className='ssub hit'; }
      else      { sub.textContent=`Bid ${bid} — ${pts>0?'+'+pts:'0'} pts`; sub.className='ssub miss'; }
    }
    if (ind) { ind.textContent=hit?'✓':(tricks>bid?'↑':'↓'); ind.style.color=hit?'var(--green-bright)':'var(--cream-dim)'; }
  });
}

function confirmTricks() {
  const ri = G.currentRound, round = G.rounds[ri];
  const total = tricksTotal();
  if (total!==round.cards) {
    if (!confirm(`Total tricks (${total}) ≠ cards dealt (${round.cards}). Continue anyway?`)) return;
  }
  scReturnPhase = null;
  goPhase('scorecard');
}

// ─── SCORECARD ────────────────────────────────────────────────────────────────

function renderScorecard() {
  const ri = G.currentRound;
  document.getElementById('sc-rd').textContent = `ROUND ${ri+1} / ${G.rounds.length}`;

  const isLast = ri===G.rounds.length-1;
  document.getElementById('btn-sc-advance').textContent = isLast ? 'FINISH SORTIE ▶' : 'NEXT ROUND ▶';
  const backBtn = document.getElementById('btn-sc-back');
  backBtn.style.display = scReturnPhase ? 'inline-flex' : 'none';

  // Pips
  const strip = document.getElementById('sc-pips');
  strip.innerHTML = '';
  G.rounds.forEach((r,i) => {
    const p = document.createElement('div');
    p.className = 'pip' + (r.special?' special':'');
    if (i<ri) p.classList.add('done');
    if (i===ri) p.classList.add('current');
    strip.appendChild(p);
  });

  // Table
  buildScoreTable('sc-table', ri);
}

function buildScoreTable(tableId, upTo) {
  const { players, rounds, scores } = G;
  const totals = players.map((_,pi)=>playerTotal(pi,upTo));
  const sorted = [...totals].sort((a,b)=>b-a);

  let h = `<thead><tr><th>Round</th>${players.map(p=>`<th class="pcol">${p.toUpperCase()}</th>`).join('')}</tr></thead><tbody>`;

  rounds.forEach((round, ri) => {
    if (ri>upTo) return;
    const cur = ri===upTo;
    h += `<tr${cur?' style="background:rgba(232,168,32,0.05)"':''}>
      <td class="rtd"><span class="rn">${ri+1}. ${round.name}</span><br><span class="rc">${trumpName(ri)}</span></td>`;

    players.forEach((_,pi) => {
      const e = scores[ri][pi];
      let cell = '';

      if (isMostTricks(round)) {
        const t = parseInt(e.tricks);
        if (!isNaN(t)) {
          const {counts,max,sole} = mostTricksFor(ri);
          const won = counts[pi]===max && sole;
          const run = playerTotal(pi,ri);
          cell = `<span class="spts ${won?'hit':'miss'}">${won?'+10':'0'}</span>
            <span class="smeta">${t}T</span>
            <span class="srun">${run}</span>`;
        } else { cell='—'; }
      } else {
        const pts = ptsFor(round,e);
        if (pts===null) { cell='—'; }
        else {
          const bid=parseInt(e.bid), tr2=parseInt(e.tricks);
          const hit = !isNaN(bid)&&!isNaN(tr2)&&bid===tr2&&!isMisere(round);
          const cls = pts>0?'hit':pts<0?'neg':'miss';
          const meta = isMisere(round)?`${tr2}T`:`${bid}→${tr2}`;
          const run = playerTotal(pi,ri);
          cell = `<span class="spts ${cls}">${pts>=0?'+'+pts:pts}</span>
            <span class="smeta ${hit?'hit':''}">${meta}</span>
            <span class="srun">${run}</span>`;
        }
      }
      h += `<td class="ptd">${cell}</td>`;
    });
    h += '</tr>';
  });

  h += `</tbody><tfoot><tr><td style="font-family:'Oswald',sans-serif;font-size:0.58rem;letter-spacing:0.14em;color:var(--amber-dim)">TOTAL</td>`;
  players.forEach((_,pi) => {
    const t=totals[pi], rank=sorted.indexOf(t)+1;
    const b = rank<=3?`<span class="rbadge r${rank}">${['1ST','2ND','3RD'][rank-1]}</span>`:'';
    h += `<td class="ptd"><span class="ttl">${t}</span><span class="ttl-lbl">pts</span><br>${b}</td>`;
  });
  h += '</tr></tfoot>';
  document.getElementById(tableId).innerHTML = h;
}

// ─── GAME OVER ────────────────────────────────────────────────────────────────

function endGameEarly() {
  if (!confirm('End the game early and see final standings?')) return;
  showGameOver();
}

function showGameOver() {
  clearSave();
  const ri = G.currentRound;
  const tots = G.players.map((p,pi)=>({name:p,pts:playerTotal(pi,ri)}));
  tots.sort((a,b)=>b.pts-a.pts);

  document.getElementById('go-standings').innerHTML = tots.map((p,i)=>`
    <div class="stand-row${i===0?' p1':''}">
      <div class="stand-rank">${i+1}</div>
      <div class="stand-name">${p.name}</div>
      <div class="stand-pts">${p.pts} pts</div>
    </div>`).join('');

  buildScoreTable('go-table', ri);
  show('gameover-screen');
}

function resetGame() {
  G = null; clearSave();
  show('setup-screen');
  initSetup();
}

// ─── RULES (available at any time) ─────────────────────────────────────────────

function openRules() {
  const m = document.getElementById('rules-modal');
  m.classList.add('open');
  m.setAttribute('aria-hidden', 'false');
}
function closeRules() {
  const m = document.getElementById('rules-modal');
  m.classList.remove('open');
  m.setAttribute('aria-hidden', 'true');
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeRules(); });

// ─── INIT ─────────────────────────────────────────────────────────────────────
initSetup();
