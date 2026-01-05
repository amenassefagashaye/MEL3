import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";
import { WebSocket, WebSocketClient } from "./utils/websocket.ts";
import { Player, Room } from "./models/interfaces.ts";
import { validateAdmin, validatePlayer } from "./middlewares/auth.ts";
import { broadcastToRoom, sendToClient } from "./services/broadcaster.ts";
import { logger } from "./services/logger.ts";

// Load environment variables
const PORT = Deno.env.get("PORT") || "8000";
const ADMIN_PASSWORD = Deno.env.get("ADMIN_PASSWORD") || "asse2123";
const SECRET_KEY = Deno.env.get("SECRET_KEY") || "assefa_gashaye_bingo_secret_2024";

// Game state
const rooms = new Map<string, Room>();
const players = new Map<string, Player>();
const adminConnections = new Set<WebSocket>();

// Create application
const app = new Application();
const router = new Router();

// Middleware
app.use(oakCors());
app.use(logger);
app.use(router.routes());
app.use(router.allowedMethods());

// Health check endpoint
router.get("/health", (ctx) => {
  ctx.response.body = { status: "healthy", timestamp: new Date().toISOString() };
});

// Admin authentication endpoint
router.post("/admin/login", async (ctx) => {
  try {
    const body = await ctx.request.body().value;
    const { password } = body;
    
    if (password === ADMIN_PASSWORD) {
      const token = btoa(`${Date.now()}:${SECRET_KEY}:admin`);
      ctx.response.body = { 
        success: true, 
        token,
        message: "Admin authentication successful" 
      };
    } else {
      ctx.response.status = 401;
      ctx.response.body = { 
        success: false, 
        message: "Invalid admin password" 
      };
    }
  } catch (error) {
    ctx.response.status = 400;
    ctx.response.body = { 
      success: false, 
      message: "Invalid request" 
    };
  }
});

// Get game statistics
router.get("/stats", validateAdmin, (ctx) => {
  const stats = {
    totalRooms: rooms.size,
    totalPlayers: players.size,
    activeGames: Array.from(rooms.values()).filter(room => room.active).length,
    totalRevenue: Array.from(players.values())
      .reduce((sum, player) => sum + (player.payment || 0), 0),
    totalWinnings: Array.from(players.values())
      .reduce((sum, player) => sum + (player.wonAmount || 0), 0)
  };
  
  ctx.response.body = { success: true, stats };
});

// Get room information
router.get("/room/:roomId", validatePlayer, (ctx) => {
  const { roomId } = ctx.params;
  const room = rooms.get(roomId);
  
  if (!room) {
    ctx.response.status = 404;
    ctx.response.body = { success: false, message: "Room not found" };
    return;
  }
  
  ctx.response.body = {
    success: true,
    room: {
      id: room.id,
      gameType: room.gameType,
      stake: room.stake,
      active: room.active,
      playerCount: room.players.size,
      calledNumbers: room.calledNumbers,
      winners: room.winners
    }
  };
});

// WebSocket upgrade handler
router.get("/ws", async (ctx) => {
  if (!ctx.isUpgradable) {
    ctx.throw(501);
    return;
  }
  
  const socket = await ctx.upgrade();
  const ws = new WebSocket(socket);
  
  // Set up WebSocket event handlers
  ws.on("message", async (data) => {
    try {
      await handleWebSocketMessage(ws, data);
    } catch (error) {
      console.error("Error handling WebSocket message:", error);
      ws.send(JSON.stringify({
        type: "error",
        message: "Internal server error"
      }));
    }
  });
  
  ws.on("close", () => {
    handleWebSocketClose(ws);
  });
  
  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
    handleWebSocketClose(ws);
  });
});

