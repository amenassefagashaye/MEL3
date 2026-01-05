import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";

// Types and interfaces
interface Player {
  id: string;
  name: string;
  phone: string;
  stake: number;
  gameType: string;
  payment: number;
  joinedAt: Date;
  socket: WebSocket | null;
  roomId: string | null;
  markedNumbers: Set<number>;
  balance: number;
  wonAmount?: number;
  withdrawn?: number;
  lastPing?: number;
  lastPong?: number;
  isAdmin?: boolean;
  adminToken?: string;
  deviceInfo?: any;
}

interface Room {
  id: string;
  gameType: string;
  stake: number;
  players: Set<string>;
  admin: WebSocket | null;
  active: boolean;
  calledNumbers: number[];
  winners: Array<{
    playerId: string;
    name: string;
    pattern: string;
    amount: number;
    timestamp: Date;
  }>;
  createdAt: Date;
  adminSocket?: WebSocket;
}

interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

interface WebSocketWithId extends WebSocket {
  playerId?: string;
  isAdmin?: boolean;
  lastPing?: number;
  lastPong?: number;
  deviceInfo?: any;
}

// Load environment variables
const PORT = Deno.env.get("PORT") || "8000";
const ADMIN_PASSWORD = Deno.env.get("ADMIN_PASSWORD") || "asse2123";
const SECRET_KEY = Deno.env.get("SECRET_KEY") || "assefa_gashaye_bingo_secret_2024";

// Game state
const rooms = new Map<string, Room>();
const players = new Map<string, Player>();
const adminConnections = new Set<WebSocketWithId>();

// Helper functions
function broadcastToRoom(roomId: string, message: WebSocketMessage): void {
  const room = rooms.get(roomId);
  if (!room) return;

  const messageStr = JSON.stringify(message);
  
  room.players.forEach(playerId => {
    const player = players.get(playerId);
    if (player?.socket?.readyState === WebSocket.OPEN) {
      try {
        player.socket.send(messageStr);
      } catch (error) {
        console.error(`Error sending to player ${playerId}:`, error);
      }
    }
  });

  // Also send to admin if in room
  if (room.admin?.readyState === WebSocket.OPEN) {
    try {
      room.admin.send(messageStr);
    } catch (error) {
      console.error('Error sending to admin:', error);
    }
  }
}

function sendToClient(ws: WebSocket | null, message: WebSocketMessage): boolean {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return false;
  }
  
  try {
    ws.send(JSON.stringify(message));
    return true;
  } catch (error) {
    console.error('Error sending to client:', error);
    return false;
  }
}

function broadcastToAdmins(message: WebSocketMessage): void {
  const messageStr = JSON.stringify(message);
  
  adminConnections.forEach(admin => {
    if (admin.readyState === WebSocket.OPEN) {
      try {
        admin.send(messageStr);
      } catch (error) {
        console.error('Error sending to admin:', error);
      }
    }
  });
}

function validateAdminToken(token: string): boolean {
  try {
    const decoded = atob(token);
    const parts = decoded.split(':');
    if (parts.length !== 3) return false;
    
    const timestamp = parseInt(parts[0]);
    const secret = parts[1];
    const role = parts[2];
    
    // Check if token is expired (24 hours)
    if (Date.now() - timestamp > 24 * 60 * 60 * 1000) {
      return false;
    }
    
    return secret === SECRET_KEY && role === 'admin';
  } catch {
    return false;
  }
}

function generateAdminToken(): string {
  return btoa(`${Date.now()}:${SECRET_KEY}:admin`);
}

function generatePlayerId(name: string, phone: string): string {
  const timestamp = Date.now().toString(36);
  const namePart = name.substring(0, 3).toUpperCase();
  const phonePart = phone.substring(phone.length - 4);
  return `PLAYER_${namePart}_${phonePart}_${timestamp}`;
}

function cleanupInactivePlayers(): void {
  const now = Date.now();
  const inactiveTimeout = 5 * 60 * 1000; // 5 minutes
  
  players.forEach((player, playerId) => {
    if (player.lastPong && now - player.lastPong > inactiveTimeout) {
      // Player is inactive, disconnect them
      if (player.socket?.readyState === WebSocket.OPEN) {
        player.socket.close(1001, 'Inactive');
      }
      handlePlayerDisconnect(playerId);
    }
  });
}

