/**
 * ============================================================
 * SONGO – Mode 2 Joueurs Local — Gameplay étendu
 * Fichier : local.js
 *
 * Auteur   : Tsombeng Geraldis Leclerc
 * Matricule: 23U2976
 * Université de Yaoundé 1
 * ============================================================
 *
 * NOUVELLES FONCTIONNALITÉS GAMEPLAY
 * ───────────────────────────────────
 * 1. MINUTEUR PAR TOUR
 *    - Configurable : Aucun / 30s / 60s / 90s
 *    - 3 états visuels : normal (or) → warning (≤15s) → danger (≤5s)
 *    - Quand le temps s'épuise : le joueur perd son tour (passe automatiquement)
 *    - Flash rouge "Temps écoulé !" affiché brièvement
 *
 * 2. HISTORIQUE DES COUPS
 *    - Chaque coup est enregistré : joueur, numéro de case, graines, captures
 *    - Panneau coulissant accessible via bouton 📋
 *    - Réinitialisation à chaque manche
 *    - Badge de comptage sur le bouton
 *
 * 3. SYSTÈME DE MANCHES (BEST OF N)
 *    - Formats : Partie unique / Best of 3 / Best of 5
 *    - Après chaque manche : modal intermédiaire avec score du match
 *    - Étoiles ★ dans le scoreboard pour visualiser les victoires
 *    - Le match se termine quand un joueur atteint (N+1)/2 victoires
 *    - Modal final de match avec statistiques
 *
 * Règles Songo (engine.js) :
 *   Plateau 14 cases, 5 graines/case, SUD commence
 *   Semis droite→gauche (soi) puis gauche→droite (adversaire)
 *   Captures : 2–4 graines, chaîne, solidarité, case7, interdits
 *   Fin : score ≥40, plateau <10, aucun coup valide
 * ============================================================
 */

// ─── Engine partagé ───────────────────────────────────────────────────────────
const engine = new SongoEngine();

// ─── Configuration de match (lue depuis l'écran de config) ───────────────────
let cfg = {
  timerSec : 60,   // 0 = désactivé
  matchBest: 1,    // 1 | 3 | 5
};

// ─── État du match ────────────────────────────────────────────────────────────
let matchWins    = [0, 0];   // victoires par joueur sur l'ensemble du match
let currentRound = 1;        // numéro de manche actuelle
let winsNeeded   = 1;        // victoires nécessaires pour gagner le match

// ─── État de la manche ────────────────────────────────────────────────────────
let isAnimating  = false;

// ─── Minuteur ─────────────────────────────────────────────────────────────────
let timerInterval  = null;   // setInterval du compte à rebours
let timerRemaining = 0;      // secondes restantes
let timerActive    = false;  // est-ce que le minuteur tourne ?

// ─── Historique des coups ─────────────────────────────────────────────────────
let moveHistory = [];        // tableau d'objets { round, player, caseNum, seeds, captured, timeout }

// ─── Sélection de configuration dans l'écran de config ───────────────────────
/**
 * Appelé depuis les boutons de configuration (HTML inline onclick).
 * @param {string} group  'timer' | 'match'
 * @param {string} val    valeur choisie (string)
 * @param {HTMLElement} btn  bouton cliqué
 */