// Handle WebSocket messages
async function handleWebSocketMessage(ws: WebSocket, data: string) {
  const message = JSON.parse(data);
  console.log("Received message:", message.type);
  
  switch (message.type) {
    case "hello":
      await handleHello(ws, message);
      break;
    
    case "register":
      await handleRegister(ws, message);
      break;
    
    case "join_room":
      await handleJoinRoom(ws, message);
      break;
    
    case "leave_room":
      await handleLeaveRoom(ws, message);
      break;
    
    case "start_game":
      await handleStartGame(ws, message);
      break;
    
    case "number_called":
      await handleNumberCalled(ws, message);
      break;
    
    case "mark":
      await handleMark(ws, message);
      break;
    
    case "win":
      await handleWin(ws, message);
      break;
    
    case "chat":
      await handleChat(ws, message);
      break;
    
    case "payment":
      await handlePayment(ws, message);
      break;
    
    case "withdraw":
      await handleWithdraw(ws, message);
      break;
    
    case "admin_command":
      await handleAdminCommand(ws, message);
      break;
    
    case "ping":
      handlePing(ws, message);
      break;
    
    case "pong":
      handlePong(ws, message);
      break;
    
    default:
      ws.send(JSON.stringify({
        type: "error",
        message: "Unknown message type"
      }));
  }
}

// Handle hello message
async function handleHello(ws: WebSocket, message: any) {
  const { playerId, isAdmin, deviceInfo } = message;
  
  if (isAdmin) {
    adminConnections.add(ws);
    ws.isAdmin = true;
    
    ws.send(JSON.stringify({
      type: "welcome",
      message: "Admin connected successfully",
      timestamp: new Date().toISOString()
    }));
  } else {
    ws.playerId = playerId;
    ws.deviceInfo = deviceInfo;
    
    ws.send(JSON.stringify({
      type: "welcome",
      message: "Connected to bingo server",
      timestamp: new Date().toISOString()
    }));
  }
}

// Handle player registration
async function handleRegister(ws: WebSocket, message: any) {
  const { playerId, name, phone, stake, gameType, payment } = message;
  
  // Validate input
  if (!name || !phone || !stake) {
    ws.send(JSON.stringify({
      type: "error",
      message: "Missing required fields"
    }));
    return;
  }
  
  // Create player
  const player: Player = {
    id: playerId,
    name,
    phone,
    stake,
    gameType,
    payment: payment || 0,
    joinedAt: new Date(),
    socket: ws,
    roomId: null,
    markedNumbers: new Set(),
    balance: payment || 0
  };
  
  players.set(playerId, player);
  ws.playerId = playerId;
  
  // Notify admin
  broadcastToAdmins({
    type: "player_joined",
    playerId,
    name,
    phone,
    stake,
    gameType
  });
  
  ws.send(JSON.stringify({
    type: "registration_success",
    message: "Registration successful",
    playerId
  }));
}

// Handle room join
async function handleJoinRoom(ws: WebSocket, message: any) {
  const { playerId, roomId } = message;
  
  const player = players.get(playerId);
  if (!player) {
    ws.send(JSON.stringify({
      type: "error",
      message: "Player not found"
    }));
    return;
  }
  
  let room = rooms.get(roomId);
  
  // Create room if it doesn't exist
  if (!room) {
    room = {
      id: roomId,
      gameType: "75ball",
      stake: 25,
      players: new Set(),
      admin: null,
      active: false,
      calledNumbers: [],
      winners: [],
      createdAt: new Date()
    };
    rooms.set(roomId, room);
  }
  
  // Check if room is full
  if (room.players.size >= 90) {
    ws.send(JSON.stringify({
      type: "error",
      message: "Room is full"
    }));
    return;
  }
  
  // Add player to room
  room.players.add(playerId);
  player.roomId = roomId;
  player.socket = ws;
  
  // Notify room
  broadcastToRoom(roomId, {
    type: "player_joined",
    playerId,
    name: player.name
  });
  
  // Send room info to player
  ws.send(JSON.stringify({
    type: "room_joined",
    roomId,
    gameType: room.gameType,
    stake: room.stake,
    playerCount: room.players.size,
    players: Array.from(room.players).map(pId => {
      const p = players.get(pId);
      return { id: pId, name: p?.name };
    })
  }));
}

// Handle room leave
async function handleLeaveRoom(ws: WebSocket, message: any) {
  const { playerId, roomId } = message;
  
  const player = players.get(playerId);
  const room = rooms.get(roomId);
  
  if (!player || !room) {
    return;
  }
  
  // Remove player from room
  room.players.delete(playerId);
  player.roomId = null;
  
  // Delete room if empty
  if (room.players.size === 0) {
    rooms.delete(roomId);
  } else {
    // Notify remaining players
    broadcastToRoom(roomId, {
      type: "player_left",
      playerId
    });
  }
  
  ws.send(JSON.stringify({
    type: "room_left",
    roomId
  }));
}