function handlePlayerDisconnect(playerId: string): void {
  const player = players.get(playerId);
  if (!player) return;

  // Remove from room
  if (player.roomId) {
    const room = rooms.get(player.roomId);
    if (room) {
      room.players.delete(playerId);
      
      // Notify room
      broadcastToRoom(room.id, {
        type: 'player_left',
        playerId,
        timestamp: new Date().toISOString()
      });

      // Delete room if empty
      if (room.players.size === 0) {
        rooms.delete(room.id);
      }
    }
  }

  // Notify admins
  broadcastToAdmins({
    type: 'player_disconnected',
    playerId,
    name: player.name,
    timestamp: new Date().toISOString()
  });

  // Remove player
  players.delete(playerId);
}

// Start cleanup interval
setInterval(cleanupInactivePlayers, 60000); // Check every minute

// Create application
const app = new Application();
const router = new Router();

// Middleware
app.use(oakCors());
app.use(router.routes());
app.use(router.allowedMethods());

// Logger middleware
app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  console.log(`${ctx.request.method} ${ctx.request.url.pathname} - ${ms}ms`);
});

// Health check endpoint
router.get("/health", (ctx) => {
  ctx.response.body = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    stats: {
      totalPlayers: players.size,
      totalRooms: rooms.size,
      activeAdmins: adminConnections.size
    }
  };
});

// Admin authentication endpoint
router.post("/admin/login", async (ctx) => {
  try {
    const body = await ctx.request.body({ type: 'json' }).value;
    const { password } = body;
    
    if (!password) {
      ctx.response.status = 400;
      ctx.response.body = { 
        success: false, 
        message: "Password is required" 
      };
      return;
    }
    
    if (password === ADMIN_PASSWORD) {
      const token = generateAdminToken();
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
    console.error('Admin login error:', error);
    ctx.response.status = 400;
    ctx.response.body = { 
      success: false, 
      message: "Invalid request format" 
    };
  }
});

// Get game statistics
router.get("/stats", async (ctx) => {
  const token = ctx.request.headers.get("authorization")?.replace("Bearer ", "");
  
  if (!token || !validateAdminToken(token)) {
    ctx.response.status = 401;
    ctx.response.body = { 
      success: false, 
      message: "Invalid or missing admin token" 
    };
    return;
  }
  
  const stats = {
    totalRooms: rooms.size,
    totalPlayers: players.size,
    activeGames: Array.from(rooms.values()).filter(room => room.active).length,
    totalRevenue: Array.from(players.values())
      .reduce((sum, player) => sum + (player.payment || 0), 0),
    totalWinnings: Array.from(players.values())
      .reduce((sum, player) => sum + (player.wonAmount || 0), 0),
    totalWithdrawals: Array.from(players.values())
      .reduce((sum, player) => sum + (player.withdrawn || 0), 0),
    activeAdmins: adminConnections.size
  };
  
  ctx.response.body = { success: true, stats };
});

// Get room information
router.get("/room/:roomId", async (ctx) => {
  const playerId = ctx.request.headers.get("x-player-id");
  
  if (!playerId) {
    ctx.response.status = 401;
    ctx.response.body = { success: false, message: "Player ID required" };
    return;
  }
  
  const { roomId } = ctx.params;
  const room = rooms.get(roomId);
  
  if (!room) {
    ctx.response.status = 404;
    ctx.response.body = { success: false, message: "Room not found" };
    return;
  }
  
  // Check if player is in room
  const player = players.get(playerId);
  if (!player || player.roomId !== roomId) {
    ctx.response.status = 403;
    ctx.response.body = { success: false, message: "Not a member of this room" };
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
      winners: room.winners.slice(-10), // Last 10 winners
      createdAt: room.createdAt
    }
  };
});

// WebSocket upgrade handler
router.get("/ws", async (ctx) => {
  if (!ctx.isUpgradable) {
    ctx.response.status = 501;
    ctx.response.body = { error: "WebSocket not supported" };
    return;
  }
  
  const socket = await ctx.upgrade();
  const ws = socket as WebSocketWithId;
  
  console.log('New WebSocket connection');
  
  // Set up event handlers
  ws.addEventListener("message", async (event) => {
    try {
      await handleWebSocketMessage(ws, event.data);
    } catch (error) {
      console.error("Error handling WebSocket message:", error);
      sendToClient(ws, {
        type: "error",
        message: "Internal server error",
        timestamp: new Date().toISOString()
      });
    }
  });
  
  ws.addEventListener("close", () => {
    handleWebSocketClose(ws);
  });
  
  ws.addEventListener("error", (error) => {
    console.error("WebSocket error:", error);
    handleWebSocketClose(ws);
  });
});

