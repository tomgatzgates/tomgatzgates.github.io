// ─── ROUND DEFINITIONS ────────────────────────────────────────────────────────

const FOSS_SPECIALS = [
  { name:'NO TRUMPS',     cards:7, special:'notrumps',    desc:'No trump suit — highest of led suit wins' },
  { name:"GUESS 'EM",    cards:7, special:'guess',        desc:'Trumps revealed only after all bids are locked in' },
  { name:'MISÈRE NT',    cards:7, special:'misere_nt',    desc:'No trumps — −2 per trick. +10 for taking zero.' },
  { name:'MISÈRE',       cards:7, special:'misere',       desc:'Trumps apply — −3 per trick. +10 for taking zero.' },
  { name:'BLIND',        cards:7, special:'blind',        desc:'Bid before receiving your cards' },
  { name:"ROLL 'EM",     cards:7, special:'rollem',       desc:'Stack face-down — play from the top in order' },
];
const MCLEOD_SPECIALS = [
  { name:'NO TRUMPS',    cards:7, special:'notrumps',    desc:'No trump suit — highest of led suit wins' },
  { name:'MISÈRE',       cards:7, special:'misere',      desc:'Trumps apply — +10 for taking zero tricks' },
  { name:'GUESS TRUMPS', cards:7, special:'guess',       desc:'Trumps revealed only after all bids are locked in' },
  { name:'BLIND',        cards:7, special:'blind',       desc:'Bid before receiving your cards' },
  { name:'TWOS WILD',    cards:7, special:'twos',        desc:'Played Twos: name rank/suit — beats the natural card' },
  { name:'ACES LOW',     cards:7, special:'aceslow',     desc:'Aces rank as the lowest cards in the deck' },
  { name:'DEALER CALLS', cards:7, special:'dealercalls', desc:'Dealer names trumps after viewing their hand' },
  { name:'MOST TRICKS',  cards:7, special:'mosttricks',  desc:'No bidding — player taking the most tricks scores 10' },
];
const SCOTTISH_SPECIALS = [
  { name:'NO TRUMPS',    cards:7, special:'notrumps',  desc:'No trump suit — highest of led suit wins' },
  { name:'MISÈRE',       cards:7, special:'misere',    desc:'−2 per trick. +10 for taking zero tricks.' },
  { name:"GUESS 'EM",   cards:7, special:'guess',      desc:'Bid before trumps are revealed' },
  { name:'BLIND',        cards:7, special:'blind',     desc:'Bid without seeing cards or trumps' },
];

const mk = n => ({ name:`${n} CARD${n>1?'S':''}`, cards:n, special:null, desc:`Standard — ${n} card${n>1?'s':''} each` });

function buildRounds(type) {
  const up   = [1,2,3,4,5,6,7].map(mk);
  const down = [7,6,5,4,3,2,1].map(mk);
  if (type==='standard6') return [...up,   ...FOSS_SPECIALS,    ...down];
  if (type==='standard8') return [...up,   ...MCLEOD_SPECIALS,  ...down];
  if (type==='scottish')  return [...down, ...SCOTTISH_SPECIALS, ...up];
  if (type==='quick')     return [...up.slice(0,5), ...FOSS_SPECIALS.slice(0,3), ...down.slice(0,5)];
  return [...up, ...FOSS_SPECIALS, ...down];
}

// ─── STATE ────────────────────────────────────────────────────────────────────

let G = null;                   // game state
let scReturnPhase = null;       // which phase the scorecard "Back" returns to

const SAVE_KEY  = 'clag_v3';
const NAMES_KEY = 'clag_names';

const save      = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(G)); } catch(e){} };
const loadSave  = () => { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch(e){ return null; } };
const clearSave = () => localStorage.removeItem(SAVE_KEY);
const saveNames = n  => { try { localStorage.setItem(NAMES_KEY, JSON.stringify(n)); } catch(e){} };
const loadNames = () => { try { return JSON.parse(localStorage.getItem(NAMES_KEY))||[]; } catch(e){ return []; } };

// ─── SCORING ──────────────────────────────────────────────────────────────────

const isMisere     = r => r.special==='misere' || r.special==='misere_nt';
const isMostTricks = r => r.special==='mosttricks';

function roundPts(round, entry, perTrick) {
  const t = parseInt(entry.tricks);
  if (isNaN(t)) return null;
  if (isMostTricks(round)) return 0; // handled at round level

  if (round.special === 'misere_nt') return t===0 ? 10 : t*-2;
  if (round.special === 'misere')    return t===0 ? 10 : t*-3;

  const b = parseInt(entry.bid);
  if (isNaN(b)) return null;
  return b===t ? 10 + t*perTrick : 0;
}

function mostTricksWinner(ri) {
  const counts = G.players.map((_,pi) => parseInt(G.scores[ri][pi].tricks)||0);
  const max = Math.max(...counts);
  const sole = counts.filter(c=>c===max).length === 1;
  return { counts, max, sole };
}

