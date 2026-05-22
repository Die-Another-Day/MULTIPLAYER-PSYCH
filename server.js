'use strict';
/* ═══════════════════════════════════════════════════════════════
   MULTIPLAYER PSYCH  //  ARCADE LAB — Experiment 04
   WebSocket Game Server  ·  Node.js + ws + Express
═══════════════════════════════════════════════════════════════ */
const express   = require('express');
const http      = require('http');
const WebSocket = require('ws');
const path      = require('path');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });
const PORT   = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

/* ── CONSTANTS ── */
const COLORS      = ['#00F5FF','#FF2DA6','#7A5CFF','#C7FF4D','#FF8800','#00FF88','#FF6644','#44AAFF'];
const MAX_PLAYERS = 8;
const MIN_PLAYERS = 2;
const MODES       = ['SYNC_PULSE','TRUST_PROTOCOL','HIVE_MIND'];

const MODE_INFO = {
  SYNC_PULSE:      { name:'SYNC PULSE',      desc:'Click the instant the pulse hits the ring. Perfect timing wins.', rounds:5 },
  TRUST_PROTOCOL:  { name:'TRUST PROTOCOL',  desc:'Cooperate for mutual gain — or defect and betray. Choose wisely.', rounds:3 },
  HIVE_MIND:       { name:'HIVE MIND',        desc:'One shared cursor. Every player pushes it. Navigate together.', rounds:1 },
};

/* ── ROOM REGISTRY ── */
const rooms = new Map();

function genCode() {
  const C = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += C[Math.random() * C.length | 0];
  return s;
}

/* ═══════════════════════════════════════════════════════════════
   ROOM CLASS
═══════════════════════════════════════════════════════════════ */
class Room {
  constructor(code) {
    this.code      = code;
    this.players   = new Map();   // id → player obj
    this.phase     = 'LOBBY';
    this.modeIdx   = 0;
    this.colorIdx  = 0;
    this.scores    = {};          // id → total score
    this.modeData  = {};
    this._timers   = [];
    this._interval = null;
    this.trustHistory = [];
  }

  /* ── Players ── */
  addPlayer(id, name, ws) {
    const color  = COLORS[this.colorIdx++ % COLORS.length];
    const player = { id, name, color, ws };
    this.players.set(id, player);
    this.scores[id] = 0;
    return player;
  }

  removePlayer(id) {
    this.players.delete(id);
    delete this.scores[id];
  }

  isHost(id) { return id === [...this.players.keys()][0]; }

  get list() {
    return [...this.players.values()].map(p => ({
      id: p.id, name: p.name, color: p.color, score: this.scores[p.id] || 0,
    }));
  }

  /* ── Messaging ── */
  broadcast(msg) {
    const d = JSON.stringify(msg);
    for (const p of this.players.values())
      if (p.ws.readyState === WebSocket.OPEN) p.ws.send(d);
  }

  send(id, msg) {
    const p = this.players.get(id);
    if (p && p.ws.readyState === WebSocket.OPEN) p.ws.send(JSON.stringify(msg));
  }

  /* ── Timers ── */
  after(fn, ms) { const t = setTimeout(fn, ms); this._timers.push(t); return t; }
  clearTimers()  { this._timers.forEach(clearTimeout); this._timers = []; if (this._interval) { clearInterval(this._interval); this._interval = null; } }

  /* ── Score ── */
  addScore(id, pts) { if (this.scores[id] !== undefined) this.scores[id] += Math.round(pts); }

  /* ═══════════════════════════════════════════════════════════
     GAME FLOW
  ══════════════════════════════════════════════════════════ */
  startGame() {
    this.phase    = 'PLAYING';
    this.modeIdx  = 0;
    this.scores   = {};
    this.trustHistory = [];
    for (const id of this.players.keys()) this.scores[id] = 0;
    this.broadcast({ type:'GAME_START', players: this.list });
    this.after(() => this.startMode(), 800);
  }

  startMode() {
    const mode = MODES[this.modeIdx];
    const info = MODE_INFO[mode];
    this.broadcast({
      type:'MODE_INTRO', mode, info,
      modeIdx: this.modeIdx, total: MODES.length,
    });
    this.after(() => {
      if (mode === 'SYNC_PULSE')     this.startSyncPulse();
      else if (mode === 'TRUST_PROTOCOL') this.startTrustProtocol();
      else if (mode === 'HIVE_MIND') this.startHiveMind();
    }, 4000);
  }

  nextMode() {
    this.broadcast({ type:'MODE_END', scores: this.scores, players: this.list });
    this.modeIdx++;
    if (this.modeIdx >= MODES.length) this.after(() => this.endGame(), 3500);
    else this.after(() => this.startMode(), 3500);
  }

