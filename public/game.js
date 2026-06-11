/**
 * ============================================================
 * SONGO – Mode vs IA + 2 Joueurs (même fichier)
 * Fichier : game.js
 *
 * Auteur   : Tsombeng Geraldis Leclerc
 * Matricule: 23U2976
 * Université de Yaoundé 1
 *
 * FONCTIONNALITÉS GAMEPLAY
 * ─────────────────────────
 * 1. MINUTEUR PAR TOUR  (0 / 30s / 60s / 90s)
 *    - 3 états visuels : normal → warning (≤15s) → danger (≤5s)
 *    - Expiration : tour passé automatiquement (joueur humain)
 *    - IA non soumise au minuteur (elle joue dès qu'elle est prête)
 *
 * 2. HISTORIQUE DES COUPS
 *    - Enregistre : joueur, case, graines, captures, timeout
 *    - Panneau coulissant (bouton 📋)
 *    - Badge compteur mis à jour en temps réel
 *
 * 3. BEST OF N  (partie unique / best of 3 / best of 5)
 *    - Modal intermédiaire entre chaque manche
 *    - Étoiles de progression dans le scoreboard
 *    - Modal final de match
 * ============================================================
 */

// ── Variables de jeu (originales) ─────────────────────────────────────────────
let gameMode      = 'vsAI';
let aiLevel       = 'medium';
let board         = [];
let scores        = [0, 0];
let currentPlayer = 1;
let gameOver      = false;
let isAnimating   = false;
let playerNames   = ['IA', 'Vous'];

// ── Variables gameplay supplémentaires ────────────────────────────────────────
let timerSec      = 60;      // 0 = désactivé
let matchBest     = 1;       // 1 | 3 | 5
let matchWins     = [0, 0];
let currentRound  = 1;
let winsNeeded    = 1;

let timerInterval  = null;
let timerRemaining = 0;

let moveHistory = [];

// ── Navigation ────────────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.style.display = 'none';
  });
  const el = document.getElementById(id);
  if (el) { el.style.display = 'flex'; el.classList.add('active'); }
}

// ── Configuration (appelée depuis game.html) ──────────────────────────────────
function selCfg(group, val, btn) {
  btn.closest('.config-options').querySelectorAll('.config-btn')
     .forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (group === 'timer') timerSec  = parseInt(val);
  if (group === 'match') matchBest = parseInt(val);
}

function initMatch() {
  winsNeeded   = Math.ceil(matchBest / 2);
  matchWins    = [0, 0];
  currentRound = 1;
  showScreen('screen-game');
  updateMatchUI();
  startRound();
}

// ── Démarrage d'une manche ────────────────────────────────────────────────────
function startRound() {
  initBoard();
  moveHistory  = [];
  gameOver     = false;
  isAnimating  = false;
  currentPlayer = 1;
  closeAllModals();
  renderBoard();
  updateScores();
  updateLabels();
  highlightActivePlayer();
  updateRoundBadge();
  updateHistoryPanel();
  stopTimer();
  setStatus(`Tour de ${playerNames[1]}`, true);
  if (timerSec > 0) startTimer();
}

function startGame(mode) {
  gameMode = mode || 'vsAI';
  playerNames = gameMode === 'vsAI' ? ['IA', 'Vous'] : ['Joueur NORD', 'Joueur SUD'];
  const badge = document.getElementById('game-mode-badge');
  if (badge) badge.textContent = gameMode === 'vsAI' ? `🤖 Vs IA (${aiLevel})` : '👥 2 Joueurs';
  initMatch();
}

function restartGame() { closeAllModals(); startGame(gameMode); }
function replayMatch()  { closeAllModals(); startGame(gameMode); }

// ── Plateau ───────────────────────────────────────────────────────────────────
function initBoard() { board = new Array(14).fill(5); scores = [0, 0]; }

function getPlayerRow(p)    { return p === 0 ? [0,1,2,3,4,5,6] : [13,12,11,10,9,8,7]; }
function getOpponentRow(p)  { return p === 0 ? [13,12,11,10,9,8,7] : [0,1,2,3,4,5,6]; }
function getOpponentCase1(p){ return p === 0 ? 13 : 0; }
function getPlayerCase7(p)  { return p === 0 ? 6  : 7; }