function selCfg(group, val, btn) {
  // Désactiver tous les boutons du groupe
  const parent = btn.closest('.config-options');
  parent.querySelectorAll('.config-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  if (group === 'timer') cfg.timerSec  = parseInt(val, 10);
  if (group === 'match') cfg.matchBest = parseInt(val, 10);
}

// ─── Initialisation du match ──────────────────────────────────────────────────
/**
 * Lance le match depuis l'écran de configuration.
 * Calcule le nombre de victoires nécessaires et démarre la 1re manche.
 */
function initMatch() {
  winsNeeded   = Math.ceil(cfg.matchBest / 2);  // ex: best of 3 → 2 victoires
  matchWins    = [0, 0];
  currentRound = 1;

  showScreen('screen-game');
  updateMatchUI();
  startRound();
}

// ─── Démarrage d'une manche ───────────────────────────────────────────────────
function startRound() {
  engine.reset();     // remet les 14 cases à 5 graines
  isAnimating  = false;
  moveHistory  = [];  // historique vidé pour chaque manche

  closeAllModals();
  renderBoard();
  updateScores();
  highlightActivePlayer();
  updateHistoryPanel();
  updateRoundBadge();
  setStatus('Tour du Joueur SUD', true);

  // Réinitialiser et démarrer le minuteur
  stopTimer();
  if (cfg.timerSec > 0) startTimer();

  // Afficher l'écran relais pour SUD (qui commence)
  showRelay(1);
}

// Alias pour le bouton "Recommencer" → recommence le match depuis le début
function replayMatch() {
  matchWins    = [0, 0];
  currentRound = 1;
  moveHistory  = [];
  closeAllModals();
  updateMatchUI();
  startRound();
}

function confirmRestart() {
  if (confirm('Recommencer le match depuis le début ?')) replayMatch();
}

function confirmLeave() {
  stopTimer();
  if (confirm('Quitter la partie ?')) window.location.href = 'index.html';
}

// ─── Gestion des écrans ───────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.style.display = 'none';
  });
  const t = document.getElementById(id);
  t.style.display = 'flex';
  t.classList.add('active');
}

// ─── Écran relais ─────────────────────────────────────────────────────────────
function showRelay(nextPlayer) {
  stopTimer();   // pause du minuteur pendant le relais

  const names = ['NORD', 'SUD'];
  const icons = ['🔵', '🟡'];
  document.getElementById('relay-icon').textContent        = icons[nextPlayer];
  document.getElementById('relay-player-name').textContent = `Joueur ${names[nextPlayer]}`;
  document.getElementById('relay-score-0').textContent     = engine.scores[0];
  document.getElementById('relay-score-1').textContent     = engine.scores[1];

  // Afficher les victoires du match si best-of actif
  const winsDiv = document.getElementById('relay-wins');
  if (cfg.matchBest > 1) {
    winsDiv.style.display = 'flex';
    document.getElementById('relay-wins-0').textContent = matchWins[0];
    document.getElementById('relay-wins-1').textContent = matchWins[1];
  } else {
    winsDiv.style.display = 'none';
  }

  document.getElementById('relay-screen').classList.remove('hidden');
}

function dismissRelay() {
  document.getElementById('relay-screen').classList.add('hidden');
  // Reprendre le minuteur après le relais
  if (cfg.timerSec > 0 && !engine.gameOver) startTimer();
}

// ═══════════════════════════════════════════════════════════════════════════════
// FONCTIONNALITÉ 1 — MINUTEUR PAR TOUR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Démarre le compte à rebours pour le joueur actif.
 * À zéro : appel automatique de onTimerExpired().
 */
function startTimer() {
  if (cfg.timerSec === 0) return;
  stopTimer();

  timerRemaining = cfg.timerSec;
  timerActive    = true;
  renderTimer();

  timerInterval = setInterval(() => {
    timerRemaining--;
    renderTimer();
    if (timerRemaining <= 0) {
      stopTimer();
      onTimerExpired();
    }
  }, 1000);
}

/** Arrête le minuteur sans déclencher l'expiration */
function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  timerActive   = false;
}

/** Met à jour l'affichage du minuteur */
function renderTimer() {
  const widget  = document.getElementById('timer-widget');
  const display = document.getElementById('timer-display');

  if (cfg.timerSec === 0) {
    display.textContent = '—';
    widget.className    = 'timer-widget';
    return;
  }

  const sec = timerRemaining;
  display.textContent = sec + 's';

  // États visuels selon le temps restant
  if (sec <= 5) {
    widget.className = 'timer-widget danger';
  } else if (sec <= 15) {
    widget.className = 'timer-widget warning';
  } else {
    widget.className = 'timer-widget';
  }
}

/**
 * Appelé quand le temps s'épuise.
 * Le joueur perd son tour : enregistrement dans l'historique + passage automatique.
 */