  endGame() {
    this.phase = 'END';
    const profiles = this.buildProfiles();
    this.broadcast({ type:'GAME_END', scores: this.scores, players: this.list, profiles });
    this.clearTimers();
    this.after(() => rooms.delete(this.code), 10 * 60 * 1000);
  }

  /* ═══════════════════════════════════════════════════════════
     MODE 1: SYNC PULSE
  ══════════════════════════════════════════════════════════ */
  startSyncPulse() {
    this.modeData = { mode:'SYNC_PULSE', round:0, totalRounds:5, clicks:{}, startT:0 };
    this.nextSyncRound();
  }

  nextSyncRound() {
    const md = this.modeData;
    md.round++;
    md.clicks = {};

    if (md.round > md.totalRounds) { this.nextMode(); return; }

    // Pulse duration shrinks each round (gets harder)
    const duration   = 3200 - (md.round - 1) * 180;
    const targetPct  = 0.70 + Math.random() * 0.06; // randomise slightly
    const targetMs   = Math.round(duration * targetPct);

    md.startT   = Date.now();
    md.perfect  = md.startT + targetMs;
    md.duration = duration;

    this.broadcast({
      type:'SYNC_ROUND', round: md.round, total: md.totalRounds,
      duration, targetMs, startT: md.startT,
    });

    this.after(() => this.endSyncRound(), duration + 1000);
  }

  endSyncRound() {
    const md = this.modeData;
    const results = {};

    for (const [id] of this.players) {
      const raw = md.clicks[id];
      if (raw == null) {
        results[id] = { delta:null, score:0, label:'MISSED' };
      } else {
        // Latency-adjusted server time
        const adj   = md.clicks[id + '_adj'] || raw;
        const delta = Math.abs(adj - md.perfect);
        let score, label;
        if (delta < 60)  { score = 100; label = 'PERFECT'; }
        else if (delta < 180) { score = 78;  label = 'GREAT'; }
        else if (delta < 380) { score = 50;  label = 'GOOD'; }
        else if (delta < 650) { score = 22;  label = 'LATE'; }
        else               { score = 5;   label = 'MISS'; }
        results[id] = { delta: Math.round(delta), score, label };
        this.addScore(id, score);
      }
    }

    this.broadcast({
      type:'SYNC_RESULT', results, round: md.round,
      scores: this.scores, players: this.list,
    });

    this.after(() => this.nextSyncRound(), 2800);
  }

  onSyncClick(id, latency) {
    const md = this.modeData;
    if (!md.clicks || md.clicks[id] != null) return;
    const now       = Date.now();
    md.clicks[id]   = now;
    md.clicks[id + '_adj'] = now - Math.max(0, Math.min(latency || 0, 300));
    // Broadcast click indicator to others (not score)
    this.broadcast({ type:'SYNC_CLICK_INDICATOR', id, color: this.players.get(id)?.color });
  }

  /* ═══════════════════════════════════════════════════════════
     MODE 2: TRUST PROTOCOL
  ══════════════════════════════════════════════════════════ */
  startTrustProtocol() {
    this.modeData = { mode:'TRUST_PROTOCOL', round:0, totalRounds:3, choices:{} };
    this.nextTrustRound();
  }

  nextTrustRound() {
    const md = this.modeData;
    md.round++;
    md.choices = {};

    if (md.round > md.totalRounds) { this.nextMode(); return; }

    const timeLimit = 22000;
    this.broadcast({
      type:'TRUST_ROUND', round: md.round, total: md.totalRounds,
      history: this.trustHistory, timeLimit,
    });

    this._trustTimer = this.after(() => this.endTrustRound(), timeLimit);
  }

  onTrustChoice(id, choice) {
    const md = this.modeData;
    if (!md.choices || md.choices[id]) return;
    md.choices[id] = choice;
    const chosen = Object.keys(md.choices).length;
    this.broadcast({ type:'TRUST_PROGRESS', chosen, total: this.players.size });
    if (chosen >= this.players.size) { this.clearTimers(); this.endTrustRound(); }
  }

  endTrustRound() {
    const md = this.modeData;
    const ch = md.choices;
    let coops = 0, defs = 0;

    // Default absent players to cooperate
    for (const [id] of this.players) if (!ch[id]) ch[id] = 'cooperate';
    for (const v of Object.values(ch)) v === 'cooperate' ? coops++ : defs++;

    const results = {};
    for (const [id] of this.players) {
      const mine = ch[id];
      let score, outcome;
      if (defs === 0) {
        score = 65; outcome = 'COLLECTIVE_WIN';          // all cooperate
      } else if (mine === 'defect') {
        score = coops > 0 ? 85 : 8; outcome = coops > 0 ? 'EXPLOITER' : 'MUTUAL_DEFECT';
      } else {
        score = defs > 0 ? 0 : 65;  outcome = defs > 0 ? 'EXPLOITED' : 'COLLECTIVE_WIN';
      }
      results[id] = { choice: mine, score, outcome };
      this.addScore(id, score);
    }

    const insight = this.getTrustInsight(coops, defs, this.players.size);
    this.trustHistory.push({ round: md.round, coops, defs, choices: { ...ch } });

    this.broadcast({
      type:'TRUST_RESULT', results, coops, defs, insight,
      round: md.round, scores: this.scores, players: this.list,
    });

    this.after(() => this.nextTrustRound(), 5000);
  }

