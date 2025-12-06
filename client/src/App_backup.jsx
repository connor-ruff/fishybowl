import { useState, useEffect } from "react";
import { io } from "socket.io-client";
import LobbyScreen from "./components/StartScreen";

const socket = io("http://localhost:3001");

function App_Backup() {
  const [gameState, setGameState] = useState({
    serverState: null,
    clientState: {
      playerName: null,
      playerIsHost: null,
      currentRoom: null,
      clientGameState: null,
    }
  });
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [error, setError] = useState("");

  // Listen for player list updates
  useEffect(() => {
    socket.on("update-players", (playerNames) => {
      setGameState(prev => ({ ...prev, playerList: playerNames }));
    });

    socket.on("game-started", (gameStateReceived) => {
      setGameState(prev => ({ ...prev, gameState: gameStateReceived }));
    });

    return () => {
      socket.off("update-players");
    };
  }, []);

  // Create room
  const handleCreateRoom = () => {
    if (!gameState.playerName) return alert("Enter your name first");
    socket.emit("create-room", gameState.playerName, (res) => {
      if (res.success) {
        setGameState(prev => ({
          ...prev,
          currentRoom: res.roomCode,
          playerList: res.players,
          playerIsHost: true
        }));
        setError("");
      }
    });
  };

  // Join room
  const handleJoinRoom = () => {
    if (!gameState.playerName || !roomCodeInput) return alert("Enter name and room code");
    socket.emit("join-room", { roomCode: roomCodeInput, playerName: gameState.playerName }, (res) => {
      if (res.success) {
        setGameState(prev => ({
          ...prev,
          currentRoom: res.roomCode,
          playerList: res.players,
          playerIsHost: false
        }));
        setError("");
      } else {
        setError(res.error);
      }
    });
  };

  // Start a game 
  const handleStartGame = () => {
    if (!gameState.playerIsHost) return alert("Only the host can start the game");
    // Move to configuration phase
    setGameState(prev => ({ ...prev, gameState: "configure" }));
  };

  if (!gameState.currentRoom) {
    return (
      <LobbyScreen
        gameState={gameState}
        setGameState={setGameState}
        roomCodeInput={roomCodeInput}
        setRoomCodeInput={setRoomCodeInput}
        error={error}
        handleCreateRoom={handleCreateRoom}
        handleJoinRoom={handleJoinRoom}
      />
    );
  }
  else if (gameState.gameState === "lobby") {

    // Inside room view
    return (
      <div style={{ padding: 40 }}>
        <h1>Room: {gameState.currentRoom}</h1>
        <h2>Current Player: {gameState.playerName}</h2>
        <h2>Player List:</h2>
        <ul>
          {gameState.playerList.map((p) => (
            <li key={p.name}>{p.name}{p.is_host ? ' (Host)' : ''}</li>
          ))}
        </ul>

        <button onClick={handleStartGame} style={{marginLeft: 10}}>
          Start Game
        </button>
        
      </div>
    );
  }

  else if (gameState.gameState === "configure") {
    const handleTeamCountChange = (numTeams) => {
      const teams = Array(numTeams).fill(null).map((_, i) => ({ name: `Team ${i + 1}`, players: [] }));
      setGameState(prev => ({ 
        ...prev, 
        config: { ...prev.config, numTeams, teams }
      }));
    };

    const handlePlayerTeamChange = (playerName, teamIndex) => {
      const newTeams = [...gameState.config.teams];
      // Remove player from all teams first
      newTeams.forEach(team => {
        team.players = team.players.filter(p => p !== playerName);
      });
      // Add to new team if teamIndex is valid
      if (teamIndex >= 0) {
        newTeams[teamIndex].players.push(playerName);
      }
      setGameState(prev => ({ 
        ...prev, 
        config: { ...prev.config, teams: newTeams }
      }));
    };

    const handleWordsPerPlayerChange = (count) => {
      const totalWords = count * gameState.playerList.length;
      const newWords = Array(totalWords).fill("");
      setGameState(prev => ({ 
        ...prev, 
        config: { ...prev.config, wordsPerPlayer: count },
        words: newWords
      }));
    };

    const handleStartWithConfig = () => {
      // Check if all players are assigned to teams
      const assignedPlayers = gameState.config.teams.flatMap(team => team.players);
      if (assignedPlayers.length !== gameState.playerList.length) {
        return alert("Please assign all players to teams");
      }
      
      // Emit configuration to server and start game
      socket.emit("start-game-with-config", {
        roomCode: gameState.currentRoom,
        config: gameState.config
      });
      
      setGameState(prev => ({ ...prev, gameState: "collect-words" }));
    };

    return (
      <div style={{ padding: 40 }}>
        <h1>Configure Game</h1>
        
        <div style={{ marginBottom: '20px' }}>
          <h3>Number of Teams:</h3>
          <select 
            value={gameState.config.numTeams} 
            onChange={(e) => handleTeamCountChange(parseInt(e.target.value))}
            style={{ padding: '8px', fontSize: '16px' }}
          >
            <option value={2}>2 Teams</option>
            <option value={3}>3 Teams</option>
            <option value={4}>4 Teams</option>
          </select>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <h3>Assign Players to Teams:</h3>
          {gameState.playerList.map((player) => {
            const currentTeamIndex = gameState.config.teams.findIndex(team => 
              team.players.includes(player.name)
            );
            return (
              <div key={player.name} style={{ marginBottom: '10px', display: 'flex', alignItems: 'center' }}>
                <span style={{ minWidth: '150px' }}>{player.name}</span>
                <select 
                  value={currentTeamIndex >= 0 ? currentTeamIndex : ""}
                  onChange={(e) => handlePlayerTeamChange(player.name, e.target.value === "" ? -1 : parseInt(e.target.value))}
                  style={{ padding: '5px', marginLeft: '10px' }}
                >
                  <option value="">Unassigned</option>
                  {gameState.config.teams.map((team, index) => (
                    <option key={index} value={index}>{team.name}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>

        <div style={{ marginBottom: '20px' }}>
          <h3>Words per Player:</h3>
          <input 
            type="number" 
            min="1" 
            max="10" 
            value={gameState.config.wordsPerPlayer}
            onChange={(e) => handleWordsPerPlayerChange(parseInt(e.target.value))}
            style={{ padding: '8px', fontSize: '16px', width: '80px' }}
          />
          <span style={{ marginLeft: '10px' }}>
            Total words: {gameState.config.wordsPerPlayer * gameState.playerList.length}
          </span>
        </div>

        <div style={{ marginTop: '30px' }}>
          <button 
            onClick={handleStartWithConfig}
            style={{ 
              padding: '15px 30px', 
              backgroundColor: '#28a745', 
              color: 'white', 
              border: 'none', 
              borderRadius: '5px',
              fontSize: '16px'
            }}
          >
            Start Game
          </button>
        </div>
      </div>
    );
  }

  else if (gameState.gameState === "collect-words") {
    const handleWordChange = (index, value) => {
      const newWords = [...gameState.words];
      newWords[index] = value;
      setGameState(prev => ({ ...prev, words: newWords }));
    };

    return (
      <div style={{ padding: 40 }}>
        <h1>Collect Words</h1>
        <p>Enter {gameState.config.wordsPerPlayer} words:</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', maxWidth: '400px' }}>
          {gameState.words.slice(0, gameState.config.wordsPerPlayer).map((word, index) => (
            <input
              key={index}
              type="text"
              placeholder={`Word ${index + 1}`}
              value={word}
              onChange={(e) => handleWordChange(index, e.target.value)}
              style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
          ))}
        </div>
        <div style={{ marginTop: '20px' }}>
          <button 
            style={{ padding: '10px 20px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px' }}
            disabled={gameState.words.some(word => word.trim() === '')}
          >
            Submit Words
          </button>
        </div>
      </div>
    );
  }

  else {
    return (
      <div style={{ padding: 40 }}>
        <h1>Unknown Game State</h1>
      </div>
    );
  }
}

export default App_Backup;
