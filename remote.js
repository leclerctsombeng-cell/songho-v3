/**
 * SONGO – Mode En Ligne via WebSocket
 * Auteur : Tsombeng Geraldis Leclerc – Matricule 23U2976 – Université de Yaoundé 1
 *
 * Communication :
 *   Client → Serveur : create | join | move | chat | leave
 *   Serveur → Client : created | joined | opponent_joined | update | chat | opponent_left | error
 */

let ws         = null;
let myName     = '';
let myPlayer   = null;   // 0=NORD, 1=SUD
let roomCode   = '';
let isAnimating = false;
let gameBoard  = new Array(14).fill(5);
let gameScores = [0, 0];
let currentPlayer = 1;
let gameOver   = false;
let hostName   = 'NORD';
let guestName  = 'SUD';

// ── Connexion WebSocket ───────────────────────────────────────
function connectWS(onOpen) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const url   = `${proto}://${location.host}`;
  ws = new WebSocket(url);

  ws.onopen = () => {
    setConnStatus('connected');
    onOpen();
  };

  ws.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }
    handleMessage(msg);
  };

  ws.onclose = () => {
    setConnStatus('error');
    if (!gameOver) setStatus('⚠ Connexion perdue. Rechargez la page.', false);
  };

  ws.onerror = () => setConnStatus('error');
}

function sendWS(data) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

// ── Gestion des messages serveur ──────────────────────────────
function handleMessage(msg) {
  switch (msg.type) {

    case 'created':
      roomCode  = msg.code;
      myPlayer  = 0;
      hostName  = msg.hostName;
      document.getElementById('display-code').textContent = msg.code;
      showScreen('screen-waiting');
      break;

    case 'opponent_joined':
      guestName = msg.guestName;
      startOnlineGame(msg);
      break;

    case 'joined':
      roomCode  = msg.code;
      myPlayer  = 1;
      hostName  = msg.hostName;
      guestName = msg.guestName;
      startOnlineGame(msg);
      break;

    case 'update':
      gameBoard     = msg.board;
      gameScores    = msg.scores;
      currentPlayer = msg.currentPlayer;
      gameOver      = msg.gameOver;
      animateUpdate(msg.lastMove);
      break;

    case 'chat':
      addChatMessage(msg.from, msg.message);
      break;

    case 'opponent_left':
      setStatus(`⚠ ${msg.message}`, false);
      setConnStatus('error');
      break;

    case 'error':
      alert('Erreur : ' + msg.message);
      break;
  }
}

// ── Lobby ─────────────────────────────────────────────────────
function createRoom() {
  myName = (document.getElementById('input-name').value.trim() || 'Hôte');
  connectWS(() => sendWS({ type: 'create', name: myName }));
}

function joinRoom() {
  myName   = (document.getElementById('input-name').value.trim() || 'Invité');
  const code = document.getElementById('input-code').value.trim().toUpperCase();
  if (code.length < 2) { alert('Entrez un code valide.'); return; }
  connectWS(() => sendWS({ type: 'join', code, name: myName }));
}

function cancelRoom() {
  if (ws) ws.close();
  showScreen('screen-lobby');
}

function confirmLeave() {
  if (confirm('Quitter la partie ?')) {
    sendWS({ type: 'leave' });
    window.location.href = 'index.html';
  }
}

// ── Démarrage du jeu ──────────────────────────────────────────
function startOnlineGame(data) {
  gameBoard     = data.board     || new Array(14).fill(5);
  gameScores    = data.scores    || [0, 0];
  currentPlayer = data.currentPlayer !== undefined ? data.currentPlayer : 1;
  gameOver      = false;

  document.getElementById('label-north').textContent = hostName;
  document.getElementById('label-south').textContent = guestName;
  document.getElementById('modal-label-north').textContent = hostName;
  document.getElementById('modal-label-south').textContent = guestName;

  showScreen('screen-game');
  renderBoard();
  updateScores();
  updateTurnUI();
  setConnStatus('connected');
  injectFooter();
}

// ── Coup ──────────────────────────────────────────────────────
function handleCellClick(idx) {
  if (gameOver || isAnimating) return;
  if (currentPlayer !== myPlayer) {
    setStatus("⏳ Ce n'est pas votre tour.", false);
    return;
  }
  sendWS({ type: 'move', cellIdx: idx });
}