// Handle WebSocket messages
async function handleWebSocketMessage(ws: WebSocketWithId, data: string) {
  let message: WebSocketMessage;
  
  try {
    message = JSON.parse(data);
  } catch (error) {
    console.error('Error parsing WebSocket message:', error);
    sendToClient(ws, {
      type: "error",
      message: "Invalid message format",
      timestamp: new Date().toISOString()
    });
    return;
  }
  
  if (!message.type) {
    sendToClient(ws, {
      type: "error",
      message: "Message type is required",
      timestamp: new Date().toISOString()
    });
    return;
  }
  
  console.log(`Processing message type: ${message.type}`);
  
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
      sendToClient(ws, {
        type: "error",
        message: `Unknown message type: ${message.type}`,
        timestamp: new Date().toISOString()
      });
  }
}

// Handle hello message
async function handleHello(ws: WebSocketWithId, message: WebSocketMessage) {
  const { playerId, isAdmin, token, deviceInfo } = message;
  
  if (isAdmin && token) {
    // Admin authentication
    if (!validateAdminToken(token)) {
      sendToClient(ws, {
        type: "error",
        message: "Invalid admin token",
        timestamp: new Date().toISOString()
      });
      ws.close(1008, "Invalid admin token");
      return;
    }
    
    ws.isAdmin = true;
    ws.playerId = `admin_${Date.now()}`;
    adminConnections.add(ws);
    
    console.log('Admin connected:', ws.playerId);
    
    sendToClient(ws, {
      type: "welcome",
      message: "Admin connected successfully",
      playerId: ws.playerId,
      timestamp: new Date().toISOString()
    });
    
    // Send current stats to admin
    sendToClient(ws, {
      type: "stats",
      stats: {
        totalPlayers: players.size,
        totalRooms: rooms.size,
        activeGames: Array.from(rooms.values()).filter(room => room.active).length
      },
      timestamp: new Date().toISOString()
    });
    
  } else {
    // Player connection
    ws.playerId = playerId;
    ws.deviceInfo = deviceInfo;
    
    // Check if player exists
    const player = players.get(playerId);
    if (player) {
      // Update socket for existing player
      player.socket = ws;
      player.lastPong = Date.now();
      
      sendToClient(ws, {
        type: "welcome",
        message: "Reconnected successfully",
        playerId,
        balance: player.balance,
        timestamp: new Date().toISOString()
      });
      
      // If player was in a room, notify room
      if (player.roomId) {
        const room = rooms.get(player.roomId);
        if (room) {
          sendToClient(ws, {
            type: "room_joined",
            roomId: room.id,
            gameType: room.gameType,
            stake: room.stake,
            playerCount: room.players.size,
            active: room.active,
            calledNumbers: room.calledNumbers,
            timestamp: new Date().toISOString()
          });
        }
      }
    } else {
      // New player
      sendToClient(ws, {
        type: "welcome",
        message: "Connected to bingo server. Please register to play.",
        playerId,
        timestamp: new Date().toISOString()
      });
    }
  }
}

// Handle player registration
async function handleRegister(ws: WebSocketWithId, message: WebSocketMessage) {
  const { playerId, name, phone, stake, gameType, payment } = message;
  
  // Validate input
  if (!name || !phone || !stake || !gameType) {
    sendToClient(ws, {
      type: "error",
      message: "Missing required fields: name, phone, stake, gameType",
      timestamp: new Date().toISOString()
    });
    return;
  }
  
  if (typeof stake !== 'number' || stake <= 0) {
    sendToClient(ws, {
      type: "error",
      message: "Invalid stake amount",
      timestamp: new Date().toISOString()
    });
    return;
  }
  
  // Check if player already exists
  if (players.has(playerId)) {
    sendToClient(ws, {
      type: "error",
      message: "Player already registered",
      timestamp: new Date().toISOString()
    });
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
    balance: payment || 0,
    lastPong: Date.now()
  };
  
  players.set(playerId, player);
  ws.playerId = playerId;
  
  // Notify admins
  broadcastToAdmins({
    type: "player_joined",
    playerId,
    name,
    phone,
    stake,
    gameType,
    payment: player.payment,
    timestamp: new Date().toISOString()
  });
  
  sendToClient(ws, {
    type: "registration_success",
    message: "Registration successful",
    playerId,
    balance: player.balance,
    timestamp: new Date().toISOString()
  });
  
  console.log(`Player registered: ${name} (${playerId})`);
}

