
/**
 * SONGO ENGINE — Logique partagée entre toutes les versions
 *
 * Plateau : 14 cases
 *   cells[0..6]  = rangée NORD (0=case1 gauche, 6=case7 droite)
 *   cells[7..13] = rangée SUD  (7=case7 gauche, 13=case1 droite)
 * Joueur 0 = NORD, Joueur 1 = SUD
 */

class SongoEngine {
  constructor() {
    this.board = new Array(14).fill(5);
    this.scores = [0, 0];
    this.currentPlayer = 1; // SUD commence
    this.gameOver = false;
  }

  reset() {
    this.board = new Array(14).fill(5);
    this.scores = [0, 0];
    this.currentPlayer = 1;
    this.gameOver = false;
  }

  // Rangée propre au joueur (indices board)
  getPlayerRow(p) {
    return p === 0 ? [0,1,2,3,4,5,6] : [13,12,11,10,9,8,7];
  }

  getOpponentRow(p) {
    return this.getPlayerRow(1 - p);
  }

  // Case 1 de l'adversaire (la plus à gauche du joueur actif)
  getOpponentCase1(p) {
    return p === 0 ? 13 : 0;
  }

  // Case 7 du joueur (la plus à droite)
  getPlayerCase7(p) {
    return p === 0 ? 6 : 7;
  }

  // Séquence de distribution depuis une case donnée
  sowingSequence(player) {
    return player === 0
      ? [6,5,4,3,2,1,0, 7,8,9,10,11,12,13]
      : [7,8,9,10,11,12,13, 6,5,4,3,2,1,0];
  }

  // Ordre de semis à partir d'une case
  getSowOrder(startCell, player, seeds) {
    const seq = this.sowingSequence(player);
    const startIdx = seq.indexOf(startCell);
    const order = [];
    let skip = 0;
    for (let i = 1; i <= seeds + skip; i++) {
      const cell = seq[(startIdx + i) % seq.length];
      if (cell === startCell) { skip++; continue; }
      order.push(cell);
      if (order.length === seeds) break;
    }
    return order;
  }

  opponentEmpty(player) {
    return this.getPlayerRow(1 - player).every(i => this.board[i] === 0);
  }

  boardTotal() {
    return this.board.reduce((s, v) => s + v, 0);
  }

  // Vérifie si le coup est valide (solidarité incluse)
  isValidMove(player, cellIdx) {
    const myRow = this.getPlayerRow(player);
    if (!myRow.includes(cellIdx) || this.board[cellIdx] === 0) return false;

    if (this.opponentEmpty(player)) {
      const seeds = this.board[cellIdx];
      const order = this.getSowOrder(cellIdx, player, seeds);
      const oppRow = this.getPlayerRow(1 - player);
      const toOpp = order.filter(i => oppRow.includes(i)).length;
      const maxToOpp = myRow.reduce((best, c) => {
        if (this.board[c] === 0) return best;
        const o = this.getSowOrder(c, player, this.board[c]);
        return Math.max(best, o.filter(i => oppRow.includes(i)).length);
      }, 0);
      if (maxToOpp >= 7 && toOpp < 7) return false;
      if (maxToOpp < 7 && toOpp < maxToOpp) return false;
    }
    return true;
  }

  getValidMoves(player) {
    return this.getPlayerRow(player).filter(i =>
      this.board[i] > 0 && this.isValidMove(player, i)
    );
  }