// ── Animation de la mise à jour reçue ─────────────────────────
async function animateUpdate(lastMove) {
  if (lastMove && lastMove.captured && lastMove.captured.length > 0) {
    lastMove.captured.forEach(i => {
      const c = document.getElementById(`cell-${i}`);
      if (c) c.classList.add('captured');
    });
    await pause(700);
    lastMove.captured.forEach(i => {
      const c = document.getElementById(`cell-${i}`);
      if (c) c.classList.remove('captured');
    });
  }
  renderBoard();
  updateScores();
  updateTurnUI();
  if (gameOver) showEndGame();
}

// ── Rendu ─────────────────────────────────────────────────────
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
  const count = gameBoard[idx];
  const div   = document.createElement('div');
  div.className = 'cell'; div.id = `cell-${idx}`;

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
  lbl.className   = 'cell-num';
  lbl.textContent = player === 0 ? idx + 1 : 14 - idx;
  div.appendChild(lbl);

  const isMyTurn = currentPlayer === myPlayer;
  const isMyCell = player === myPlayer;
  const canClick = !gameOver && !isAnimating && isMyTurn && isMyCell && count > 0;
  if (canClick) div.addEventListener('click', () => handleCellClick(idx));
  else div.classList.add('disabled');
  return div;
}

function updateScores() {
  document.getElementById('score-north-val').textContent = gameScores[0];
  document.getElementById('score-south-val').textContent = gameScores[1];
  document.getElementById('score-north').classList.toggle('active-player', currentPlayer === 0);
  document.getElementById('score-south').classList.toggle('active-player', currentPlayer === 1);
}

function updateTurnUI() {
  const names = [hostName, guestName];
  const isMyTurn = currentPlayer === myPlayer;
  setStatus(isMyTurn ? '🟡 À vous de jouer !' : `⏳ ${names[1-myPlayer]} réfléchit…`, true);
}

function setStatus(msg, showTurn) {
  document.getElementById('status-message').textContent = msg;
  const ti = document.getElementById('turn-indicator');
  if (showTurn) { ti.textContent = currentPlayer === 0 ? '↑ NORD' : '↓ SUD'; ti.classList.add('visible'); }
  else ti.classList.remove('visible');
}

function setConnStatus(state) {
  const el = document.getElementById('conn-status');
  if (!el) return;
  const map = {
    connected: ['conn-status',        '🟢 Connecté'],
    waiting:   ['conn-status waiting','🟡 En attente…'],
    error:     ['conn-status error',  '🔴 Déconnecté'],
  };
  el.className   = map[state][0];
  el.textContent = map[state][1];
}

function showEndGame() {
  const [n0, n1] = gameScores;
  const winner = n0 > n1 ? hostName : n1 > n0 ? guestName : null;
  document.getElementById('modal-icon').textContent  = winner ? '🏆' : '🤝';
  document.getElementById('modal-title').textContent = winner ? `${winner} gagne !` : 'Égalité !';
  document.getElementById('modal-desc').textContent  =
    winner ? `${winner} remporte la partie.` : `Les deux joueurs finissent à égalité.`;
  document.getElementById('modal-score-north').textContent = n0;
  document.getElementById('modal-score-south').textContent = n1;
  document.getElementById('modal-endgame').classList.remove('hidden');
}

// ── Chat ──────────────────────────────────────────────────────
function sendChat() {
  const input = document.getElementById('chat-input');
  const msg   = input.value.trim();
  if (!msg) return;
  sendWS({ type: 'chat', message: msg });
  input.value = '';
}

function addChatMessage(from, message) {
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg';
  div.innerHTML = `<span class="chat-from">${from} :</span>${message}`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  // Auto-supprimer après 8s
  setTimeout(() => div.remove(), 8000);
}

// ── Utilitaires ───────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => { s.classList.remove('active'); s.style.display = 'none'; });
  const t = document.getElementById(id);
  t.style.display = 'flex'; t.classList.add('active');
}

function pause(ms) { return new Promise(r => setTimeout(r, ms)); }

function injectFooter() {
  if (document.getElementById('songo-footer')) return;
  const f = document.createElement('footer');
  f.id = 'songo-footer';
  f.innerHTML = `<div class="footer-inner">
    <span class="footer-sep">◈</span>
    <span class="footer-text">Tsombeng Geraldis Leclerc &nbsp;·&nbsp; Matricule 23U2976 &nbsp;·&nbsp; Université de Yaoundé 1</span>
    <span class="footer-sep">◈</span>
  </div>`;
  document.body.appendChild(f);
}

window.addEventListener('DOMContentLoaded', injectFooter);