// Handle room join
async function handleJoinRoom(ws: WebSocketWithId, message: WebSocketMessage) {
  const { playerId, roomId } = message;
  
  const player = players.get(playerId);
  if (!player) {
    sendToClient(ws, {
      type: "error",
      message: "Player not found. Please register first.",
      timestamp: new Date().toISOString()
    });
    return;
  }
  
  // Check if player has sufficient balance
  if (player.balance < player.stake) {
    sendToClient(ws, {
      type: "error",
      message: "Insufficient balance to join room",
      timestamp: new Date().toISOString()
    });
    return;
  }
  
  let room = rooms.get(roomId);
  
  // Create room if it doesn't exist
  if (!room) {
    room = {
      id: roomId,
      gameType: player.gameType,
      stake: player.stake,
      players: new Set(),
      admin: null,
      active: false,
      calledNumbers: [],
      winners: [],
      createdAt: new Date()
    };
    rooms.set(roomId, room);
    console.log(`Room created: ${roomId}`);
  }
  
  // Check if room is full
  if (room.players.size >= 90) {
    sendToClient(ws, {
      type: "error",
      message: "Room is full",
      timestamp: new Date().toISOString()
    });
    return;
  }
  
  // Check if game type matches
  if (room.gameType !== player.gameType) {
    sendToClient(ws, {
      type: "error",
      message: `Room game type (${room.gameType}) doesn't match your selected game type (${player.gameType})`,
      timestamp: new Date().toISOString()
    });
    return;
  }
  
  // Check if stake matches
  if (room.stake !== player.stake) {
    sendToClient(ws, {
      type: "error",
      message: `Room stake (${room.stake}) doesn't match your selected stake (${player.stake})`,
      timestamp: new Date().toISOString()
    });
    return;
  }
  
  // Add player to room
  room.players.add(playerId);
  player.roomId = roomId;
  player.socket = ws;
  
  // Deduct stake from balance
  player.balance -= player.stake;
  
  // Notify room
  broadcastToRoom(roomId, {
    type: "player_joined",
    playerId,
    name: player.name,
    playerCount: room.players.size,
    timestamp: new Date().toISOString()
  });
  
  // Send room info to player
  sendToClient(ws, {
    type: "room_joined",
    roomId,
    gameType: room.gameType,
    stake: room.stake,
    playerCount: room.players.size,
    players: Array.from(room.players).map(pId => {
      const p = players.get(pId);
      return { id: pId, name: p?.name };
    }),
    active: room.active,
    calledNumbers: room.calledNumbers,
    balance: player.balance,
    timestamp: new Date().toISOString()
  });
  
  console.log(`Player ${player.name} joined room ${roomId}`);
}

// Handle room leave
async function handleLeaveRoom(ws: WebSocketWithId, message: WebSocketMessage) {
  const { playerId, roomId } = message;
  
  const player = players.get(playerId);
  const room = rooms.get(roomId);
  
  if (!player || !room) {
    return;
  }
  
  // Refund stake if game hasn't started
  if (!room.active) {
    player.balance += player.stake;
  }
  
  // Remove player from room
  room.players.delete(playerId);
  player.roomId = null;
  
  // Delete room if empty
  if (room.players.size === 0) {
    rooms.delete(roomId);
    console.log(`Room deleted: ${roomId}`);
  } else {
    // Notify remaining players
    broadcastToRoom(roomId, {
      type: "player_left",
      playerId,
      playerCount: room.players.size,
      timestamp: new Date().toISOString()
    });
  }
  
  sendToClient(ws, {
    type: "room_left",
    roomId,
    balance: player.balance,
    timestamp: new Date().toISOString()
  });
  
  console.log(`Player ${player.name} left room ${roomId}`);
}

// Handle game start
async function handleStartGame(ws: WebSocketWithId, message: WebSocketMessage) {
  const { roomId, gameType, stake } = message;
  
  const room = rooms.get(roomId);
  if (!room) {
    sendToClient(ws, {
      type: "error",
      message: "Room not found",
      timestamp: new Date().toISOString()
    });
    return;
  }
  
  // Only admin can start game
  if (!ws.isAdmin) {
    sendToClient(ws, {
      type: "error",
      message: "Admin only action",
      timestamp: new Date().toISOString()
    });
    return;
  }
  
  // Check if game is already active
  if (room.active) {
    sendToClient(ws, {
      type: "error",
      message: "Game is already active",
      timestamp: new Date().toISOString()
    });
    return;
  }
  
  // Check minimum players
  if (room.players.size < 2) {
    sendToClient(ws, {
      type: "error",
      message: "Need at least 2 players to start",
      timestamp: new Date().toISOString()
    });
    return;
  }
  
  room.active = true;
  room.gameType = gameType || room.gameType;
  room.stake = stake || room.stake;
  room.calledNumbers = [];
  room.winners = [];
  room.admin = ws;
  
  // Notify all players in room
  broadcastToRoom(roomId, {
    type: "game_started",
    gameType: room.gameType,
    stake: room.stake,
    playerCount: room.players.size,
    timestamp: new Date().toISOString()
  });
  
  // Notify admin
  sendToClient(ws, {
    type: "game_started",
    roomId,
    playerCount: room.players.size,
    timestamp: new Date().toISOString()
  });
  
  console.log(`Game started in room ${roomId}`);
}