  // Exécute un coup et retourne les cases capturées
  applyMove(player, cellIdx) {
    const seeds = this.board[cellIdx];
    this.board[cellIdx] = 0;
    const order = this.getSowOrder(cellIdx, player, seeds);
    const oppRow = this.getPlayerRow(1 - player);
    const oppCase1 = this.getOpponentCase1(player);
    const case7 = this.getPlayerCase7(player);

    // Semis
    order.forEach(i => this.board[i]++);

    // Interdit case 7 : 1 ou 2 graines semées chez l'adversaire
    if (cellIdx === case7 && seeds <= 2) {
      const inOpp = order.filter(i => oppRow.includes(i));
      if (inOpp.length > 0) {
        this.scores[1 - player] += inOpp.length;
        inOpp.forEach(i => this.board[i]--);
      }
      return { order, captured: [] };
    }

    // Interdit : vider camp adverse → pas de prise
    const oppTotal = oppRow.reduce((s, i) => s + this.board[i], 0);
    if (oppTotal === 0) return { order, captured: [] };

    // Captures en chaîne
    const captured = [];
    const lastCell = order[order.length - 1];

    if (oppRow.includes(lastCell) && lastCell !== oppCase1) {
      // Navigation dans la rangée adverse : oppRow = [case1..case7] du point de vue adversaire
      // On remonte vers case1 (index 0 de oppRow)
      let curPos = oppRow.indexOf(lastCell);
      while (curPos >= 0) {
        const cur = oppRow[curPos];
        if (cur === oppCase1) break;
        if (this.board[cur] < 2 || this.board[cur] > 4) break;
        // Ne pas vider complètement
        const wouldEmpty = oppRow.every(i => i === cur || this.board[i] === 0);
        if (wouldEmpty) break;
        captured.push(cur);
        this.scores[player] += this.board[cur];
        this.board[cur] = 0;
        curPos--;
      }
    }

    // Tour complet → capture 1 graine en case1 adverse
    if (lastCell === oppCase1 && seeds >= 14 && this.board[oppCase1] > 0) {
      captured.push(oppCase1);
      this.scores[player] += 1;
      this.board[oppCase1]--;
    }

    return { order, captured };
  }

  // Vérifie et applique les conditions de fin
  checkEnd() {
    if (this.scores[0] >= 40 || this.scores[1] >= 40) {
      this.gameOver = true;
      return true;
    }
    if (this.boardTotal() < 10) {
      this.getPlayerRow(0).forEach(i => { this.scores[0] += this.board[i]; this.board[i] = 0; });
      this.getPlayerRow(1).forEach(i => { this.scores[1] += this.board[i]; this.board[i] = 0; });
      this.gameOver = true;
      return true;
    }
    if (this.getValidMoves(this.currentPlayer).length === 0) {
      this.getPlayerRow(0).forEach(i => { this.scores[0] += this.board[i]; this.board[i] = 0; });
      this.getPlayerRow(1).forEach(i => { this.scores[1] += this.board[i]; this.board[i] = 0; });
      this.gameOver = true;
      return true;
    }
    return false;
  }

  // Minimax pour l'IA
  minimax(player, depth, maximizer, alpha, beta) {
    if (depth === 0 || this.boardTotal() < 10 || this.scores[0] >= 40 || this.scores[1] >= 40) {
      return this.scores[maximizer] - this.scores[1 - maximizer];
    }
    const moves = this.getValidMoves(player);
    if (moves.length === 0) return this.scores[maximizer] - this.scores[1 - maximizer];

    if (player === maximizer) {
      let best = -Infinity;
      for (const m of moves) {
        const sb = [...this.board], ss = [...this.scores];
        this.applyMove(player, m);
        best = Math.max(best, this.minimax(1 - player, depth - 1, maximizer, alpha, beta));
        this.board = sb; this.scores = ss;
        alpha = Math.max(alpha, best);
        if (beta <= alpha) break;
      }
      return best;
    } else {
      let best = Infinity;
      for (const m of moves) {
        const sb = [...this.board], ss = [...this.scores];
        this.applyMove(player, m);
        best = Math.min(best, this.minimax(1 - player, depth - 1, maximizer, alpha, beta));
        this.board = sb; this.scores = ss;
        beta = Math.min(beta, best);
        if (beta <= alpha) break;
      }
      return best;
    }
  }

  pickBestMove(player, depth) {
    const moves = this.getValidMoves(player);
    if (!moves.length) return null;
    let best = moves[0], bestScore = -Infinity;
    for (const m of moves) {
      const sb = [...this.board], ss = [...this.scores];
      this.applyMove(player, m);
      const s = this.minimax(1 - player, depth - 1, player, -Infinity, Infinity);
      this.board = sb; this.scores = ss;
      if (s > bestScore) { bestScore = s; best = m; }
    }
    return best;
  }

  // Sérialisation état (pour AJAX)
  getState() {
    return {
      board: [...this.board],
      scores: [...this.scores],
      currentPlayer: this.currentPlayer,
      gameOver: this.gameOver,
    };
  }

  loadState(state) {
    this.board = [...state.board];
    this.scores = [...state.scores];
    this.currentPlayer = state.currentPlayer;
    this.gameOver = state.gameOver;
  }
}

// Export pour Node.js (server) et browser (script tag)
if (typeof module !== 'undefined') module.exports = { SongoEngine };
