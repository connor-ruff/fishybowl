// Integration checks for the disconnect-handling behaviour.
// Run the server with a short grace window first:
//   GRACE_MS=1500 PORT=3099 node server/index.js
//   node server/test/disconnect.test.js
const { io } = require("socket.io-client");

const URL = process.env.URL || "http://localhost:3099";
const GRACE = parseInt(process.env.GRACE_MS) || 1500;

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

// A test client that records every state snapshot it receives
function makeClient(name) {
  const socket = io(URL, { forceNew: true, transports: ["websocket"] });
  const client = {
    name,
    socket,
    sessionId: `session-${name}-${Math.random().toString(36).slice(2)}`,
    states: [],
    removed: false,
    get last() { return this.states[this.states.length - 1]; },
    get phases() { return this.states.map(s => s.gamePhase); }
  };
  socket.on("game-state-update", (s) => client.states.push(s));
  socket.on("removed-from-room", () => { client.removed = true; });
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
  console.log(`\nTesting ${URL} (grace window ${GRACE}ms)\n`);

  // ─── Setup: host + 3 players ───
  console.log("Scenario: room setup");
  const host = makeClient("Host");
  const alice = makeClient("Alice");
  const bob = makeClient("Bob");
  const carol = makeClient("Carol");
  const all = [host, alice, bob, carol];
  await Promise.all(all.map(connected));

  const created = await emit(host, "create-room", { playerName: "Host", sessionId: host.sessionId });
  check("room created", created.success, created.error);
  const roomCode = created.roomCode;

  for (const c of [alice, bob, carol]) {
    const res = await emit(c, "join-room", { roomCode, playerName: c.name, sessionId: c.sessionId });
    check(`${c.name} joined`, res.success, res.error);
  }

  const dup = await emit(makeClient("x"), "join-room", { roomCode, playerName: "Alice", sessionId: "other" });
  check("duplicate name rejected", !dup.success && /taken/i.test(dup.error || ""), dup.error);

  // ─── The headline bug: a drop during setup must not disturb anyone ───
  console.log("\nScenario: player drops during team setup");
  await emit(host, "start-game", roomCode);
  await sleep(100);
  check("room is in setup", host.last.gamePhase === "pre-game-configs", host.last.gamePhase);

  const phasesBefore = host.states.length;
  carol.socket.disconnect();
  await sleep(200);

  const newStates = host.states.slice(phasesBefore);
  check(
    "other players stay on the setup screen",
    newStates.every(s => s.gamePhase === "pre-game-configs"),
    `saw phases: ${newStates.map(s => s.gamePhase).join(", ")}`
  );
  check(
    "Carol shows as reconnecting (not yet offline)",
    host.last.players.find(p => p.name === "Carol")?.connected === false &&
    host.last.players.find(p => p.name === "Carol")?.absent === false
  );

  // ─── Reconnect inside the grace window ───
  console.log("\nScenario: reconnect inside the grace window");
  const carol2 = makeClient("Carol");
  carol2.sessionId = carol.sessionId;
  await connected(carol2);
  const rejoin = await emit(carol2, "join-room", { roomCode, playerName: "Carol", sessionId: carol.sessionId });
  check("Carol rejoined by session id", rejoin.success && rejoin.isRejoin, rejoin.error);
  check("Carol is connected again", rejoin.gameState.players.find(p => p.name === "Carol")?.connected === true);
  check("still in setup, nothing was reset", rejoin.gameState.gamePhase === "pre-game-configs");

  // ─── Grace expiry marks a player absent but doesn't pause ───
  console.log("\nScenario: player never comes back during setup");
  bob.socket.disconnect();
  await sleep(GRACE + 400);
  check("Bob marked offline", host.last.players.find(p => p.name === "Bob")?.absent === true);
  check("room still in setup (not paused)", host.last.gamePhase === "pre-game-configs", host.last.gamePhase);

  // ─── Config submission works with an offline player ───
  console.log("\nScenario: host configures teams with someone offline");
  const config = {
    teams: [
      { name: "Reds", players: ["Host", "Bob"] },
      { name: "Blues", players: ["Alice", "Carol"] }
    ],
    wordsPerPlayer: 2
  };
  const cfg = await emit(host, "submit-game-config", roomCode, config);
  check("config accepted despite offline player", cfg.success, cfg.error);
  check("moved to word collection", cfg.gameState.gamePhase === "collecting-words", cfg.gameState.gamePhase);

  // ─── Word submission is idempotent ───
  console.log("\nScenario: word submission");
  await emit(host, "submit-words", roomCode, "Host", ["apple", "banana"]);
  const resub = await emit(host, "submit-words", roomCode, "Host", ["apple", "banana"]);
  check("resubmitting words succeeds", resub.success, resub.error);
  check(
    "resubmitting does not double-count",
    resub.gameState.gameConfig.numPlayersWithSubmittedWords === 1,
    `count = ${resub.gameState.gameConfig.numPlayersWithSubmittedWords}`
  );

  await emit(alice, "submit-words", roomCode, "Alice", ["cat", "dog"]);
  await emit(carol2, "submit-words", roomCode, "Carol", ["eel", "fox"]);
  await sleep(150);
  check(
    "game does not auto-start while Bob is missing",
    host.last.gamePhase === "collecting-words",
    host.last.gamePhase
  );

  // ─── The escape hatch that used to not exist ───
  console.log("\nScenario: host starts without the missing player");
  const forced = await emit(host, "force-start-game", roomCode);
  check("force start succeeded", forced.success, forced.error);
  check("game reached round 1", forced.gameState.gamePhase === "round-start", forced.gameState.gamePhase);
  check(
    "bowl has the 6 submitted words",
    forced.gameState.activeGame.wordsRemainingCount === 6,
    `count = ${forced.gameState.activeGame.wordsRemainingCount}`
  );
  check(
    "undrawn words are not leaked to clients",
    forced.gameState.activeGame.wordsRemaining === undefined
  );
  check(
    "session ids are not leaked to clients",
    forced.gameState.hostSessionId === undefined &&
    forced.gameState.players.every(p => p.sessionId === undefined) &&
    Object.values(forced.gameState.playerLookup).every(p => p.sessionId === undefined)
  );
  check(
    "other players' words are not leaked to clients",
    Object.values(forced.gameState.playerLookup).every(p => p.submittedWords === undefined)
  );

  // ─── Clue giver drops mid-turn ───
  console.log("\nScenario: clue giver drops mid-turn");
  await emit(host, "start-round", roomCode);
  await sleep(100);
  const giver = host.last.activeGame.currentClueGiver;
  check("a connected player is the clue giver", giver !== "Bob", `giver = ${giver}`);

  const giverClient = [host, alice, carol2].find(c => c.name === giver);
  await emit(giverClient, "start-turn", roomCode);
  await sleep(100);
  check("turn is active", host.last.gamePhase === "turn-active", host.last.gamePhase);
  check(
    "only the clue giver receives the word",
    !!giverClient.last.activeGame.currentWord &&
    [host, alice, carol2].filter(c => c !== giverClient).every(c => !c.last.activeGame.currentWord)
  );

  const nonGiver = [host, alice, carol2].find(c => c !== giverClient && c !== host) || alice;
  const cheat = await emit(nonGiver, "word-guessed", roomCode);
  check("non-clue-giver cannot score", !cheat.success, cheat.error);

  // Drop whoever currently has to give clues
  const liveGiverName = host.last.activeGame.currentClueGiver;
  const liveGiver = [host, alice, carol2].find(c => c.name === liveGiverName);
  liveGiver.socket.disconnect();
  await sleep(GRACE + 400);

  const observer = [host, alice, carol2].find(c => c !== liveGiver);
  check("game is waiting on the missing clue giver", observer.last.waitingFor === liveGiverName, `waitingFor = ${observer.last.waitingFor}`);
  check("turn countdown was frozen", observer.last.activeGame.turnEndsAt === undefined);
  check("phase did not become 'paused'", observer.last.gamePhase !== "paused", observer.last.gamePhase);

  // ─── Host skips them ───
  console.log("\nScenario: host moves past the missing clue giver");
  const hostIsMissing = liveGiver === host;
  const hostClient = hostIsMissing
    ? [alice, carol2].find(c => c.last.you?.is_host)
    : host;
  check("a connected player holds host duties", !!hostClient, "no host found");

  const skip = await emit(hostClient, "skip-waiting", roomCode);
  check("skip succeeded", skip.success, skip.error);
  await sleep(150);
  check("no longer waiting", !hostClient.last.waitingFor, `waitingFor = ${hostClient.last.waitingFor}`);
  check(
    "game moved forward",
    ["turn-ready", "turn-end", "round-end"].includes(hostClient.last.gamePhase),
    hostClient.last.gamePhase
  );

  // ─── Rejoin mid-game after a tab close ───
  console.log("\nScenario: rejoin mid-game after closing the tab");
  const returning = makeClient(liveGiverName);
  await connected(returning);
  const back = await emit(returning, "join-room", {
    roomCode, playerName: liveGiverName, sessionId: liveGiver.sessionId
  });
  check("rejoined mid-game", back.success && back.isRejoin, back.error);
  check("restored into the live game", !!back.gameState.activeGame, "no activeGame");
  check("marked present again", back.gameState.players.find(p => p.name === liveGiverName)?.absent === false);

  // ─── A brand new player can't walk into a live game ───
  const stranger = makeClient("Stranger");
  await connected(stranger);
  const blocked = await emit(stranger, "join-room", { roomCode, playerName: "Stranger", sessionId: "s1" });
  check("new player blocked mid-game", !blocked.success && /underway/i.test(blocked.error || ""), blocked.error);

  // ─── Host removal ───
  console.log("\nScenario: host removes the player who never came back");
  const currentHost = [host, alice, carol2, returning].find(
    c => c.socket.connected && c.last?.you?.is_host
  );
  const rm = await emit(currentHost, "remove-player", roomCode, "Bob");
  check("Bob removed", rm.success, rm.error);
  await sleep(150);
  check("Bob gone from the roster", !currentHost.last.players.some(p => p.name === "Bob"));
  check(
    "removal did not shrink the bowl mid-game",
    currentHost.last.activeGame.allWords === undefined &&
    currentHost.last.activeGame.wordsRemainingCount > 0
  );
  check("game still playable", currentHost.last.gamePhase !== "game-over", currentHost.last.gamePhase);

  // ─── Host leaves for good: duties transfer ───
  console.log("\nScenario: host leaves permanently");
  const hostName = currentHost.last.you.name;
  currentHost.socket.disconnect();
  await sleep(GRACE + 400);
  const survivor = [host, alice, carol2, returning].find(
    c => c !== currentHost && c.socket.connected && c.last?.players
  );
  const newHost = survivor.last.players.find(p => p.is_host);
  check("host duties moved to someone connected", !!newHost && newHost.name !== hostName, `host = ${newHost?.name}`);
  check("new host is actually online", newHost?.connected === true);

  // ─── Cleanup ───
  [...all, carol2, returning, stranger].forEach(c => c.socket.close());

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error("Test run crashed:", err);
  process.exit(1);
});
