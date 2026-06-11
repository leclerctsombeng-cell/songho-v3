/**
 * ============================================================
 * SONGO — Serveur Node.js (Express + WebSocket)
 * Fichier : server.js
 *
 * Auteur   : Tsombeng Geraldis Leclerc
 * Matricule: 23U2976
 * Université de Yaoundé 1
 *
 * Architecture :
 *   - Express sert les fichiers statiques (HTML/CSS/JS)
 *   - WebSocket (ws) gère les salles de jeu en temps réel
 *   - Les salles sont stockées en mémoire (Map)
 *
 * Déploiement Render :
 *   - Type : Web Service
 *   - Build Command : npm install
 *   - Start Command : node server.js
 *   - Port : 10000 (Render utilise la variable PORT)
 * ============================================================
 */

const express   = require('express');
const http      = require('http');
const WebSocket = require('ws');
const path      = require('path');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

const PORT = process.env.PORT || 10000;

// ── Servir les fichiers statiques (HTML, CSS, JS du jeu) ─────
app.use(express.static(path.join(__dirname, 'public')));

// Fallback : index.html pour toute route non trouvée
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Stockage des salles en mémoire ────────────────────────────
/**
 * Structure d'une salle :
 * {
 *   code       : string       code à 4 lettres
 *   hostName   : string       nom du joueur NORD
 *   guestName  : string|null  nom du joueur SUD
 *   status     : 'waiting' | 'playing' | 'finished'
 *   board      : number[]     état du plateau (14 cases)
 *   scores     : [number, number]
 *   currentPlayer : 0 | 1
 *   gameOver   : boolean
 *   lastMove   : object|null  dernier coup joué
 *   clients    : { 0: WebSocket|null, 1: WebSocket|null }
 *   createdAt  : number
 * }
 */
const rooms = new Map();

// Nettoyage des salles inactives toutes les 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.createdAt > 30 * 60 * 1000) {
      rooms.delete(code);
      console.log(`Salle ${code} supprimée (expirée)`);
    }
  }
}, 5 * 60 * 1000);

// ── Logique du jeu (portée côté serveur depuis engine.js) ─────
// On réimplémente les fonctions essentielles directement ici
// pour ne pas dépendre du DOM (engine.js utilise module.exports)

function getPlayerRow(p)    { return p === 0 ? [0,1,2,3,4,5,6] : [13,12,11,10,9,8,7]; }
function getOpponentCase1(p){ return p === 0 ? 13 : 0; }
function getPlayerCase7(p)  { return p === 0 ? 6  : 7; }

function sowingOrder(startCell, player, seeds) {
  const seq = player === 0
    ? [6,5,4,3,2,1,0, 7,8,9,10,11,12,13]
    : [7,8,9,10,11,12,13, 6,5,4,3,2,1,0];
  const startIdx = seq.indexOf(startCell);
  const order = [];
  for (let i = 1; i <= seeds; i++) {
    let idx = (startIdx + i) % seq.length;
    if (seq[idx] === startCell) { i++; idx = (startIdx + i) % seq.length; }
    order.push(seq[idx]);
  }
  return order;
}

function opponentEmpty(board, player) {
  return getPlayerRow(1 - player).every(i => board[i] === 0);
}