// Handle game start
async function handleStartGame(ws: WebSocket, message: any) {
  const { roomId, gameType, stake } = message;
  
  const room = rooms.get(roomId);
  if (!room) {
    ws.send(JSON.stringify({
      type: "error",
      message: "Room not found"
    }));
    return;
  }
  
  // Only admin can start game
  if (!ws.isAdmin) {
    ws.send(JSON.stringify({
      type: "error",
      message: "Admin only action"
    }));
    return;
  }
  
  room.active = true;
  room.gameType = gameType;
  room.stake = stake;
  room.calledNumbers = [];
  room.winners = [];
  room.admin = ws;
  
  // Notify all players in room
  broadcastToRoom(roomId, {
    type: "game_started",
    gameType,
    stake,
    timestamp: new Date().toISOString()
  });
  
  // Notify admin
  ws.send(JSON.stringify({
    type: "game_started",
    roomId,
    playerCount: room.players.size
  }));
}

// Handle number called
async function handleNumberCalled(ws: WebSocket, message: any) {
  const { roomId, number } = message;
  
  const room = rooms.get(roomId);
  if (!room || !room.active) {
    return;
  }
  
  // Only admin can call numbers
  if (!ws.isAdmin) {
    return;
  }
  
  // Add to called numbers
  room.calledNumbers.push(number);
  
  // Broadcast to room
  broadcastToRoom(roomId, {
    type: "number_called",
    number,
    timestamp: new Date().toISOString()
  });
}

// Handle number mark
async function handleMark(ws: WebSocket, message: any) {
  const { playerId, number, marked } = message;
  
  const player = players.get(playerId);
  if (!player) {
    return;
  }
  
  if (marked) {
    player.markedNumbers.add(number);
  } else {
    player.markedNumbers.delete(number);
  }
  
  // Notify admin if in room
  if (player.roomId) {
    const room = rooms.get(player.roomId);
    if (room && room.admin) {
      sendToClient(room.admin, {
        type: "player_marked",
        playerId,
        number,
        marked
      });
    }
  }
}

// Handle win announcement
async function handleWin(ws: WebSocket, message: any) {
  const { playerId, pattern, amount } = message;
  
  const player = players.get(playerId);
  if (!player || !player.roomId) {
    ws.send(JSON.stringify({
      type: "error",
      message: "Player not in room"
    }));
    return;
  }
  
  const room = rooms.get(player.roomId);
  if (!room || !room.active) {
    ws.send(JSON.stringify({
      type: "error",
      message: "Game not active"
    }));
    return;
  }
  
  // Verify win (simplified)
  const isValidWin = verifyWin(player, pattern, room);
  
  if (isValidWin) {
    // Add to winners
    room.winners.push({
      playerId,
      name: player.name,
      pattern,
      amount,
      timestamp: new Date()
    });
    
    // Update player balance
    player.wonAmount = (player.wonAmount || 0) + amount;
    player.balance = (player.balance || 0) + amount;
    
    // Broadcast win
    broadcastToRoom(room.id, {
      type: "win_announced",
      winnerId: playerId,
      winnerName: player.name,
      pattern,
      amount,
      timestamp: new Date().toISOString()
    });
    
    // Notify admin
    if (room.admin) {
      sendToClient(room.admin, {
        type: "player_won",
        playerId,
        name: player.name,
        pattern,
        amount
      });
    }
    
    // Send confirmation to winner
    ws.send(JSON.stringify({
      type: "win_confirmed",
      pattern,
      amount,
      balance: player.balance
    }));
  } else {
    ws.send(JSON.stringify({
      type: "error",
      message: "Invalid win claim"
    }));
  }
}

// Handle chat messages
async function handleChat(ws: WebSocket, message: any) {
  const { playerId, roomId, text } = message;
  
  const player = players.get(playerId);
  const room = rooms.get(roomId);
  
  if (!player || !room) {
    return;
  }
  
  broadcastToRoom(roomId, {
    type: "chat_message",
    playerId,
    playerName: player.name,
    text,
    timestamp: new Date().toISOString()
  });
}