function playerTotal(pi, upTo) {
  let t = 0;
  for (let ri=0; ri<=upTo; ri++) {
    const r = G.rounds[ri], e = G.scores[ri][pi];
    if (isMostTricks(r)) {
      if (e.tricks===''||e.tricks===null||e.tricks===undefined) continue;
      const {counts,max,sole} = mostTricksWinner(ri);
      if (counts[pi]===max && sole) t+=10;
    } else {
      const p = roundPts(r, e, G.perTrick);
      if (p!==null) t+=p;
    }
  }
  return t;
}

// ─── BID ORDER / DEALER ───────────────────────────────────────────────────────

const dealerFor = ri => ri % G.players.length;

function bidOrder(ri) {
  const n = G.players.length, d = dealerFor(ri), order=[];
  for (let i=1; i<=n; i++) order.push((d+i)%n);
  return order; // last = dealer
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
        maxlength="14" autocomplete="off" autocorrect="off" spellcheck="false">`;
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

function resumeGame() {
  const sv = loadSave();
  if (!sv) return;
  G = sv;
  document.getElementById('resume-banner').style.display = 'none';
  goPhase(G.phase||'bid');
}

function discardSave() {
  clearSave();
  document.getElementById('resume-banner').style.display = 'none';
}

function startGame() {
  const players = [];
  for (let i=0; i<7; i++) {
    const v = document.getElementById(`pi${i}`).value.trim();
    if (i<3 && !v) { alert(`Player ${i+1} name is required.`); return; }
    if (v) players.push(v);
  }
  const gameType = document.querySelector('input[name="gametype"]:checked').value;
  const perTrick = parseInt(document.querySelector('input[name="scoring"]:checked').value);
  const rounds = buildRounds(gameType);

  G = {
    players,
    rounds,
    currentRound: 0,
    phase: 'bid',
    perTrick,
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
  // fresh entries for new round (keep defaults at 0)
  G.players.forEach((_,pi)=>{ G.scores[G.currentRound][pi]={bid:0,tricks:0}; });
  scReturnPhase = null;
  save();
  goPhase('bid');
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

  const c = document.getElementById('tricks-players');
  c.innerHTML = '';

  G.players.forEach((name,pi) => {
    const bid = parseInt(G.scores[ri][pi].bid)||0;
    const val = parseInt(G.scores[ri][pi].tricks)||0;
    const row = document.createElement('div');
    row.className = 'stepper-row';
    row.id = `tr${pi}`;
    row.innerHTML = `
      <div class="sinfo">
        <div class="sname">${name.toUpperCase()}</div>
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
      const pts = round.special==='misere_nt' ? (tricks===0?10:tricks*-2) : (tricks===0?10:tricks*-3);
      if (sub) { sub.textContent=`${pts>=0?'+':''}${pts} pts`; sub.className=`ssub ${tricks===0?'hit':'miss'}`; }
      if (ind) { ind.textContent=tricks===0?'✓':'✗'; ind.style.color=tricks===0?'var(--green-bright)':'var(--red)'; }
      return;
    }
    const hit = tricks===bid;
    if (sub) {
      if (hit) { const p=10+tricks*G.perTrick; sub.textContent=`Bid ${bid} ✓ +${p} pts`; sub.className='ssub hit'; }
      else      { sub.textContent=`Bid ${bid} — 0 pts`; sub.className='ssub miss'; }
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
  const { players, rounds, scores, perTrick } = G;
  const totals = players.map((_,pi)=>playerTotal(pi,upTo));
  const sorted = [...totals].sort((a,b)=>b-a);

  let h = `<thead><tr><th>Round</th>${players.map(p=>`<th class="pcol">${p.toUpperCase()}</th>`).join('')}</tr></thead><tbody>`;

  rounds.forEach((round, ri) => {
    if (ri>upTo) return;
    const cur = ri===upTo;
    h += `<tr${cur?' style="background:rgba(232,168,32,0.05)"':''}>
      <td class="rtd"><span class="rn">${ri+1}. ${round.name}</span><br><span class="rc">${round.cards}c</span></td>`;

    players.forEach((_,pi) => {
      const e = scores[ri][pi];
      let cell = '';

      if (isMostTricks(round)) {
        const t = parseInt(e.tricks);
        if (!isNaN(t)) {
          const {counts,max,sole} = mostTricksWinner(ri);
          const won = counts[pi]===max && sole;
          const run = playerTotal(pi,ri);
          cell = `<span class="spts ${won?'hit':'miss'}">${won?'+10':'0'}</span>
            <span class="smeta">${t}T</span>
            <span class="srun">${run}</span>`;
        } else { cell='—'; }
      } else {
        const pts = roundPts(round,e,perTrick);
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

// ─── INIT ─────────────────────────────────────────────────────────────────────
initSetup();
