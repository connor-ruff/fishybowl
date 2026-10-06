// Happy-path playthrough: 4 players, 2 teams, all 3 rounds, no disconnects.
// Guards against regressions in scoring, rotation and round transitions.
//   GRACE_MS=1500 PORT=3099 node server/index.js
//   node server/test/fullgame.test.js
const { io } = require("socket.io-client");

const URL = process.env.URL || "http://localhost:3099";

let passed = 0;
let failed = 0;

function check(label, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function makeClient(name) {
  const socket = io(URL, { forceNew: true, transports: ["websocket"] });
  const client = {
    name, socket,
    sessionId: `s-${name}-${Math.random().toString(36).slice(2)}`,
    states: [],
    get last() { return this.states[this.states.length - 1]; }
  };
  socket.on("game-state-update", (s) => client.states.push(s));
  return client;
}

function emit(client, event, ...args) {
  return new Promise((resolve) => {
    client.socket.timeout(5000).emit(event, ...args, (err, res) => {
      resolve(err ? { success: false, error: "timeout" } : res);
    });
  });
}

function connected(client) {
  return new Promise((resolve) => {
    if (client.socket.connected) return resolve();
    client.socket.once("connect", resolve);
  });
}

async function run() {
  console.log(`\nFull game playthrough against ${URL}\n`);

  const names = ["Ann", "Ben", "Cat", "Dan"];
  const clients = names.map(makeClient);
  const [ann] = clients;
  await Promise.all(clients.map(connected));
  const byName = Object.fromEntries(clients.map(c => [c.name, c]));

  const created = await emit(ann, "create-room", { playerName: "Ann", sessionId: ann.sessionId });
  const roomCode = created.roomCode;
  for (const c of clients.slice(1)) {
    await emit(c, "join-room", { roomCode, playerName: c.name, sessionId: c.sessionId });
  }

  await emit(ann, "start-game", roomCode);
  const cfg = await emit(ann, "submit-game-config", roomCode, {
    teams: [
      { name: "Reds", players: ["Ann", "Cat"] },
      { name: "Blues", players: ["Ben", "Dan"] }
    ],
    wordsPerPlayer: 2
  });
  check("teams configured", cfg.success, cfg.error);

  for (const c of clients) {
    await emit(c, "submit-words", roomCode, c.name, [`${c.name}-1`, `${c.name}-2`]);
  }
  await sleep(150);
  check("game auto-started once everyone submitted", ann.last.gamePhase === "round-start", ann.last.gamePhase);
  check("bowl has 8 words", ann.last.activeGame.wordsRemainingCount === 8, `${ann.last.activeGame.wordsRemainingCount}`);

  // Play all three rounds by clearing the bowl each time
  for (let round = 1; round <= 3; round++) {
    console.log(`\nRound ${round}`);
    check(`round ${round} starts at round-start`, ann.last.gamePhase === "round-start", ann.last.gamePhase);
    check(`round number is ${round}`, ann.last.activeGame.currentRound === round, `${ann.last.activeGame.currentRound}`);

    await emit(ann, "start-round", roomCode);
    await sleep(80);
    check("moved to turn-ready", ann.last.gamePhase === "turn-ready", ann.last.gamePhase);

    let guard = 0;
    // Clear the bowl, letting the clue giver rotate as words are scored
    while (ann.last.gamePhase !== "round-end" && guard++ < 60) {
      const phase = ann.last.gamePhase;
      const giver = byName[ann.last.activeGame.currentClueGiver];

      if (phase === "turn-ready") {
        const res = await emit(giver, "start-turn", roomCode);
        if (!res.success) return check("start-turn failed", false, res.error);
      } else if (phase === "turn-active") {
        const res = await emit(giver, "word-guessed", roomCode);
        if (!res.success) return check("word-guessed failed", false, res.error);
      } else if (phase === "turn-end") {
        await emit(ann, "next-turn", roomCode);
      }
      await sleep(40);
    }

    check("round ended", ann.last.gamePhase === "round-end", ann.last.gamePhase);
    check("bowl is empty", ann.last.activeGame.wordsRemainingCount === 0, `${ann.last.activeGame.wordsRemainingCount}`);

    const roundPoints = Object.values(ann.last.activeGame.scores)
      .reduce((sum, arr) => sum + arr[round - 1], 0);
    check("8 points scored this round", roundPoints === 8, `${roundPoints}`);

    const res = await emit(ann, "next-round", roomCode);
    check("advanced past round-end", res.success, res.error);
    await sleep(80);
  }

  check("game over after round 3", ann.last.gamePhase === "game-over", ann.last.gamePhase);

  const totals = Object.fromEntries(
    Object.entries(ann.last.activeGame.scores).map(([t, arr]) => [t, arr.reduce((a, b) => a + b, 0)])
  );
  check("24 points total across 3 rounds", Object.values(totals).reduce((a, b) => a + b, 0) === 24, JSON.stringify(totals));
  check("turn history recorded", ann.last.activeGame.turnHistory.length > 0, "empty");
  check(
    "every turn is attributed to a real player",
    ann.last.activeGame.turnHistory.every(t => names.includes(t.clueGiver)),
    JSON.stringify(ann.last.activeGame.turnHistory.map(t => t.clueGiver))
  );

  // Score adjustment
  const adj = await emit(ann, "adjust-score", roomCode, "Reds", 1);
  check("host score adjustment applied", adj.success && adj.gameState.activeGame.hostAdjustments.Reds === 1, adj.error);
  const notHost = byName.Ben;
  const badAdj = await emit(notHost, "adjust-score", roomCode, "Reds", 5);
  check("non-host cannot adjust scores", !badAdj.success, badAdj.error);

  // Play again
  const again = await emit(ann, "play-again", roomCode);
  check("play again returns to lobby", again.success && again.gameState.gamePhase === "in-lobby", again.error);
  check("game data cleared", !again.gameState.activeGame && !again.gameState.gameConfig);
  check("all 4 players carried over", again.gameState.players.length === 4, `${again.gameState.players.length}`);

  clients.forEach(c => c.socket.close());
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error("Test run crashed:", err);
  process.exit(1);
});