async function onTimerExpired() {
  if (engine.gameOver || isAnimating) return;
  isAnimating = true;

  const expiredPlayer = engine.currentPlayer;
  const names = ['NORD', 'SUD'];

  // Enregistrer dans l'historique
  moveHistory.push({
    round   : currentRound,
    player  : expiredPlayer,
    caseNum : null,
    seeds   : null,
    captured: [],
    timeout : true,
  });
  updateHistoryPanel();

  // Flash bannière rouge
  showFlashBanner(`⏰ Temps écoulé ! Joueur ${names[expiredPlayer]} passe son tour.`);

  setStatus(`⏰ Temps écoulé — tour passé !`, false);
  await pause(1800);

  // Passer au joueur suivant
  engine.currentPlayer = 1 - expiredPlayer;
  isAnimating = false;
  renderBoard();
  highlightActivePlayer();
  setStatus(`Tour du Joueur ${names[engine.currentPlayer]}`, true);

  startTimer();
  await pause(300);
  showRelay(engine.currentPlayer);
}

// ═══════════════════════════════════════════════════════════════════════════════
// FONCTIONNALITÉ 2 — HISTORIQUE DES COUPS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Ajoute un coup dans l'historique et rafraîchit le panneau.
 * @param {number} player    0=NORD, 1=SUD
 * @param {number} cellIdx   indice dans engine.board
 * @param {number} seeds     graines semées
 * @param {number[]} captured cases capturées
 */
function recordMove(player, cellIdx, seeds, captured) {
  // Numéro de case affiché (1–7) selon la perspective du joueur
  const caseNum = player === 0 ? cellIdx + 1 : 14 - cellIdx;

  moveHistory.push({
    round   : currentRound,
    player,
    caseNum,
    seeds,
    captured: [...captured],
    timeout : false,
  });
  updateHistoryPanel();
}

/** Reconstruit l'affichage du panneau historique */
function updateHistoryPanel() {
  const list  = document.getElementById('history-list');
  const count = document.getElementById('history-count');
  const names = ['NORD', 'SUD'];

  if (moveHistory.length === 0) {
    list.innerHTML = '<div class="history-empty">Aucun coup joué</div>';
    count.textContent = '0';
    count.classList.add('hidden');
    return;
  }

  count.textContent = moveHistory.length;
  count.classList.remove('hidden');

  list.innerHTML = '';
  // Afficher les coups du plus récent au plus ancien
  [...moveHistory].reverse().forEach((move, i) => {
    const realIdx = moveHistory.length - i;
    const div   = document.createElement('div');
    div.className = `history-item ${move.player === 0 ? 'north' : 'south'}`;

    const numSpan    = document.createElement('span');
    numSpan.className = 'history-num';
    numSpan.textContent = realIdx + '.';

    const playerSpan = document.createElement('span');
    playerSpan.className = 'history-player';
    playerSpan.textContent = names[move.player];

    const detail = document.createElement('div');
    detail.className = 'history-detail';

    if (move.timeout) {
      detail.innerHTML = `<span class="history-timeout">⏰ Temps écoulé – tour passé</span>`;
    } else {
      let html = `Case ${move.caseNum} · ${move.seeds} graine${move.seeds > 1 ? 's' : ''}`;
      if (move.captured.length > 0) {
        html += `<br><span class="history-capture">🟢 +${move.captured.length} case(s) capturée(s)</span>`;
      }
      detail.innerHTML = html;
    }

    div.appendChild(numSpan);
    div.appendChild(playerSpan);
    div.appendChild(detail);
    list.appendChild(div);
  });
}

function toggleHistory() {
  const panel   = document.getElementById('history-panel');
  const overlay = document.getElementById('history-overlay');
  panel.classList.toggle('open');
  overlay.classList.toggle('visible');
}

function closeHistory() {
  document.getElementById('history-panel').classList.remove('open');
  document.getElementById('history-overlay').classList.remove('visible');
}