// Handle number called
async function handleNumberCalled(ws: WebSocketWithId, message: WebSocketMessage) {
  const { roomId, number } = message;
  
  const room = rooms.get(roomId);
  if (!room || !room.active) {
    sendToClient(ws, {
      type: "error",
      message: "Game not active",
      timestamp: new Date().toISOString()
    });
    return;
  }
  
  // Only admin can call numbers
  if (!ws.isAdmin) {
    sendToClient(ws, {
      type: "error",
      message: "Admin only action",
      timestamp: new Date().toISOString()
    });
    return;
  }
  
  // Validate number based on game type
  let maxNumber = 75;
  if (room.gameType === '90ball') maxNumber = 90;
  else if (room.gameType === '30ball') maxNumber = 30;
  else if (room.gameType === '50ball') maxNumber = 50;
  
  if (typeof number !== 'number' || number < 1 || number > maxNumber) {
    sendToClient(ws, {
      type: "error",
      message: `Invalid number. Must be between 1 and ${maxNumber}`,
      timestamp: new Date().toISOString()
    });
    return;
  }
  
  // Check if number already called
  if (room.calledNumbers.includes(number)) {
    sendToClient(ws, {
      type: "error",
      message: "Number already called",
      timestamp: new Date().toISOString()
    });
    return;
  }
  
  // Add to called numbers
  room.calledNumbers.push(number);
  
  // Broadcast to room
  broadcastToRoom(roomId, {
    type: "number_called",
    number,
    totalCalled: room.calledNumbers.length,
    timestamp: new Date().toISOString()
  });
  
  console.log(`Number called in room ${roomId}: ${number}`);
}

// Handle number mark
async function handleMark(ws: WebSocketWithId, message: WebSocketMessage) {
  const { playerId, number, marked } = message;
  
  const player = players.get(playerId);
  if (!player) {
    return;
  }
  
  // Validate player is in an active room
  if (!player.roomId) {
    sendToClient(ws, {
      type: "error",
      message: "Not in a room",
      timestamp: new Date().toISOString()
    });
    return;
  }
  
  const room = rooms.get(player.roomId);
  if (!room || !room.active) {
    sendToClient(ws, {
      type: "error",
      message: "Game not active",
      timestamp: new Date().toISOString()
    });
    return;
  }
  
  // Validate number
  if (typeof number !== 'number' || number < 1) {
    sendToClient(ws, {
      type: "error",
      message: "Invalid number",
      timestamp: new Date().toISOString()
    });
    return;
  }
  
  if (marked) {
    player.markedNumbers.add(number);
  } else {
    player.markedNumbers.delete(number);
  }
  
  // Notify admin if in room
  if (room.admin) {
    sendToClient(room.admin, {
      type: "player_marked",
      playerId,
      name: player.name,
      number,
      marked,
      totalMarked: player.markedNumbers.size,
      timestamp: new Date().toISOString()
    });
  }
  
  // Send confirmation to player
  sendToClient(ws, {
    type: "mark_confirmed",
    number,
    marked,
    totalMarked: player.markedNumbers.size,
    timestamp: new Date().toISOString()
  });
}

