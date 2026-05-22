# ⚡ MULTIPLAYER PSYCH
### ARCADE LAB — Experiment 04

> *Social dynamics as game loops. Trust, deception, and collective consciousness.*

A real-time multiplayer psychological experiment game. 2–8 players.  
Three modes. One shared room. Unlimited chaos.

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start server
npm start

# 3. Open browser
http://localhost:3000
```

Share the **5-letter room code** with friends. Host presses **BEGIN EXPERIMENT**.

---

## 🎮 The Three Experiments

### 01 — SYNC PULSE
A ring expands from the center. Click the **exact moment** it hits the target ring.

- Perfect timing = **100 pts**
- Great = **78 pts** · Good = **50 pts** · Late = **22 pts** · Miss = **0 pts**
- 5 rounds. Gets faster each round.
- Everyone's click flashes on screen in real-time.

**Skill tested:** Timing precision, composure under pressure.

---

### 02 — TRUST PROTOCOL
The prisoner's dilemma. 22 seconds. One choice.

| Your Choice | Others Cooperate | Others Defect |
|---|---|---|
| **COOPERATE** | +65 pts (everyone wins) | +0 pts (you lose) |
| **DEFECT** | +85 pts (you win big) | +8 pts (everyone loses) |

- 3 rounds. Previous round choices visible.
- Psychological profile built from your decision pattern.
- Insight text reveals group psychology after each round.

**Skill tested:** Risk assessment, social trust, deception.

---

### 03 — HIVE MIND
One shared cursor. Every player pushes it with `W A S D` or arrow keys.  
The cursor moves based on the **average of all inputs**.

- 7 targets scattered across the field
- 60 seconds
- **+70 pts per target** + time bonus
- All players receive equal score — cooperation is the only strategy.

**Skill tested:** Collective coordination, communication without words.

---

## 🧠 Psychological Profiles

At the end, each player receives an archetype based on their Trust Protocol choices:

| Archetype | Behaviour |
|---|---|
| **THE ALTRUIST** | Never defected. Trusts the collective completely. |
| **THE STRATEGIST** | Always defected. Pure rational self-interest. |
| **THE OPPORTUNIST** | Defected when it was safe to. Calculated betrayal. |
| **THE PRAGMATIST** | Mixed strategy. Adapted to group dynamics. |
| **THE OBSERVER** | Never made a trust choice. Waits. Watches. |

---

## 🕹️ Controls

| Action | Control |
|---|---|
| Join game | Enter name + room code → INITIATE NEURAL LINK |
| Create new room | Leave code blank |
| Sync Pulse — click | Mouse click / tap anywhere on canvas |
| Trust choice | Click COOPERATE or DEFECT card |
| Hive Mind — move | `W A S D` · `↑ ↓ ← →` · On-screen D-pad (mobile) |

---

## 🌐 Deployment

### Local (LAN multiplayer)
```bash
npm start
# Players on same network: http://YOUR_LOCAL_IP:3000
```

### Railway (recommended — free tier)
```bash
# Push to GitHub, connect Railway, deploy
# Set start command: node server.js
```

### Render
```yaml
# render.yaml
services:
  - type: web
    name: multiplayer-psych
    env: node
    buildCommand: npm install
    startCommand: node server.js
```

### Heroku
```bash
heroku create
git push heroku main
```

### Custom port
```bash
PORT=8080 node server.js
```

---

## 🏗️ Architecture

```
multiplayer-psych/
├── server.js          ← Node.js + WebSocket game server
├── package.json
├── public/
│   ├── index.html     ← All game screens & UI markup
│   ├── style.css      ← Cyberpunk UI system
│   └── game.js        ← Client engine (WebSocket + Canvas + Audio)
└── README.md
```

### Server (server.js) — 370 lines
- Express static serving
- `ws` WebSocket server
- `Room` class managing full game state
- 3 game mode engines (SYNC_PULSE, TRUST_PROTOCOL, HIVE_MIND)
- Psychological profile builder
- Latency-compensated timing for Sync Pulse
- Auto-cleanup of empty rooms

### Client (game.js) — 804 lines
- WebSocket client with auto-reconnect detection
- Neural network canvas background (procedural, always animating)
- Sync Pulse: canvas renderer + timing engine
- Trust Protocol: animated timer ring + reveal sequence
- Hive Mind: real-time canvas + keyboard/touch D-pad input
- Web Audio API: all sounds procedurally synthesised
- Psychological profile display

---

## 📡 WebSocket Protocol

**Client → Server**
```
JOIN          { name, code }
START         {}
SYNC_CLICK    { latency }
TRUST_CHOICE  { choice: 'cooperate' | 'defect' }
HIVE_INPUT    { dx, dy }   (sent at 20fps while playing)
PING          { t }
PLAY_AGAIN    {}
```

**Server → Client**
```
JOINED             { pid, color, code, players, isHost }
LOBBY_UPDATE       { players }
GAME_START         { players }
MODE_INTRO         { mode, info, modeIdx, total }
SYNC_ROUND         { round, total, duration, targetMs, startT }
SYNC_CLICK_IND     { id, color }
SYNC_RESULT        { results, scores, players }
TRUST_ROUND        { round, total, history, timeLimit }
TRUST_PROGRESS     { chosen, total }
TRUST_RESULT       { results, insight, scores, players }
HIVE_START         { targets, duration, cursor }
HIVE_TICK          { cx, cy, inputs, timeLeft }
HIVE_HIT           { targetId, hitCount, total }
HIVE_END           { hitCount, total, pts }
MODE_END           { mode, scores, players }
GAME_END           { scores, players, profiles }
HOST_LEFT          {}
PONG               { t }
```

---

## ⚙️ Configuration

Edit constants at the top of `server.js`:

```js
const MAX_PLAYERS  = 8;    // max per room
const MIN_PLAYERS  = 2;    // needed to start
const SECTOR_SECS  = 28;   // seconds per sector (unused here)

// In startSyncPulse():
const ROUNDS = 5;          // sync pulse rounds
const duration = 3200 - (round-1)*180; // pulse speed

// In startTrustProtocol():
const ROUNDS = 3;          // trust rounds
const timeLimit = 22000;   // ms to make choice

// In startHiveMind():
const numTargets = 7;
const duration   = 60000; // ms
```

---

## 🔧 Tech Stack

| Layer | Technology |
|---|---|
| Server runtime | Node.js 18+ |
| WebSocket | `ws` v8 |
| HTTP server | `express` v4 |
| Frontend rendering | Canvas 2D API |
| Audio | Web Audio API (procedural synthesis) |
| Fonts | Google Fonts (Orbitron + Space Mono) |
| Dependencies | **2 packages total** — no bundler, no framework |

---

*Built for chaos. — ARCADE LAB 2025*