function isValidMove(board, scores, player, cellIdx) {
  const myRow = getPlayerRow(player);
  if (!myRow.includes(cellIdx) || board[cellIdx] === 0) return false;
  if (opponentEmpty(board, player)) {
    const seeds = board[cellIdx];
    const order = sowingOrder(cellIdx, player, seeds);
    const oppRow = getPlayerRow(1 - player);
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

function applyMove(board, scores, player, cellIdx) {
  const seeds = board[cellIdx];
  board[cellIdx] = 0;
  const order = sowingOrder(cellIdx, player, seeds);
  order.forEach(i => board[i]++);

  const lastCell = order[order.length - 1];
  const oppRow   = getPlayerRow(1 - player);
  const oppCase1 = getOpponentCase1(player);
  const case7    = getPlayerCase7(player);

  // Règle case 7
  if (cellIdx === case7 && seeds <= 2) {
    const inOpp = order.filter(i => oppRow.includes(i));
    if (inOpp.length > 0) {
      scores[1 - player] += inOpp.length;
      inOpp.forEach(i => board[i]--);
    }
    return { captured: [] };
  }

  const oppTotal = oppRow.reduce((s, i) => s + board[i], 0);
  if (oppTotal === 0) return { captured: [] };

  // Captures en chaîne
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
  return { captured };
}

function checkEnd(board, scores, currentPlayer) {
  if (scores[0] >= 40 || scores[1] >= 40) return true;
  const total = board.reduce((s, v) => s + v, 0);
  if (total < 10) {
    getPlayerRow(0).forEach(i => { scores[0] += board[i]; board[i] = 0; });
    getPlayerRow(1).forEach(i => { scores[1] += board[i]; board[i] = 0; });
    return true;
  }
  const validMoves = getPlayerRow(currentPlayer).filter(i =>
    board[i] > 0 && isValidMove(board, scores, currentPlayer, i)
  );
  if (validMoves.length === 0) {
    getPlayerRow(0).forEach(i => { scores[0] += board[i]; board[i] = 0; });
    getPlayerRow(1).forEach(i => { scores[1] += board[i]; board[i] = 0; });
    return true;
  }
  return false;
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 4 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join('');
  } while (rooms.has(code));
  return code;
}

function sendTo(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcastRoom(room, data) {
  sendTo(room.clients[0], data);
  sendTo(room.clients[1], data);
}

// ── Gestion WebSocket ─────────────────────────────────────────
wss.on('connection', (ws) => {
  let playerRole = null;  // 0 ou 1
  let roomCode   = null;

  console.log('Nouvelle connexion WebSocket');

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {

      // ── Créer une salle ──────────────────────────────────
      case 'create': {
        const code = generateCode();
        const room = {
          code,
          hostName   : msg.name || 'Hôte',
          guestName  : null,
          status     : 'waiting',
          board      : new Array(14).fill(5),
          scores     : [0, 0],
          currentPlayer: 1,
          gameOver   : false,
          lastMove   : null,
          clients    : { 0: ws, 1: null },
          createdAt  : Date.now(),
        };
        rooms.set(code, room);
        playerRole = 0;
        roomCode   = code;

        sendTo(ws, { type: 'created', code, player: 0, hostName: room.hostName });
        console.log(`Salle créée : ${code} par ${room.hostName}`);
        break;
      }

      // ── Rejoindre une salle ──────────────────────────────
      case 'join': {
        const code = (msg.code || '').toUpperCase();
        const room = rooms.get(code);

        if (!room) {
          sendTo(ws, { type: 'error', message: 'Salle introuvable. Vérifiez le code.' });
          return;
        }
        if (room.status !== 'waiting') {
          sendTo(ws, { type: 'error', message: 'Salle pleine ou partie déjà en cours.' });
          return;
        }

        room.guestName = msg.name || 'Invité';
        room.status    = 'playing';
        room.clients[1] = ws;
        playerRole = 1;
        roomCode   = code;

        // Confirmer à l'invité
        sendTo(ws, {
          type: 'joined', code, player: 1,
          hostName: room.hostName, guestName: room.guestName,
          board: room.board, scores: room.scores,
          currentPlayer: room.currentPlayer,
        });

        // Notifier l'hôte que l'invité a rejoint
        sendTo(room.clients[0], {
          type: 'opponent_joined',
          guestName: room.guestName,
          board: room.board, scores: room.scores,
          currentPlayer: room.currentPlayer,
        });

        console.log(`${room.guestName} a rejoint la salle ${code}`);
        break;
      }

      // ── Jouer un coup ────────────────────────────────────
      case 'move': {
        const room = rooms.get(roomCode);
        if (!room || room.gameOver) return;
        if (room.currentPlayer !== playerRole) {
          sendTo(ws, { type: 'error', message: "Ce n'est pas votre tour." });
          return;
        }
        if (!isValidMove(room.board, room.scores, playerRole, msg.cellIdx)) {
          sendTo(ws, { type: 'error', message: 'Coup invalide.' });
          return;
        }

        const { captured } = applyMove(room.board, room.scores, playerRole, msg.cellIdx);
        const ended = checkEnd(room.board, room.scores, 1 - playerRole);

        if (!ended) room.currentPlayer = 1 - playerRole;
        else        room.gameOver = true;

        room.lastMove = { player: playerRole, cellIdx: msg.cellIdx, captured };

        const update = {
          type: 'update',
          board        : [...room.board],
          scores       : [...room.scores],
          currentPlayer: room.currentPlayer,
          gameOver     : room.gameOver,
          lastMove     : room.lastMove,
        };

        broadcastRoom(room, update);
        console.log(`Coup joué dans ${roomCode} par joueur ${playerRole}`);
        break;
      }

      // ── Message de chat ──────────────────────────────────
      case 'chat': {
        const room = rooms.get(roomCode);
        if (!room) return;
        const names = [room.hostName, room.guestName];
        broadcastRoom(room, {
          type   : 'chat',
          from   : names[playerRole] || 'Joueur',
          message: (msg.message || '').slice(0, 200),
        });
        break;
      }

      // ── Quitter ──────────────────────────────────────────
      case 'leave': {
        const room = rooms.get(roomCode);
        if (room) {
          broadcastRoom(room, {
            type   : 'opponent_left',
            message: `${playerRole === 0 ? room.hostName : room.guestName} a quitté la partie.`,
          });
          rooms.delete(roomCode);
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room) return;
    room.clients[playerRole] = null;
    const other = room.clients[1 - playerRole];
    if (other) {
      sendTo(other, {
        type   : 'opponent_left',
        message: 'Votre adversaire s\'est déconnecté.',
      });
    }
    // Supprimer la salle si les deux clients sont partis
    if (!room.clients[0] && !room.clients[1]) {
      rooms.delete(roomCode);
      console.log(`Salle ${roomCode} supprimée (vide)`);
    }
  });

  ws.on('error', (err) => console.error('WS error:', err.message));
});

server.listen(PORT, () => {
  console.log(`Serveur Songo démarré sur le port ${PORT}`);
});