// Handle win announcement
async function handleWin(ws: WebSocketWithId, message: WebSocketMessage) {
  const { playerId, pattern, amount } = message;
  
  const player = players.get(playerId);
  if (!player || !player.roomId) {
    sendToClient(ws, {
      type: "error",
      message: "Player not in room",
      timestamp: new Date().toISOString()
    });
    return;
  }
  
  const room = rooms.get(player.roomId);
  if (!room || !room.active) {
    sendToClient(ws, {
      type: "error",
      message: "Game not active",
      timestamp: new Date().toISOString()
    });
    return;
  }
  
  // Verify win (simplified - in production implement proper verification)
  const isValidWin = verifyWin(player, pattern, room);
  
  if (!isValidWin) {
    sendToClient(ws, {
      type: "error",
      message: "Invalid win claim",
      timestamp: new Date().toISOString()
    });
    return;
  }
  
  // Calculate win amount if not provided
  const winAmount = amount || calculateWinAmount(room, pattern);
  
  // Add to winners
  room.winners.push({
    playerId,
    name: player.name,
    pattern,
    amount: winAmount,
    timestamp: new Date()
  });
  
  // Update player balance
  player.wonAmount = (player.wonAmount || 0) + winAmount;
  player.balance = (player.balance || 0) + winAmount;
  
  // Broadcast win
  broadcastToRoom(room.id, {
    type: "win_announced",
    winnerId: playerId,
    winnerName: player.name,
    pattern,
    amount: winAmount,
    timestamp: new Date().toISOString()
  });
  
  // Notify admin
  if (room.admin) {
    sendToClient(room.admin, {
      type: "player_won",
      playerId,
      name: player.name,
      pattern,
      amount: winAmount,
      timestamp: new Date().toISOString()
    });
  }
  
  // Send confirmation to winner
  sendToClient(ws, {
    type: "win_confirmed",
    pattern,
    amount: winAmount,
    balance: player.balance,
    timestamp: new Date().toISOString()
  });
  
  console.log(`Player ${player.name} won ${winAmount} in room ${room.id}`);
}

// Handle chat messages
async function handleChat(ws: WebSocketWithId, message: WebSocketMessage) {
  const { playerId, roomId, text } = message;
  
  const player = players.get(playerId);
  const room = rooms.get(roomId);
  
  if (!player || !room) {
    return;
  }
  
  // Validate message
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    sendToClient(ws, {
      type: "error",
      message: "Invalid message",
      timestamp: new Date().toISOString()
    });
    return;
  }
  
  if (text.length > 500) {
    sendToClient(ws, {
      type: "error",
      message: "Message too long (max 500 characters)",
      timestamp: new Date().toISOString()
    });
    return;
  }
  
  broadcastToRoom(roomId, {
    type: "chat_message",
    playerId,
    playerName: player.name,
    text: text.trim(),
    timestamp: new Date().toISOString()
  });
}

// Handle payment
async function handlePayment(ws: WebSocketWithId, message: WebSocketMessage) {
  const { playerId, amount } = message;
  
  const player = players.get(playerId);
  if (!player) {
    return;
  }
  
  // Validate amount
  if (typeof amount !== 'number' || amount <= 0) {
    sendToClient(ws, {
      type: "error",
      message: "Invalid amount",
      timestamp: new Date().toISOString()
    });
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
    totalPayment: player.payment,
    newBalance: player.balance,
    timestamp: new Date().toISOString()
  });
  
  sendToClient(ws, {
    type: "payment_confirmed",
    amount,
    balance: player.balance,
    timestamp: new Date().toISOString()
  });
  
  console.log(`Payment from ${player.name}: ${amount}`);
}

// Handle withdrawal
async function handleWithdraw(ws: WebSocketWithId, message: WebSocketMessage) {
  const { playerId, amount, accountNumber } = message;
  
  const player = players.get(playerId);
  if (!player) {
    sendToClient(ws, {
      type: "error",
      message: "Player not found",
      timestamp: new Date().toISOString()
    });
    return;
  }
  
  // Validate amount
  if (typeof amount !== 'number' || amount <= 0) {
    sendToClient(ws, {
      type: "error",
      message: "Invalid amount",
      timestamp: new Date().toISOString()
    });
    return;
  }
  
  if (amount > (player.balance || 0)) {
    sendToClient(ws, {
      type: "error",
      message: "Insufficient balance",
      timestamp: new Date().toISOString()
    });
    return;
  }
  
  // Validate account number
  if (!accountNumber || typeof accountNumber !== 'string' || accountNumber.trim().length < 5) {
    sendToClient(ws, {
      type: "error",
      message: "Invalid account number",
      timestamp: new Date().toISOString()
    });
    return;
  }
  
  // Process withdrawal
  player.balance = (player.balance || 0) - amount;
  player.withdrawn = (player.withdrawn || 0) + amount;
  
  // Notify admin
  broadcastToAdmins({
    type: "withdrawal_request",
    playerId,
    name: player.name,
    amount,
    accountNumber: accountNumber.trim(),
    newBalance: player.balance,
    timestamp: new Date().toISOString()
  });
  
  sendToClient(ws, {
    type: "withdrawal_processing",
    amount,
    newBalance: player.balance,
    timestamp: new Date().toISOString()
  });
  
  console.log(`Withdrawal request from ${player.name}: ${amount}`);
}