function sowingOrder(startCell, player, seeds) {
  const sequence = player === 0
    ? [6,5,4,3,2,1,0, 7,8,9,10,11,12,13]
    : [7,8,9,10,11,12,13, 6,5,4,3,2,1,0];
  const startIdx = sequence.indexOf(startCell);
  const order = [];
  for (let i = 1; i <= seeds; i++) {
    let idx = (startIdx + i) % sequence.length;
    if (sequence[idx] === startCell) { i++; idx = (startIdx + i) % sequence.length; }
    order.push(sequence[idx]);
  }
  return order;
}

function opponentEmpty(player) { return getPlayerRow(1-player).every(i => board[i] === 0); }
function boardTotal()          { return board.reduce((s,v) => s+v, 0); }

function isValidMove(player, cellIdx) {
  const myRow = getPlayerRow(player);
  if (!myRow.includes(cellIdx) || board[cellIdx] === 0) return false;
  if (opponentEmpty(player)) {
    const seeds = board[cellIdx];
    const order = sowingOrder(cellIdx, player, seeds);
    const oppRow = getPlayerRow(1-player);
    const toOpp = order.filter(i => oppRow.includes(i)).length;
    const maxToOpp = myRow.reduce((best, c) => {
      if (board[c] === 0) return best;
      const o = sowingOrder(c, player, board[c]);
      return Math.max(best, o.filter(i => oppRow.includes(i)).length);
    }, 0);
    if (maxToOpp >= 7 && toOpp < 7) return false;
    if (maxToOpp < 7  && toOpp < maxToOpp) return false;
  }
  return true;
}

function getValidMoves(player) {
  return getPlayerRow(player).filter(i => board[i] > 0 && isValidMove(player, i));
}

function executeMove(player, cellIdx) {
  const seeds = board[cellIdx];
  board[cellIdx] = 0;
  const order = sowingOrder(cellIdx, player, seeds);
  order.forEach(i => board[i]++);

  const lastCell  = order[order.length - 1];
  const oppRow    = getPlayerRow(1 - player);
  const oppCase1  = getOpponentCase1(player);
  const case7     = getPlayerCase7(player);

  if (cellIdx === case7 && seeds <= 2) {
    const inOpp = order.filter(i => oppRow.includes(i));
    if (inOpp.length > 0) {
      scores[1-player] += inOpp.length;
      inOpp.forEach(i => { board[i]--; });
    }
    return { lastCell, captured: [] };
  }

  const oppTotal = oppRow.reduce((s, i) => s + board[i], 0);
  if (oppTotal === 0) return { lastCell, captured: [] };

  const captured = [];
  if (oppRow.includes(lastCell) && lastCell !== oppCase1) {
    let cur = lastCell;
    while (oppRow.includes(cur) && cur !== oppCase1 && board[cur] >= 2 && board[cur] <= 4) {
      const wouldEmpty = oppRow.every(i => i === cur ? true : board[i] === 0);
      if (wouldEmpty) break;
      captured.push(cur);
      scores[player] += board[cur];
      board[cur] = 0;
      const pos = oppRow.indexOf(cur);
      if (pos <= 0) break;
      cur = oppRow[pos - 1];
    }
  }
  if (lastCell === oppCase1 && seeds >= 14 && board[oppCase1] > 0) {
    captured.push(oppCase1);
    scores[player] += 1;
    board[oppCase1]--;
  }
  return { lastCell, captured };
}

function checkEndConditions() {
  if (scores[0] >= 40 || scores[1] >= 40) return true;
  if (boardTotal() < 10) {
    getPlayerRow(0).forEach(i => { scores[0] += board[i]; board[i] = 0; });
    getPlayerRow(1).forEach(i => { scores[1] += board[i]; board[i] = 0; });
    return true;
  }
  if (getValidMoves(currentPlayer).length === 0) {
    getPlayerRow(0).forEach(i => { scores[0] += board[i]; board[i] = 0; });
    getPlayerRow(1).forEach(i => { scores[1] += board[i]; board[i] = 0; });
    return true;
  }
  return false;
}