// Handle payment
async function handlePayment(ws: WebSocket, message: any) {
  const { playerId, amount } = message;
  
  const player = players.get(playerId);
  if (!player) {
    return;
  }
  
  player.payment = (player.payment || 0) + amount;
  player.balance = (player.balance || 0) + amount;
  
  // Notify admin
  broadcastToAdmins({
    type: "player_paid",
    playerId,
    name: player.name,
    amount,
    totalPayment: player.payment
  });
  
  ws.send(JSON.stringify({
    type: "payment_confirmed",
    amount,
    balance: player.balance
  }));
}

// Handle withdrawal
async function handleWithdraw(ws: WebSocket, message: any) {
  const { playerId, amount, accountNumber } = message;
  
  const player = players.get(playerId);
  if (!player) {
    ws.send(JSON.stringify({
      type: "error",
      message: "Player not found"
    }));
    return;
  }
  
  if (amount > (player.balance || 0)) {
    ws.send(JSON.stringify({
      type: "error",
      message: "Insufficient balance"
    }));
    return;
  }
  
  // Process withdrawal (simplified)
  player.balance = (player.balance || 0) - amount;
  player.withdrawn = (player.withdrawn || 0) + amount;
  
  // Notify admin
  broadcastToAdmins({
    type: "withdrawal_request",
    playerId,
    name: player.name,
    amount,
    accountNumber,
    newBalance: player.balance
  });
  
  ws.send(JSON.stringify({
    type: "withdrawal_processing",
    amount,
    newBalance: player.balance
  }));
}

// Handle admin commands
async function handleAdminCommand(ws: WebSocket, message: any) {
  if (!ws.isAdmin) {
    ws.send(JSON.stringify({
      type: "error",
      message: "Admin only action"
    }));
    return;
  }
  
  const { command, data } = message;
  
  switch (command) {
    case "broadcast":
      handleAdminBroadcast(ws, data);
      break;
    
    case "kick_player":
      handleKickPlayer(ws, data);
      break;
    
    case "get_stats":
      handleGetStats(ws);
      break;
    
    case "get_players":
      handleGetPlayers(ws, data);
      break;
    
    default:
      ws.send(JSON.stringify({
        type: "error",
        message: "Unknown admin command"
      }));
  }
}

// Handle ping
function handlePing(ws: WebSocket, message: any) {
  ws.lastPing = Date.now();
  ws.send(JSON.stringify({
    type: "pong",
    timestamp: message.timestamp
  }));
}

// Handle pong
function handlePong(ws: WebSocket, message: any) {
  ws.lastPong = Date.now();
}

// Handle WebSocket close
function handleWebSocketClose(ws: WebSocket) {
  const playerId = ws.playerId;
  
  if (ws.isAdmin) {
    adminConnections.delete(ws);
    return;
  }
  
  if (!playerId) {
    return;
  }
  
  const player = players.get(playerId);
  if (!player) {
    return;
  }
  
  // Remove from room
  if (player.roomId) {
    const room = rooms.get(player.roomId);
    if (room) {
      room.players.delete(playerId);
      
      // Notify room
      broadcastToRoom(room.id, {
        type: "player_left",
        playerId
      });
      
      // Delete room if empty
      if (room.players.size === 0) {
        rooms.delete(room.id);
      }
    }
  }
  
  // Remove player
  players.delete(playerId);
  
  // Notify admin
  broadcastToAdmins({
    type: "player_disconnected",
    playerId,
    name: player.name
  });
}

// Helper function: Verify win
function verifyWin(player: Player, pattern: string, room: Room): boolean {
  // Simplified win verification
  // In production, implement proper win checking logic
  const requiredNumbers = getRequiredNumbersForPattern(pattern, room.gameType);
  const hasAllNumbers = requiredNumbers.every(num => player.markedNumbers.has(num));
  
  return hasAllNumbers;
}

// Helper function: Get required numbers for pattern
function getRequiredNumbersForPattern(pattern: string, gameType: string): number[] {
  // Simplified - return dummy numbers
  // In production, implement proper pattern checking
  return [1, 2, 3, 4, 5];
}

// Helper function: Broadcast to admins
function broadcastToAdmins(message: any) {
  const messageStr = JSON.stringify(message);
  adminConnections.forEach(admin => {
    if (admin.readyState === 1) { // OPEN
      admin.send(messageStr);
    }
  });
}

// Start server
console.log(`Bingo server starting on port ${PORT}...`);
await app.listen({ port: parseInt(PORT) });