  getTrustInsight(c, d, n) {
    if (d === 0) return { tag:'COLLECTIVE CONSCIOUSNESS', text:'Perfect cooperation achieved. The group transcended rational self-interest — a rare Nash deviation.' };
    if (c === 0) return { tag:'DEFECTION CASCADE', text:'Everyone defected. Mutual distrust created the worst collective outcome — the tragedy of the commons.' };
    if (c / n >= 0.75) return { tag:'SOCIAL OPTIMISM', text:'Most trusted the collective. High cooperator ratio signals strong social bonds and risk tolerance.' };
    if (d / n >= 0.75) return { tag:'FEAR DOMINANCE', text:'Majority defected. Fear of exploitation overrode collective benefit — a self-fulfilling paranoia.' };
    return { tag:'MIXED EQUILIBRIUM', text:'The group split between trust and self-interest. The eternal tension between individual and collective remains unresolved.' };
  }

  /* ═══════════════════════════════════════════════════════════
     MODE 3: HIVE MIND
  ══════════════════════════════════════════════════════════ */
  startHiveMind() {
    const numTargets = 7;
    const targets = Array.from({ length: numTargets }, (_, i) => ({
      id: i,
      x: 0.1 + Math.random() * 0.8,
      y: 0.1 + Math.random() * 0.8,
      hit: false,
    }));

    this.modeData = {
      mode:'HIVE_MIND',
      cx: 0.5, cy: 0.5,
      targets,
      inputs: {},        // id → { dx, dy }
      hitCount: 0,
      startT: Date.now(),
      duration: 60000,
    };

    this.broadcast({
      type:'HIVE_START',
      targets: targets.map(t => ({ id:t.id, x:t.x, y:t.y })),
      duration: 60000,
      cursor: { x:0.5, y:0.5 },
    });

    // Physics tick 20fps
    this._interval = setInterval(() => this.hiveTick(), 50);
    this.after(() => this.endHiveMind(), 60000);
  }

  hiveTick() {
    const md = this.modeData;
    const inp = Object.values(md.inputs);
    let adx = 0, ady = 0;
    if (inp.length) {
      for (const i of inp) { adx += i.dx; ady += i.dy; }
      adx /= inp.length; ady /= inp.length;
    }

    const spd = 0.007;
    md.cx = Math.max(0.02, Math.min(0.98, md.cx + adx * spd));
    md.cy = Math.max(0.02, Math.min(0.98, md.cy + ady * spd));

    // Hit detection
    const hitR = 0.065;
    for (const t of md.targets) {
      if (t.hit) continue;
      const dx = md.cx - t.x, dy = md.cy - t.y;
      if (Math.sqrt(dx*dx + dy*dy) < hitR) {
        t.hit = true; md.hitCount++;
        this.broadcast({ type:'HIVE_HIT', targetId:t.id, hitCount:md.hitCount, total:md.targets.length });
      }
    }

    this.broadcast({
      type:'HIVE_TICK',
      cx: md.cx, cy: md.cy,
      inputs: Object.fromEntries(Object.entries(md.inputs)),
      timeLeft: Math.max(0, md.duration - (Date.now() - md.startT)),
    });
  }

  onHiveInput(id, dx, dy) {
    if (!this.modeData.inputs) return;
    this.modeData.inputs[id] = { dx, dy };
  }

  endHiveMind() {
    const md = this.modeData;
    if (this._interval) { clearInterval(this._interval); this._interval = null; }
    const elapsed = Date.now() - md.startT;
    const timePct = Math.max(0, 1 - elapsed / md.duration);
    const pts = md.hitCount * 70 + Math.round(timePct * 150);
    for (const [id] of this.players) this.addScore(id, pts);
    this.broadcast({ type:'HIVE_END', hitCount:md.hitCount, total:md.targets.length, pts, scores:this.scores, players:this.list });
    this.after(() => this.nextMode(), 3500);
  }