// ═══════════════════════════════════════════════════════════════════════════════
// FONCTIONNALITÉ 3 — SYSTÈME DE MANCHES (BEST OF N)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Appelé quand la manche se termine.
 * Identifie le vainqueur, met à jour les victoires du match,
 * puis affiche soit le modal de manche, soit le modal de match.
 */
function onRoundEnd() {
  const [s0, s1] = engine.scores;
  let roundWinner = null;   // 0 | 1 | null (égalité)

  if (s0 > s1) roundWinner = 0;
  else if (s1 > s0) roundWinner = 1;
  // égalité → roundWinner reste null (personne ne gagne de victoire)

  if (roundWinner !== null) matchWins[roundWinner]++;

  updateMatchUI();

  // Vérifier si le match est gagné
  if (matchWins[0] >= winsNeeded || matchWins[1] >= winsNeeded) {
    showMatchEnd();
  } else {
    showRoundModal(roundWinner, s0, s1);
  }
}

/**
 * Affiche le modal intermédiaire de fin de manche.
 * @param {number|null} winner 0=NORD, 1=SUD, null=égalité
 * @param {number} s0  score NORD cette manche
 * @param {number} s1  score SUD cette manche
 */
function showRoundModal(winner, s0, s1) {
  const names = ['NORD', 'SUD'];
  let icon, title, desc;

  if (winner === null) {
    icon = '🤝'; title = 'Égalité !';
    desc = `Les deux joueurs terminent avec ${s0} graines. Personne ne gagne de point.`;
  } else {
    icon = '🏅'; title = `Joueur ${names[winner]} remporte la manche !`;
    desc = `Score : NORD ${s0} – SUD ${s1}`;
  }

  document.getElementById('round-icon').textContent  = icon;
  document.getElementById('round-title').textContent = title;
  document.getElementById('round-desc').textContent  = desc;
  document.getElementById('round-wins-north').textContent = matchWins[0];
  document.getElementById('round-wins-south').textContent = matchWins[1];

  // Étoiles de progression vers la victoire du match
  const starsDiv = document.getElementById('round-stars');
  starsDiv.innerHTML = '';
  for (let p = 0; p < 2; p++) {
    for (let w = 0; w < winsNeeded; w++) {
      const s = document.createElement('span');
      s.className = 'round-star' + (w < matchWins[p] ? ' filled' : '');
      s.textContent = p === 0 ? '🔵' : '🟡';
      starsDiv.appendChild(s);
    }
    if (p === 0) {
      const sep = document.createElement('span');
      sep.textContent = '  ';
      starsDiv.appendChild(sep);
    }
  }

  // Libellé du bouton
  document.getElementById('btn-next-round').textContent =
    `▶ Manche ${currentRound + 1}`;

  document.getElementById('modal-round').classList.remove('hidden');
}

/** Passe à la manche suivante */
function nextRound() {
  currentRound++;
  moveHistory = [];   // réinitialiser l'historique pour la nouvelle manche
  document.getElementById('modal-round').classList.add('hidden');
  startRound();
}

/** Affiche le modal de fin de match (victoire définitive) */
function showMatchEnd() {
  const matchWinner = matchWins[0] >= winsNeeded ? 0 : 1;
  const names = ['NORD', 'SUD'];

  document.getElementById('modal-icon').textContent  = '🏆';
  document.getElementById('modal-title').textContent = `Joueur ${names[matchWinner]} gagne le match !`;
  document.getElementById('modal-desc').textContent  =
    `Victoires : NORD ${matchWins[0]} – SUD ${matchWins[1]}` +
    (cfg.matchBest > 1 ? ` (Best of ${cfg.matchBest})` : '');
  document.getElementById('modal-score-north').textContent = matchWins[0];
  document.getElementById('modal-score-south').textContent = matchWins[1];

  document.getElementById('modal-endgame').classList.remove('hidden');
}