// Handle admin commands
async function handleAdminCommand(ws: WebSocketWithId, message: WebSocketMessage) {
  if (!ws.isAdmin) {
    sendToClient(ws, {
      type: "error",
      message: "Admin only action",
      timestamp: new Date().toISOString()
    });
    return;
  }
  
  const { command, data } = message;
  
  switch (command) {
    case "broadcast":
      await handleAdminBroadcast(ws, data);
      break;
    
    case "kick_player":
      await handleKickPlayer(ws, data);
      break;
    
    case "get_stats":
      await handleGetStats(ws);
      break;
    
    case "get_players":
      await handleGetPlayers(ws, data);
      break;
    
    case "end_game":
      await handleEndGame(ws, data);
      break;
    
    case "reset_room":
      await handleResetRoom(ws, data);
      break;
    
    default:
      sendToClient(ws, {
        type: "error",
        message: "Unknown admin command",
        timestamp: new Date().toISOString()
      });
  }
}

// Handle ping
function handlePing(ws: WebSocketWithId, message: WebSocketMessage) {
  ws.lastPing = Date.now();
  
  sendToClient(ws, {
    type: "pong",
    timestamp: message.timestamp || Date.now(),
    serverTime: Date.now()
  });
}

// Handle pong
function handlePong(ws: WebSocketWithId, message: WebSocketMessage) {
  ws.lastPong = Date.now();
  
  // Update player's last pong if applicable
  if (ws.playerId && !ws.isAdmin) {
    const player = players.get(ws.playerId);
    if (player) {
      player.lastPong = Date.now();
    }
  }
}

// Handle WebSocket close
function handleWebSocketClose(ws: WebSocketWithId) {
  const playerId = ws.playerId;
  
  if (ws.isAdmin) {
    console.log('Admin disconnected');
    adminConnections.delete(ws);
    return;
  }
  
  if (!playerId) {
    return;
  }
  
  console.log(`Player disconnected: ${playerId}`);
  handlePlayerDisconnect(playerId);
}

// Admin command handlers
async function handleAdminBroadcast(ws: WebSocketWithId, data: any) {
  const { message, roomId } = data;
  
  if (!message || typeof message !== 'string') {
    sendToClient(ws, {
      type: "error",
      message: "Invalid broadcast message",
      timestamp: new Date().toISOString()
    });
    return;
  }
  
  if (roomId) {
    // Broadcast to specific room
    broadcastToRoom(roomId, {
      type: "admin_message",
      message: message.trim(),
      timestamp: new Date().toISOString()
    });
  } else {
    // Broadcast to all rooms
    rooms.forEach((room, id) => {
      broadcastToRoom(id, {
        type: "admin_message",
        message: message.trim(),
        timestamp: new Date().toISOString()
      });
    });
  }
  
  sendToClient(ws, {
    type: "admin_command_result",
    command: "broadcast",
    success: true,
    timestamp: new Date().toISOString()
  });
}

async function handleKickPlayer(ws: WebSocketWithId, data: any) {
  const { playerId } = data;
  
  if (!playerId) {
    sendToClient(ws, {
      type: "error",
      message: "Player ID required",
      timestamp: new Date().toISOString()
    });
    return;
  }
  
  const player = players.get(playerId);
  if (!player) {
    sendToClient(ws, {
      type: "error",
      message: "Player not found",
      timestamp: new Date().toISOString()
    });
    return;
  }
  
  // Disconnect player
  if (player.socket?.readyState === WebSocket.OPEN) {
    player.socket.close(1000, "Kicked by admin");
  }
  
  handlePlayerDisconnect(playerId);
  
  sendToClient(ws, {
    type: "admin_command_result",
    command: "kick_player",
    success: true,
    playerId,
    playerName: player.name,
    timestamp: new Date().toISOString()
  });
}

async function handleGetStats(ws: WebSocketWithId) {
  const stats = {
    totalRooms: rooms.size,
    totalPlayers: players.size,
    activeGames: Array.from(rooms.values()).filter(room => room.active).length,
    totalRevenue: Array.from(players.values())
      .reduce((sum, player) => sum + (player.payment || 0), 0),
    totalWinnings: Array.from(players.values())
      .reduce((sum, player) => sum + (player.wonAmount || 0), 0),
    totalWithdrawals: Array.from(players.values())
      .reduce((sum, player) => sum + (player.withdrawn || 0), 0)
  };
  
  sendToClient(ws, {
    type: "stats",
    stats,
    timestamp: new Date().toISOString()
  });
}

