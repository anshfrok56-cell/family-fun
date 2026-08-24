const WebSocket = require("ws");
const http = require("http");

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Battle Arena server online");
});

const wss = new WebSocket.Server({ server });

const rooms = new Map();
let nextId = 1;

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function getState(room) {
  const players = {};

  for (const [id, p] of room.players) {
    players[id] = {
      id: p.id,
      name: p.name,
      x: p.x,
      y: p.y,
      hp: p.hp,
      angle: p.angle
    };
  }

  return {
    type: "state",
    players,
    bullets: room.bullets
  };
}

function broadcast(room, data) {
  for (const p of room.players.values()) {
    send(p.ws, data);
  }
}

function spawnPlayer() {
  return {
    x: 100 + Math.random() * 700,
    y: 120 + Math.random() * 500
  };
}

wss.on("connection", (ws) => {
  let player = null;
  let room = null;

  ws.on("message", (raw) => {
    let msg;

    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    // CREATE / JOIN ROOM
    if (msg.type === "create" || msg.type === "join") {
      const code = String(msg.room || "").toUpperCase();

      if (!code) return;

      if (!rooms.has(code)) {
        rooms.set(code, {
          players: new Map(),
          bullets: []
        });
      }

      room = rooms.get(code);

      if (room.players.size >= 8) {
        send(ws, {
          type: "error",
          message: "Room is full"
        });
        return;
      }

      const position = spawnPlayer();

      player = {
        id: String(nextId++),
        name: String(msg.name || "Player").slice(0, 15),
        x: position.x,
        y: position.y,
        hp: 100,
        angle: 0,
        ws
      };

      room.players.set(player.id, player);

      send(ws, {
        type: "welcome",
        id: player.id,
        x: player.x,
        y: player.y
      });

      broadcast(room, getState(room));
      return;
    }

    if (!player || !room) return;

    // PLAYER MOVEMENT
    if (msg.type === "move") {
      const mx = Number(msg.x || 0);
      const my = Number(msg.y || 0);

      const length = Math.hypot(mx, my) || 1;

      player.x += (mx / length) * 7;
      player.y += (my / length) * 7;

      player.x = Math.max(20, Math.min(980, player.x));
      player.y = Math.max(70, Math.min(700, player.y));

      player.angle = Number(msg.angle || 0);
    }

    // SHOOT
    if (msg.type === "shoot") {
      const angle = Number(msg.angle || 0);

      room.bullets.push({
        x: player.x + Math.cos(angle) * 25,
        y: player.y + Math.sin(angle) * 25,
        vx: Math.cos(angle) * 12,
        vy: Math.sin(angle) * 12,
        owner: player.id,
        life: 90
      });

      broadcast(room, {
        type: "event",
        event: "shoot"
      });
    }

    broadcast(room, getState(room));
  });

  // PLAYER LEAVES
  ws.on("close", () => {
    if (!player || !room) return;

    room.players.delete(player.id);

    broadcast(room, getState(room));

    if (room.players.size === 0) {
      for (const [code, r] of rooms) {
        if (r === room) {
          rooms.delete(code);
          break;
        }
      }
    }
  });
});

// SERVER START
const PORT = process.env.PORT || 10000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Battle Arena server running on port ${PORT}`);
});