// ─── Mise à jour de l'UI du match ────────────────────────────────────────────
function updateMatchUI() {
  // Badge de score du match (centre du scoreboard)
  const matchInfo = document.getElementById('match-info');
  const badge     = document.getElementById('match-score-badge');
  if (cfg.matchBest > 1) {
    matchInfo.style.display = 'flex';
    badge.textContent = `${matchWins[0]} – ${matchWins[1]}`;
  } else {
    matchInfo.style.display = 'none';
  }

  // Étoiles NORD
  renderStars('stars-north', matchWins[0], winsNeeded, '🔵');
  // Étoiles SUD
  renderStars('stars-south', matchWins[1], winsNeeded, '🟡');
}

/**
 * Affiche les étoiles de victoires pour un joueur.
 * @param {string} containerId  id du div parent
 * @param {number} won          victoires acquises
 * @param {number} needed       victoires nécessaires
 * @param {string} emoji        emoji de l'étoile
 */
function renderStars(containerId, won, needed, emoji) {
  const div = document.getElementById(containerId);
  div.innerHTML = '';
  if (needed <= 1) return;   // pas d'étoiles pour partie unique
  for (let i = 0; i < needed; i++) {
    const s = document.createElement('span');
    s.className = 'win-star' + (i < won ? ' filled' : '');
    s.textContent = emoji;
    div.appendChild(s);
  }
}

function updateRoundBadge() {
  const badge = document.getElementById('round-badge');
  badge.textContent = cfg.matchBest > 1
    ? `Manche ${currentRound} / Best of ${cfg.matchBest}`
    : 'Partie unique';
}

// ─── Rendu du plateau ─────────────────────────────────────────────────────────
function renderBoard() {
  renderRow('row-north', [0,1,2,3,4,5,6], 0);
  renderRow('row-south', [7,8,9,10,11,12,13], 1);
}

function renderRow(rowId, indices, player) {
  const row = document.getElementById(rowId);
  row.innerHTML = '';
  indices.forEach(idx => row.appendChild(buildCell(idx, player)));
}

function buildCell(idx, player) {
  const count = engine.board[idx];
  const div   = document.createElement('div');
  div.className = 'cell';
  div.id = `cell-${idx}`;

  // Nombre de graines
  const numSpan = document.createElement('span');
  numSpan.className   = 'cell-seeds';
  numSpan.textContent = count;
  div.appendChild(numSpan);

  // Points visuels (≤10)
  if (count > 0 && count <= 10) {
    const dotsDiv = document.createElement('div');
    dotsDiv.className = 'cell-dots';
    for (let d = 0; d < count; d++) {
      const dot = document.createElement('div');
      dot.className = 'seed-dot';
      dotsDiv.appendChild(dot);
    }
    div.appendChild(dotsDiv);
  }

  // Numéro de case (1–7 selon la perspective)
  const caseNum = player === 0 ? idx + 1 : 14 - idx;
  const label   = document.createElement('span');
  label.className   = 'cell-num';
  label.textContent = caseNum;
  div.appendChild(label);

  // Interactivité
  const isCurrentPlayer = engine.currentPlayer === player;
  const canClick = !engine.gameOver && !isAnimating
                   && isCurrentPlayer
                   && count > 0
                   && engine.isValidMove(player, idx);
  if (canClick) {
    div.addEventListener('click', () => handleCellClick(idx));
  } else {
    div.classList.add('disabled');
  }
  return div;
}

// ─── Gestion du clic ─────────────────────────────────────────────────────────
function handleCellClick(idx) {
  if (engine.gameOver || isAnimating) return;
  if (!engine.isValidMove(engine.currentPlayer, idx)) {
    const cell = document.getElementById(`cell-${idx}`);
    if (cell) {
      cell.classList.add('forbidden');
      setTimeout(() => cell.classList.remove('forbidden'), 400);
    }
    setStatus('⚠ Coup interdit !', false);
    setTimeout(() => setStatus(`Tour du Joueur ${engine.currentPlayer === 0 ? 'NORD' : 'SUD'}`, true), 1000);
    return;
  }
  playTurn(engine.currentPlayer, idx);
}