async function handleGetPlayers(ws: WebSocketWithId, data: any) {
  const { roomId } = data;
  let playerList;
  
  if (roomId) {
    const room = rooms.get(roomId);
    playerList = room ? Array.from(room.players).map(id => {
      const player = players.get(id)!;
      return {
        id: player.id,
        name: player.name,
        phone: player.phone,
        balance: player.balance,
        markedNumbers: Array.from(player.markedNumbers),
        joinedAt: player.joinedAt
      };
    }) : [];
  } else {
    playerList = Array.from(players.values()).map(player => ({
      id: player.id,
      name: player.name,
      phone: player.phone,
      roomId: player.roomId,
      balance: player.balance,
      payment: player.payment,
      wonAmount: player.wonAmount,
      withdrawn: player.withdrawn,
      joinedAt: player.joinedAt
    }));
  }
  
  sendToClient(ws, {
    type: "players_list",
    players: playerList,
    timestamp: new Date().toISOString()
  });
}

async function handleEndGame(ws: WebSocketWithId, data: any) {
  const { roomId } = data;
  
  if (!roomId) {
    sendToClient(ws, {
      type: "error",
      message: "Room ID required",
      timestamp: new Date().toISOString()
    });
    return;
  }
  
  const room = rooms.get(roomId);
  if (!room) {
    sendToClient(ws, {
      type: "error",
      message: "Room not found",
      timestamp: new Date().toISOString()
    });
    return;
  }
  
  room.active = false;
  
  broadcastToRoom(roomId, {
    type: "game_ended",
    message: "Game has ended",
    timestamp: new Date().toISOString()
  });
  
  sendToClient(ws, {
    type: "admin_command_result",
    command: "end_game",
    success: true,
    roomId,
    timestamp: new Date().toISOString()
  });
}

async function handleResetRoom(ws: WebSocketWithId, data: any) {
  const { roomId } = data;
  
  if (!roomId) {
    sendToClient(ws, {
      type: "error",
      message: "Room ID required",
      timestamp: new Date().toISOString()
    });
    return;
  }
  
  const room = rooms.get(roomId);
  if (!room) {
    sendToClient(ws, {
      type: "error",
      message: "Room not found",
      timestamp: new Date().toISOString()
    });
    return;
  }
  
  room.calledNumbers = [];
  room.winners = [];
  
  // Reset all players' marked numbers in this room
  room.players.forEach(playerId => {
    const player = players.get(playerId);
    if (player) {
      player.markedNumbers.clear();
    }
  });
  
  broadcastToRoom(roomId, {
    type: "room_reset",
    message: "Room has been reset",
    timestamp: new Date().toISOString()
  });
  
  sendToClient(ws, {
    type: "admin_command_result",
    command: "reset_room",
    success: true,
    roomId,
    timestamp: new Date().toISOString()
  });
}

// Helper functions
function verifyWin(player: Player, pattern: string, room: Room): boolean {
  // Simplified win verification
  // In a real implementation, you would verify the actual pattern
  const requiredNumbers = getRequiredNumbersForPattern(pattern, room.gameType);
  const hasAllNumbers = requiredNumbers.every(num => player.markedNumbers.has(num));
  
  return hasAllNumbers && requiredNumbers.length > 0;
}

function getRequiredNumbersForPattern(pattern: string, gameType: string): number[] {
  // Simplified - return sample pattern
  // In production, implement actual pattern verification
  switch (pattern) {
    case 'line':
      return [1, 2, 3, 4, 5];
    case 'two-lines':
      return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    case 'full-house':
      // For demo, require 5 marked numbers
      return [1, 2, 3, 4, 5];
    case 'coverall':
      // For demo, require 10 marked numbers
      return Array.from({length: 10}, (_, i) => i + 1);
    default:
      return [];
  }
}

function calculateWinAmount(room: Room, pattern: string): number {
  const baseAmount = room.stake * room.players.size;
  const multipliers = {
    'line': 3,
    'two-lines': 5,
    'full-house': 10,
    'coverall': 20
  };
  
  const multiplier = multipliers[pattern as keyof typeof multipliers] || 1;
  return Math.floor(baseAmount * multiplier * 0.8); // 80% payout
}

// Error handler middleware
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (error) {
    console.error('Unhandled error:', error);
    ctx.response.status = 500;
    ctx.response.body = {
      success: false,
      message: "Internal server error",
      timestamp: new Date().toISOString()
    };
  }
});

// Start server
console.log(`🚀 Bingo server starting on port ${PORT}...`);
console.log(`📡 WebSocket endpoint: ws://localhost:${PORT}/ws`);
console.log(`🔧 Admin password: ${ADMIN_PASSWORD}`);

await app.listen({ port: parseInt(PORT) });