  /* ═══════════════════════════════════════════════════════════
     PSYCHOLOGICAL PROFILES
  ══════════════════════════════════════════════════════════ */
  buildProfiles() {
    const profiles = {};
    const ranked   = this.list.sort((a, b) => b.score - a.score);
    const total    = ranked.length;

    for (let i = 0; i < ranked.length; i++) {
      const p  = ranked[i];
      const id = p.id;

      // Analyse trust history
      const myChoices = this.trustHistory.map(r => r.choices?.[id]).filter(Boolean);
      const defs      = myChoices.filter(c => c === 'defect').length;
      const coops     = myChoices.filter(c => c === 'cooperate').length;

      let archetype, trait, color;
      if (defs === 0 && coops > 0) {
        archetype = 'THE ALTRUIST';    trait = 'Unwavering trust. Collective good above personal gain.'; color = '#00F5FF';
      } else if (coops === 0 && defs > 0) {
        archetype = 'THE STRATEGIST';  trait = 'Pure rational self-interest. Never leaves gain on the table.'; color = '#FF2DA6';
      } else if (defs > coops) {
        archetype = 'THE OPPORTUNIST'; trait = 'Defects when advantage is clear. Cooperates only when safe.'; color = '#FF8800';
      } else if (myChoices.length === 0) {
        archetype = 'THE OBSERVER';    trait = 'Watches. Waits. Lets others expose themselves first.'; color = '#7A5CFF';
      } else {
        archetype = 'THE PRAGMATIST';  trait = 'Balances trust and self-interest based on group dynamics.'; color = '#C7FF4D';
      }

      profiles[id] = {
        archetype, trait, color,
        rank: i + 1, total,
        score: this.scores[id] || 0,
      };
    }
    return profiles;
  }
}

/* ═══════════════════════════════════════════════════════════════
   WEBSOCKET HANDLER
═══════════════════════════════════════════════════════════════ */
let playerCounter = 0;

wss.on('connection', ws => {
  const pid  = `p${++playerCounter}`;
  let   room = null;

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {

      case 'JOIN': {
        let code = (msg.code || '').toUpperCase().trim();
        // Find existing room or create new
        if (!code || !rooms.has(code)) {
          let nc; do { nc = genCode(); } while (rooms.has(nc));
          code = nc;
        }
        const r = rooms.get(code) || (() => { const nr = new Room(code); rooms.set(code, nr); return nr; })();

        if (r.players.size >= MAX_PLAYERS) { ws.send(JSON.stringify({ type:'ERR', msg:'Room full' })); return; }
        if (r.phase !== 'LOBBY')           { ws.send(JSON.stringify({ type:'ERR', msg:'Game in progress' })); return; }

        const p = r.addPlayer(pid, (msg.name || `GHOST_${playerCounter}`).slice(0, 16), ws);
        room = r;

        ws.send(JSON.stringify({
          type:'JOINED', pid, color:p.color, code,
          players: r.list, isHost: r.isHost(pid),
        }));
        r.broadcast({ type:'LOBBY_UPDATE', players:r.list });
        break;
      }

      case 'START': {
        if (!room || !room.isHost(pid) || room.phase !== 'LOBBY') return;
        if (room.players.size < MIN_PLAYERS) {
          ws.send(JSON.stringify({ type:'ERR', msg:`Need at least ${MIN_PLAYERS} players` }));
          return;
        }
        room.startGame();
        break;
      }

      case 'SYNC_CLICK':   if (room) room.onSyncClick(pid, msg.latency || 0); break;
      case 'TRUST_CHOICE': if (room) room.onTrustChoice(pid, msg.choice); break;
      case 'HIVE_INPUT':   if (room) room.onHiveInput(pid, msg.dx, msg.dy); break;

      case 'PING': ws.send(JSON.stringify({ type:'PONG', t: msg.t })); break;

      case 'PLAY_AGAIN': {
        if (!room || !room.isHost(pid)) return;
        // Reset room for new game
        room.clearTimers();
        room.phase = 'LOBBY';
        room.modeIdx = 0;
        room.trustHistory = [];
        room.colorIdx = 0;
        // Reset scores
        for (const id of room.players.keys()) room.scores[id] = 0;
        room.broadcast({ type:'LOBBY_UPDATE', players:room.list });
        break;
      }
    }
  });

  ws.on('close', () => {
    if (!room) return;
    const wasHost = room.isHost(pid);
    room.removePlayer(pid);
    if (room.players.size === 0) { room.clearTimers(); rooms.delete(room.code); return; }
    room.broadcast({ type:'LOBBY_UPDATE', players:room.list });
    // If host left during game, abort to lobby
    if (wasHost && room.phase === 'PLAYING') {
      room.clearTimers();
      room.phase = 'LOBBY';
      room.broadcast({ type:'HOST_LEFT' });
    }
  });

  ws.on('error', () => { if (room) room.removePlayer(pid); });
});

server.listen(PORT, () => console.log(`\n⚡ MULTIPLAYER PSYCH — http://localhost:${PORT}\n`));