// ─── Déroulement d'un tour ────────────────────────────────────────────────────
async function playTurn(player, cellIdx) {
  isAnimating = true;
  stopTimer();   // stopper le minuteur pendant l'animation

  const seedCount = engine.board[cellIdx];   // sauvegarder avant le move

  // Sélection visuelle
  const selCell = document.getElementById(`cell-${cellIdx}`);
  if (selCell) selCell.classList.add('selected');
  await pause(280);

  // Exécuter le coup
  const { captured } = engine.applyMove(player, cellIdx);
  if (selCell) selCell.classList.remove('selected');

  // Enregistrer dans l'historique (FONCTIONNALITÉ 2)
  recordMove(player, cellIdx, seedCount, captured);

  // Rafraîchir
  renderBoard();
  updateScores();

  // Animer les captures
  if (captured.length > 0) {
    captured.forEach(i => {
      const c = document.getElementById(`cell-${i}`);
      if (c) c.classList.add('captured');
    });
    setStatus(`🟢 ${captured.length} case(s) capturée(s) !`, false);
    await pause(750);
    captured.forEach(i => {
      const c = document.getElementById(`cell-${i}`);
      if (c) c.classList.remove('captured');
    });
  }

  updateScores();

  // Vérifier fin de manche
  if (engine.checkEnd()) {
    renderBoard();
    updateScores();
    isAnimating = false;
    await pause(400);
    onRoundEnd();   // FONCTIONNALITÉ 3 — gestion de manche
    return;
  }

  // Passer au joueur suivant
  engine.currentPlayer = 1 - player;
  isAnimating = false;
  renderBoard();
  highlightActivePlayer();

  const nextName = engine.currentPlayer === 0 ? 'NORD' : 'SUD';
  setStatus(`Tour du Joueur ${nextName}`, true);

  await pause(300);
  showRelay(engine.currentPlayer);   // relais → startTimer() reprend dans dismissRelay()
}

// ─── Utilitaires UI ───────────────────────────────────────────────────────────
function updateScores() {
  document.getElementById('score-north-val').textContent = engine.scores[0];
  document.getElementById('score-south-val').textContent = engine.scores[1];
}

function highlightActivePlayer() {
  document.getElementById('score-north')
    .classList.toggle('active-player', engine.currentPlayer === 0);
  document.getElementById('score-south')
    .classList.toggle('active-player', engine.currentPlayer === 1);
}

function setStatus(msg, showTurn) {
  document.getElementById('status-message').textContent = msg;
  const ti = document.getElementById('turn-indicator');
  if (showTurn) {
    ti.textContent = engine.currentPlayer === 0 ? '↑ NORD' : '↓ SUD';
    ti.classList.add('visible');
  } else {
    ti.classList.remove('visible');
  }
}

function closeAllModals() {
  document.getElementById('modal-endgame').classList.add('hidden');
  document.getElementById('modal-round').classList.add('hidden');
}

/** Flash banner temporaire (timeout, etc.) */
function showFlashBanner(msg) {
  const old = document.querySelector('.flash-banner');
  if (old) old.remove();
  const banner = document.createElement('div');
  banner.className   = 'flash-banner';
  banner.textContent = msg;
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 2200);
}

function pause(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Footer étudiant ──────────────────────────────────────────────────────────
function injectFooter() {
  if (document.getElementById('songo-footer')) return;
  const footer = document.createElement('footer');
  footer.id = 'songo-footer';
  footer.innerHTML = `
    <div class="footer-inner">
      <span class="footer-sep">◈</span>
      <span class="footer-text">
        Tsombeng Geraldis Leclerc &nbsp;·&nbsp; Matricule 23U2976
        &nbsp;·&nbsp; Université de Yaoundé 1
      </span>
      <span class="footer-sep">◈</span>
    </div>
  `;
  document.body.appendChild(footer);
}

// ─── Point d'entrée ───────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  injectFooter();
  // L'écran de config est déjà visible (class "active" dans le HTML)
  // L'utilisateur clique "Lancer la partie" → initMatch()
});