// ══════════════════════════════════════════════════════════════
// FONCTIONNALITÉ 1 — MINUTEUR
// ══════════════════════════════════════════════════════════════
function startTimer() {
  if (timerSec === 0) return;
  stopTimer();
  timerRemaining = timerSec;
  renderTimer();
  timerInterval = setInterval(() => {
    timerRemaining--;
    renderTimer();
    if (timerRemaining <= 0) { stopTimer(); onTimerExpired(); }
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
}

function renderTimer() {
  const widget  = document.getElementById('timer-widget');
  const display = document.getElementById('timer-display');
  if (!widget || !display) return;
  if (timerSec === 0) { display.textContent = '—'; widget.className = 'timer-widget'; return; }
  display.textContent = timerRemaining + 's';
  widget.className = timerRemaining <= 5  ? 'timer-widget danger'
                   : timerRemaining <= 15 ? 'timer-widget warning'
                   : 'timer-widget';
}

async function onTimerExpired() {
  if (gameOver || isAnimating) return;
  // L'IA ne subit pas le minuteur
  if (gameMode === 'vsAI' && currentPlayer === 0) return;
  isAnimating = true;
  const expired = currentPlayer;

  moveHistory.push({ round: currentRound, player: expired, caseNum: null, seeds: null, captured: [], timeout: true });
  updateHistoryPanel();
  showFlashBanner(`⏰ Temps écoulé ! ${playerNames[expired]} passe son tour.`);
  setStatus('⏰ Tour passé — temps écoulé !', false);
  await delay(1800);

  currentPlayer = 1 - expired;
  isAnimating   = false;
  renderBoard();
  highlightActivePlayer();
  setStatus(`Tour de ${playerNames[currentPlayer]}`, true);
  if (timerSec > 0) startTimer();

  if (gameMode === 'vsAI' && currentPlayer === 0) await aiTurn();
}

// ══════════════════════════════════════════════════════════════
// FONCTIONNALITÉ 2 — HISTORIQUE
// ══════════════════════════════════════════════════════════════
function recordMove(player, cellIdx, seeds, captured) {
  const caseNum = player === 0 ? cellIdx + 1 : 14 - cellIdx;
  moveHistory.push({ round: currentRound, player, caseNum, seeds, captured: [...captured], timeout: false });
  updateHistoryPanel();
}

function updateHistoryPanel() {
  const list  = document.getElementById('history-list');
  const count = document.getElementById('history-count');
  if (!list) return;

  if (moveHistory.length === 0) {
    list.innerHTML = '<div class="history-empty">Aucun coup joué</div>';
    if (count) { count.textContent = '0'; count.classList.add('hidden'); }
    return;
  }
  if (count) { count.textContent = moveHistory.length; count.classList.remove('hidden'); }

  list.innerHTML = '';
  [...moveHistory].reverse().forEach((mv, i) => {
    const realIdx = moveHistory.length - i;
    const div = document.createElement('div');
    div.className = `history-item ${mv.player === 0 ? 'north' : 'south'}`;

    const num = document.createElement('span');
    num.className = 'history-num';
    num.textContent = realIdx + '.';

    const pSpan = document.createElement('span');
    pSpan.className = 'history-player';
    pSpan.textContent = playerNames[mv.player];

    const detail = document.createElement('div');
    detail.className = 'history-detail';
    if (mv.timeout) {
      detail.innerHTML = '<span class="history-timeout">⏰ Temps écoulé</span>';
    } else {
      let html = `Case ${mv.caseNum} · ${mv.seeds} graine${mv.seeds > 1 ? 's' : ''}`;
      if (mv.captured.length > 0)
        html += `<br><span class="history-capture">🟢 +${mv.captured.length} capturée(s)</span>`;
      detail.innerHTML = html;
    }
    div.appendChild(num); div.appendChild(pSpan); div.appendChild(detail);
    list.appendChild(div);
  });
}

function toggleHistory() {
  const panel   = document.getElementById('history-panel');
  const overlay = document.getElementById('history-overlay');
  if (!panel) return;
  panel.classList.toggle('open');
  if (overlay) overlay.classList.toggle('visible');
}
function closeHistory() {
  const panel   = document.getElementById('history-panel');
  const overlay = document.getElementById('history-overlay');
  if (panel)   panel.classList.remove('open');
  if (overlay) overlay.classList.remove('visible');
}

// ══════════════════════════════════════════════════════════════
// FONCTIONNALITÉ 3 — BEST OF N
// ══════════════════════════════════════════════════════════════
function onRoundEnd() {
  const [s0, s1] = scores;
  let winner = s0 > s1 ? 0 : s1 > s0 ? 1 : null;
  if (winner !== null) matchWins[winner]++;
  updateMatchUI();
  if (matchWins[0] >= winsNeeded || matchWins[1] >= winsNeeded) {
    showMatchEnd();
  } else {
    showRoundModal(winner, s0, s1);
  }
}

function showRoundModal(winner, s0, s1) {
  const modal = document.getElementById('modal-round');
  if (!modal) { nextRound(); return; }

  document.getElementById('round-icon').textContent  = winner === null ? '🤝' : '🏅';
  document.getElementById('round-title').textContent = winner === null ? 'Égalité !'
    : `${playerNames[winner]} remporte la manche !`;
  document.getElementById('round-desc').textContent  = `Score : ${playerNames[0]} ${s0} – ${playerNames[1]} ${s1}`;
  document.getElementById('round-wins-north').textContent = matchWins[0];
  document.getElementById('round-wins-south').textContent = matchWins[1];

  const starsDiv = document.getElementById('round-stars');
  if (starsDiv) {
    starsDiv.innerHTML = '';
    ['🔵','🟡'].forEach((em, p) => {
      for (let w = 0; w < winsNeeded; w++) {
        const s = document.createElement('span');
        s.className = 'round-star' + (w < matchWins[p] ? ' filled' : '');
        s.textContent = em; starsDiv.appendChild(s);
      }
      if (p === 0) { const sep = document.createElement('span'); sep.textContent = '  '; starsDiv.appendChild(sep); }
    });
  }
  const btnNext = document.getElementById('btn-next-round');
  if (btnNext) btnNext.textContent = `▶ Manche ${currentRound + 1}`;
  modal.classList.remove('hidden');
}

function nextRound() {
  currentRound++;
  moveHistory = [];
  const m = document.getElementById('modal-round');
  if (m) m.classList.add('hidden');
  startRound();
}

function showMatchEnd() {
  const mWinner = matchWins[0] >= winsNeeded ? 0 : 1;
  document.getElementById('modal-icon').textContent  = '🏆';
  document.getElementById('modal-title').textContent = `${playerNames[mWinner]} gagne le match !`;
  document.getElementById('modal-desc').textContent  =
    `Victoires : ${playerNames[0]} ${matchWins[0]} – ${playerNames[1]} ${matchWins[1]}` +
    (matchBest > 1 ? ` (Best of ${matchBest})` : '');
  document.getElementById('modal-score-north').textContent = matchWins[0];
  document.getElementById('modal-score-south').textContent = matchWins[1];
  document.getElementById('modal-label-north').textContent = playerNames[0];
  document.getElementById('modal-label-south').textContent = playerNames[1];
  document.getElementById('modal-endgame').classList.remove('hidden');
}

function updateMatchUI() {
  const info  = document.getElementById('match-info');
  const badge = document.getElementById('match-score-badge');
  if (info)  info.style.display  = matchBest > 1 ? 'flex' : 'none';
  if (badge) badge.textContent   = `${matchWins[0]} – ${matchWins[1]}`;
  renderStars('stars-north', matchWins[0], winsNeeded, '🔵');
  renderStars('stars-south', matchWins[1], winsNeeded, '🟡');
}

function renderStars(id, won, needed, em) {
  const div = document.getElementById(id);
  if (!div) return;
  div.innerHTML = '';
  if (needed <= 1) return;
  for (let i = 0; i < needed; i++) {
    const s = document.createElement('span');
    s.className = 'win-star' + (i < won ? ' filled' : '');
    s.textContent = em; div.appendChild(s);
  }
}

function updateRoundBadge() {
  const b = document.getElementById('round-badge');
  if (b) b.textContent = matchBest > 1 ? `Manche ${currentRound} / Best of ${matchBest}` : 'Partie unique';
}

// ── Rendu ─────────────────────────────────────────────────────────────────────
function renderBoard() {
  const rn = document.getElementById('row-north');
  const rs = document.getElementById('row-south');
  if (!rn || !rs) return;
  rn.innerHTML = ''; rs.innerHTML = '';
  for (let i = 0;  i < 7;  i++) rn.appendChild(makeCell(i, 0));
  for (let i = 7;  i < 14; i++) rs.appendChild(makeCell(i, 1));
}

function makeCell(idx, player) {
  const div   = document.createElement('div');
  div.className = 'cell'; div.id = `cell-${idx}`;
  const count = board[idx];

  const num = document.createElement('span');
  num.className = 'cell-seeds'; num.textContent = count;
  div.appendChild(num);

  if (count > 0 && count <= 10) {
    const dots = document.createElement('div');
    dots.className = 'cell-dots';
    for (let d = 0; d < count; d++) {
      const dot = document.createElement('div');
      dot.className = 'seed-dot'; dots.appendChild(dot);
    }
    div.appendChild(dots);
  }

  const lbl = document.createElement('span');
  lbl.className = 'cell-num';
  lbl.textContent = player === 0 ? idx + 1 : 14 - idx;
  div.appendChild(lbl);

  const canPlay = !gameOver && !isAnimating
    && getPlayerRow(player).includes(idx)
    && currentPlayer === player
    && count > 0 && isValidMove(player, idx);
  if (canPlay) div.addEventListener('click', () => handleCellClick(idx));
  else div.classList.add('disabled');
  return div;
}

function updateScores() {
  const n = document.getElementById('score-north-val');
  const s = document.getElementById('score-south-val');
  if (n) n.textContent = scores[0];
  if (s) s.textContent = scores[1];
}

function highlightActivePlayer() {
  const n = document.getElementById('score-north');
  const s = document.getElementById('score-south');
  if (n) n.classList.toggle('active-player', currentPlayer === 0);
  if (s) s.classList.toggle('active-player', currentPlayer === 1);
}

function setStatus(msg, showTurn) {
  const sm = document.getElementById('status-message');
  const ti = document.getElementById('turn-indicator');
  if (sm) sm.textContent = msg;
  if (ti) {
    if (showTurn) { ti.textContent = currentPlayer === 0 ? '↑ NORD' : '↓ SUD'; ti.classList.add('visible'); }
    else ti.classList.remove('visible');
  }
}

function updateLabels() {
  const n = document.getElementById('label-north');
  const s = document.getElementById('label-south');
  if (n) n.textContent = playerNames[0];
  if (s) s.textContent = playerNames[1];
}

// ── Clic ──────────────────────────────────────────────────────────────────────
function handleCellClick(idx) {
  if (gameOver || isAnimating) return;
  if (!isValidMove(currentPlayer, idx)) {
    const c = document.getElementById(`cell-${idx}`);
    if (c) { c.classList.add('forbidden'); setTimeout(() => c.classList.remove('forbidden'), 400); }
    setStatus('⚠ Coup interdit !', false);
    setTimeout(() => setStatus(`Tour de ${playerNames[currentPlayer]}`, true), 1000);
    return;
  }
  playTurn(currentPlayer, idx);
}

async function playTurn(player, cellIdx) {
  isAnimating = true;
  stopTimer();
  const seedCount = board[cellIdx];

  const sel = document.getElementById(`cell-${cellIdx}`);
  if (sel) sel.classList.add('selected');
  await delay(300);

  const { captured } = executeMove(player, cellIdx);
  if (sel) sel.classList.remove('selected');

  recordMove(player, cellIdx, seedCount, captured);
  renderBoard(); updateScores();

  if (captured.length > 0) {
    captured.forEach(i => { const c = document.getElementById(`cell-${i}`); if (c) c.classList.add('captured'); });
    setStatus(`🟢 ${captured.length} case(s) capturée(s) !`, false);
    await delay(700);
    captured.forEach(i => { const c = document.getElementById(`cell-${i}`); if (c) c.classList.remove('captured'); });
  }

  updateScores();

  if (checkEndConditions()) {
    renderBoard(); updateScores();
    isAnimating = false;
    await delay(400);
    gameOver = true;
    onRoundEnd();
    return;
  }

  currentPlayer = 1 - player;
  isAnimating   = false;
  renderBoard(); highlightActivePlayer();
  setStatus(`Tour de ${playerNames[currentPlayer]}`, true);

  if (gameMode === 'vsAI' && currentPlayer === 0) {
    await aiTurn();
  } else {
    if (timerSec > 0) startTimer();
  }
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── IA ────────────────────────────────────────────────────────────────────────
async function aiTurn() {
  isAnimating = true;
  setStatus("L'IA réfléchit…", false);
  await delay(aiLevel === 'easy' ? 600 : aiLevel === 'medium' ? 900 : 1200);

  const moves = getValidMoves(0);
  if (!moves.length) {
    isAnimating = false;
    if (checkEndConditions()) { renderBoard(); updateScores(); gameOver = true; onRoundEnd(); }
    return;
  }

  let chosen;
  if      (aiLevel === 'easy')   chosen = moves[Math.floor(Math.random() * moves.length)];
  else if (aiLevel === 'medium') chosen = pickBestMove(0, 1);
  else                            chosen = pickBestMove(0, 3);

  isAnimating = false;
  await playTurn(0, chosen);
}

function pickBestMove(player, depth) {
  const moves = getValidMoves(player);
  if (!moves.length) return null;
  let best = moves[0], bestScore = -Infinity;
  for (const m of moves) {
    const sb = [...board], ss = [...scores];
    executeMove(player, m);
    const s = minimax(1-player, depth-1, player, -Infinity, Infinity);
    board = sb; scores = ss;
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best;
}

function minimax(player, depth, maximizer, alpha, beta) {
  if (depth === 0 || boardTotal() < 10 || scores[0] >= 40 || scores[1] >= 40)
    return scores[maximizer] - scores[1-maximizer];
  const moves = getValidMoves(player);
  if (!moves.length) return scores[maximizer] - scores[1-maximizer];
  if (player === maximizer) {
    let best = -Infinity;
    for (const m of moves) {
      const sb = [...board], ss = [...scores];
      executeMove(player, m);
      best = Math.max(best, minimax(1-player, depth-1, maximizer, alpha, beta));
      board = sb; scores = ss; alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const m of moves) {
      const sb = [...board], ss = [...scores];
      executeMove(player, m);
      best = Math.min(best, minimax(1-player, depth-1, maximizer, alpha, beta));
      board = sb; scores = ss; beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}

// ── Utilitaires UI ────────────────────────────────────────────────────────────
function showFlashBanner(msg) {
  const old = document.querySelector('.flash-banner');
  if (old) old.remove();
  const b = document.createElement('div');
  b.className = 'flash-banner'; b.textContent = msg;
  document.body.appendChild(b);
  setTimeout(() => b.remove(), 2200);
}

function closeAllModals() {
  ['modal-endgame','modal-round'].forEach(id => {
    const m = document.getElementById(id);
    if (m) m.classList.add('hidden');
  });
}
function closeModal() { closeAllModals(); }

function createParticles() {
  const c = document.getElementById('particles');
  if (!c) return;
  for (let i = 0; i < 20; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const size = Math.random() * 6 + 3;
    p.style.cssText = `width:${size}px;height:${size}px;left:${Math.random()*100}%;--dur:${Math.random()*6+5}s;--delay:${Math.random()*8}s;`;
    c.appendChild(p);
  }
}

// ── Sélection de niveau depuis index.html ─────────────────────────────────────
function selectLevel(lvl) {
  aiLevel = lvl;
  document.querySelectorAll('.level-tag').forEach(t => t.classList.remove('active'));
  document.querySelectorAll(`.level-tag[data-level="${lvl}"]`).forEach(t => t.classList.add('active'));
}
function showRules() { showScreen('screen-rules'); }
function hideRules() { showScreen('screen-home'); }
function goHome()    { showScreen('screen-home'); closeModal(); }

window.addEventListener('DOMContentLoaded', () => { createParticles(); });

// ══════════════════════════════════════════════════════════════
// FONCTIONNALITÉ 4 — ANIMATION DE SEMIS CASE PAR CASE
// ══════════════════════════════════════════════════════════════
/**
 * Anime visuellement le dépôt d'une graine dans une case :
 * une petite bille dorée part du centre du plateau et arrive
 * dans la case cible avec un effet de rebond.
 * @param {number} fromIdx  case source (vide après prélèvement)
 * @param {number} toIdx    case destination
 * @returns {Promise}       résolue quand l'animation est finie
 */
function animateSeedDrop(fromIdx, toIdx) {
  return new Promise(resolve => {
    const fromCell = document.getElementById(`cell-${fromIdx}`);
    const toCell   = document.getElementById(`cell-${toIdx}`);
    if (!fromCell || !toCell) { resolve(); return; }

    const fromRect = fromCell.getBoundingClientRect();
    const toRect   = toCell.getBoundingClientRect();

    // Créer la bille volante
    const seed = document.createElement('div');
    seed.className = 'flying-seed-anim';
    seed.style.cssText = `
      position: fixed;
      width: 10px; height: 10px;
      border-radius: 50%;
      background: var(--accent-gold);
      box-shadow: 0 0 8px rgba(201,150,62,0.9);
      z-index: 999;
      pointer-events: none;
      left: ${fromRect.left + fromRect.width/2 - 5}px;
      top:  ${fromRect.top  + fromRect.height/2 - 5}px;
      transition: left 0.18s ease-in, top 0.18s ease-in;
    `;
    document.body.appendChild(seed);

    // Forcer reflow puis lancer le mouvement
    seed.getBoundingClientRect();
    seed.style.left = `${toRect.left + toRect.width/2 - 5}px`;
    seed.style.top  = `${toRect.top  + toRect.height/2 - 5}px`;

    setTimeout(() => {
      // Flash sur la case d'arrivée
      toCell.classList.add('seed-landing');
      setTimeout(() => toCell.classList.remove('seed-landing'), 200);
      seed.remove();
      resolve();
    }, 190);
  });
}

/**
 * Remplace le rendu instantané du semis par une animation
 * graine par graine. Appelée depuis playTurn() quand
 * SOWING_ANIMATION est activé.
 * @param {number} player   joueur qui sème
 * @param {number} cellIdx  case de départ
 * @param {number[]} order  ordre de semis (depuis sowingOrder())
 */
async function animateSowing(player, cellIdx, order) {
  // Vider la case source visuellement
  updateCellDisplay(cellIdx);

  // Déposer chaque graine avec un court délai entre elles
  const DELAY_BETWEEN = aiLevel === 'easy' ? 140 : aiLevel === 'medium' ? 110 : 80;
  for (const target of order) {
    await animateSeedDrop(cellIdx, target);
    updateCellDisplay(target);
    await delay(DELAY_BETWEEN);
  }
}

/** Met à jour l'affichage d'une seule case sans reconstruire tout le plateau */
function updateCellDisplay(idx) {
  const cell = document.getElementById(`cell-${idx}`);
  if (!cell) return;
  const count = board[idx];
  const numSpan = cell.querySelector('.cell-seeds');
  if (numSpan) numSpan.textContent = count;
  const dotsDiv = cell.querySelector('.cell-dots');
  if (dotsDiv) {
    dotsDiv.innerHTML = '';
    if (count > 0 && count <= 10) {
      for (let d = 0; d < count; d++) {
        const dot = document.createElement('div');
        dot.className = 'seed-dot';
        dotsDiv.appendChild(dot);
      }
    }
  }
}

// ══════════════════════════════════════════════════════════════
// FONCTIONNALITÉ 5 — SONS (Web Audio API, sans fichiers externes)
// ══════════════════════════════════════════════════════════════
let audioCtx = null;
let soundEnabled = true;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

/**
 * Joue un son synthétique simple.
 * @param {string} type  'drop'|'capture'|'win'|'lose'|'forbidden'|'timer'
 */
function playSound(type) {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    switch (type) {
      case 'drop':
        // Petite bille qui tombe : bref clic grave
        osc.type = 'sine';
        osc.frequency.setValueAtTime(420, now);
        osc.frequency.exponentialRampToValueAtTime(280, now + 0.08);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
        osc.start(now); osc.stop(now + 0.09);
        break;

      case 'capture':
        // Clic cristallin aigu × 2
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.12);
        gain.gain.setValueAtTime(0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.start(now); osc.stop(now + 0.18);
        break;

      case 'win':
        // Fanfare ascendante
        [523, 659, 784, 1047].forEach((freq, i) => {
          const o2 = ctx.createOscillator();
          const g2 = ctx.createGain();
          o2.connect(g2); g2.connect(ctx.destination);
          o2.type = 'triangle';
          o2.frequency.value = freq;
          g2.gain.setValueAtTime(0, now + i * 0.12);
          g2.gain.linearRampToValueAtTime(0.25, now + i * 0.12 + 0.05);
          g2.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.25);
          o2.start(now + i * 0.12);
          o2.stop(now + i * 0.12 + 0.25);
        });
        return; // Pas besoin de la suite

      case 'lose':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.35);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now); osc.stop(now + 0.35);
        break;

      case 'forbidden':
        osc.type = 'square';
        osc.frequency.setValueAtTime(180, now);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.start(now); osc.stop(now + 0.15);
        break;

      case 'timer':
        // Tic grave d'horloge
        osc.type = 'sine';
        osc.frequency.setValueAtTime(220, now);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        osc.start(now); osc.stop(now + 0.06);
        break;
    }
  } catch(e) { /* Web Audio non supporté */ }
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  const btn = document.getElementById('btn-sound');
  if (btn) btn.textContent = soundEnabled ? '🔊' : '🔇';
}

// Injecter le bouton son dans le header dès que le DOM est prêt
function injectSoundButton() {
  const headerRight = document.querySelector('.header-right');
  if (!headerRight || document.getElementById('btn-sound')) return;
  const btn = document.createElement('button');
  btn.id = 'btn-sound';
  btn.className = 'btn-history'; // même style
  btn.textContent = '🔊';
  btn.title = 'Activer/désactiver le son';
  btn.onclick = toggleSound;
  headerRight.insertBefore(btn, headerRight.firstChild);
}

// ══════════════════════════════════════════════════════════════
// REMPLACEMENT DE playTurn() — intègre animation + sons
// ══════════════════════════════════════════════════════════════
// On surcharge la fonction playTurn précédente avec une version
// qui active l'animation case par case et les sons.

const SOWING_ANIMATION = true; // mettre false pour désactiver

playTurn = async function(player, cellIdx) {
  isAnimating = true;
  stopTimer();
  const seedCount = board[cellIdx];

  // Son : prélèvement
  playSound('drop');

  const sel = document.getElementById(`cell-${cellIdx}`);
  if (sel) sel.classList.add('selected');
  await delay(200);

  // Calculer l'ordre AVANT d'exécuter (executeMove modifie board)
  const order = sowingOrder(cellIdx, player, seedCount);

  // Exécuter le coup (modifie board et scores)
  const { captured } = executeMove(player, cellIdx);
  if (sel) sel.classList.remove('selected');

  if (SOWING_ANIMATION && seedCount <= 20) {
    // Animation graine par graine
    // Remettre la case source à 0 visuellement (déjà fait par executeMove)
    updateCellDisplay(cellIdx);
    const DELAY_BETWEEN = 120;
    for (const target of order) {
      playSound('drop');
      await animateSeedDrop(cellIdx, target);
      updateCellDisplay(target);
      await delay(DELAY_BETWEEN);
    }
  } else {
    // Rendu instantané pour les très grandes distributions
    renderBoard();
  }

  updateScores();

  // Enregistrer dans l'historique
  recordMove(player, cellIdx, seedCount, captured);

  // Animer les captures
  if (captured.length > 0) {
    playSound('capture');
    captured.forEach(i => {
      const c = document.getElementById(`cell-${i}`);
      if (c) c.classList.add('captured');
    });
    setStatus(`🟢 ${captured.length} case(s) capturée(s) !`, false);
    await delay(700);
    captured.forEach(i => {
      const c = document.getElementById(`cell-${i}`);
      if (c) c.classList.remove('captured');
    });
  }

  renderBoard();
  updateScores();

  if (checkEndConditions()) {
    renderBoard(); updateScores();
    isAnimating = false;
    await delay(400);
    gameOver = true;
    // Son de fin
    const roundWinner = scores[0] > scores[1] ? 0 : scores[1] > scores[0] ? 1 : null;
    if (roundWinner === null) { /* égalité */ }
    else if (roundWinner === (gameMode === 'vsAI' ? 1 : player)) playSound('win');
    else playSound('lose');
    onRoundEnd();
    return;
  }

  currentPlayer = 1 - player;
  isAnimating   = false;
  renderBoard(); highlightActivePlayer();
  setStatus(`Tour de ${playerNames[currentPlayer]}`, true);

  if (gameMode === 'vsAI' && currentPlayer === 0) {
    await aiTurn();
  } else {
    if (timerSec > 0) startTimer();
  }
};

// Surcharger renderTimer pour jouer un son à 5s restantes
const _origRenderTimer = renderTimer;
renderTimer = function() {
  _origRenderTimer();
  if (timerRemaining === 5 || timerRemaining === 10 || timerRemaining === 15) {
    playSound('timer');
  }
};

// Surcharger handleCellClick pour le son forbidden
const _origHandleCellClick = handleCellClick;
handleCellClick = function(idx) {
  if (!gameOver && !isAnimating && !isValidMove(currentPlayer, idx)) {
    playSound('forbidden');
  }
  _origHandleCellClick(idx);
};

// Initialiser le bouton son au chargement
window.addEventListener('DOMContentLoaded', injectSoundButton);
