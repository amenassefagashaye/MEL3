import { Room, Player, WebSocketClient } from "../models/interfaces.ts";
import { roomModel } from "../models/room.ts";
import { playerModel } from "../models/player.ts";

// Broadcast service for sending messages to players

// Send message to specific client
export function sendToClient(client: WebSocketClient, message: any): boolean {
  if (client.readyState !== 1) { // WebSocket.OPEN
    return false;
  }

  try {
    const messageStr = JSON.stringify(message);
    client.send(messageStr);
    return true;
  } catch (error) {
    console.error("Error sending message to client:", error);
    return false;
  }
}

// Broadcast message to all players in a room
export function broadcastToRoom(roomId: string, message: any): number {
  const room = roomModel.get(roomId);
  if (!room) return 0;

  let sentCount = 0;
  const messageStr = JSON.stringify(message);

  room.players.forEach(playerId => {
    const player = playerModel.get(playerId);
    if (player && player.socket && player.socket.readyState === 1) {
      try {
        player.socket.send(messageStr);
        sentCount++;
      } catch (error) {
        console.error(`Error broadcasting to player ${playerId}:`, error);
      }
    }
  });

  return sentCount;
}

// Broadcast message to all connected players
export function broadcastToAll(message: any): number {
  const allPlayers = playerModel.getAll();
  let sentCount = 0;
  const messageStr = JSON.stringify(message);

  allPlayers.forEach(player => {
    if (player.socket && player.socket.readyState === 1) {
      try {
        player.socket.send(messageStr);
        sentCount++;
      } catch (error) {
        console.error(`Error broadcasting to player ${player.id}:`, error);
      }
    }
  });

  return sentCount;
}

// Broadcast message to all admins
export function broadcastToAdmins(adminSockets: Set<WebSocketClient>, message: any): number {
  let sentCount = 0;
  const messageStr = JSON.stringify(message);

  adminSockets.forEach(admin => {
    if (admin.readyState === 1) {
      try {
        admin.send(messageStr);
        sentCount++;
      } catch (error) {
        console.error("Error broadcasting to admin:", error);
      }
    }
  });

  return sentCount;
}

// Send message to specific player
export function sendToPlayer(playerId: string, message: any): boolean {
  const player = playerModel.get(playerId);
  if (!player || !player.socket || player.socket.readyState !== 1) {
    return false;
  }

  return sendToClient(player.socket, message);
}

// Send message to multiple players
export function sendToPlayers(playerIds: string[], message: any): number {
  let sentCount = 0;

  playerIds.forEach(playerId => {
    if (sendToPlayer(playerId, message)) {
      sentCount++;
    }
  });

  return sentCount;
}

// Broadcast game state update to room
export function broadcastGameState(roomId: string): boolean {
  const room = roomModel.get(roomId);
  if (!room) return false;

  const gameState = {
    type: "game_state",
    roomId,
    gameType: room.gameType,
    stake: room.stake,
    active: room.active,
    calledNumbers: room.calledNumbers,
    winners: room.winners.map(winner => ({
      playerId: winner.playerId,
      name: winner.name,
      pattern: winner.pattern,
      amount: winner.amount
    })),
    playerCount: room.players.size,
    timestamp: new Date().toISOString()
  };

  broadcastToRoom(roomId, gameState);
  return true;
}

// Broadcast number call to room
export function broadcastNumberCall(roomId: string, number: number): boolean {
  const room = roomModel.get(roomId);
  if (!room || !room.active) return false;

  const numberCall = {
    type: "number_called",
    roomId,
    number,
    timestamp: new Date().toISOString()
  };

  broadcastToRoom(roomId, numberCall);
  
  // Also notify admins if needed
  if (room.admin) {
    sendToClient(room.admin, {
      type: "admin_number_called",
      roomId,
      number,
      calledNumbers: room.calledNumbers.length
    });
  }

  return true;
}

// Broadcast winner announcement to room
export function broadcastWinner(roomId: string, winner: any): boolean {
  const room = roomModel.get(roomId);
  if (!room) return false;

  const winnerAnnouncement = {
    type: "winner_announced",
    roomId,
    winnerId: winner.playerId,
    winnerName: winner.name,
    pattern: winner.pattern,
    amount: winner.amount,
    timestamp: new Date().toISOString()
  };

  broadcastToRoom(roomId, winnerAnnouncement);
  
  // Notify admins
  if (room.admin) {
    sendToClient(room.admin, {
      type: "admin_winner",
      roomId,
      winner
    });
  }

  return true;
}

// Broadcast chat message to room
export function broadcastChatMessage(roomId: string, sender: string, message: string): boolean {
  const room = roomModel.get(roomId);
  if (!room) return false;

  const chatMessage = {
    type: "chat_message",
    roomId,
    sender,
    message,
    timestamp: new Date().toISOString()
  };

  broadcastToRoom(roomId, chatMessage);
  return true;
}

// Broadcast system message to room
export function broadcastSystemMessage(roomId: string, message: string): boolean {
  const room = roomModel.get(roomId);
  if (!room) return false;

  const systemMessage = {
    type: "system_message",
    roomId,
    message,
    timestamp: new Date().toISOString()
  };

  broadcastToRoom(roomId, systemMessage);
  return true;
}

// Broadcast game start to room
export function broadcastGameStart(roomId: string): boolean {
  const room = roomModel.get(roomId);
  if (!room) return false;

  const gameStart = {
    type: "game_started",
    roomId,
    gameType: room.gameType,
    stake: room.stake,
    timestamp: new Date().toISOString()
  };

  broadcastToRoom(roomId, gameStart);
  
  // Notify admins
  if (room.admin) {
    sendToClient(room.admin, {
      type: "admin_game_started",
      roomId,
      playerCount: room.players.size
    });
  }

  return true;
}

// Broadcast game end to room
export function broadcastGameEnd(roomId: string): boolean {
  const room = roomModel.get(roomId);
  if (!room) return false;

  const gameEnd = {
    type: "game_ended",
    roomId,
    winners: room.winners,
    finalNumbers: room.calledNumbers,
    timestamp: new Date().toISOString()
  };

  broadcastToRoom(roomId, gameEnd);
  
  // Notify admins
  if (room.admin) {
    sendToClient(room.admin, {
      type: "admin_game_ended",
      roomId,
      winners: room.winners
    });
  }

  return true;
}

// Broadcast player joined to room
export function broadcastPlayerJoined(roomId: string, playerId: string): boolean {
  const room = roomModel.get(roomId);
  const player = playerModel.get(playerId);
  
  if (!room || !player) return false;

  const joinMessage = {
    type: "player_joined",
    roomId,
    playerId,
    playerName: player.name,
    timestamp: new Date().toISOString()
  };

  broadcastToRoom(roomId, joinMessage);
  
  // Notify admins
  if (room.admin) {
    sendToClient(room.admin, {
      type: "admin_player_joined",
      roomId,
      playerId,
      playerName: player.name,
      stake: player.stake,
      playerCount: room.players.size
    });
  }

  return true;
}

// Broadcast player left to room
export function broadcastPlayerLeft(roomId: string, playerId: string): boolean {
  const room = roomModel.get(roomId);
  const player = playerModel.get(playerId);
  
  if (!room || !player) return false;

  const leaveMessage = {
    type: "player_left",
    roomId,
    playerId,
    playerName: player.name,
    timestamp: new Date().toISOString()
  };

  broadcastToRoom(roomId, leaveMessage);
  
  // Notify admins
  if (room.admin) {
    sendToClient(room.admin, {
      type: "admin_player_left",
      roomId,
      playerId,
      playerName: player.name,
      playerCount: room.players.size
    });
  }

  return true;
}

// Broadcast payment confirmation
export function broadcastPaymentConfirmation(playerId: string, amount: number): boolean {
  const player = playerModel.get(playerId);
  if (!player) return false;

  const paymentMessage = {
    type: "payment_confirmed",
    amount,
    balance: player.balance,
    timestamp: new Date().toISOString()
  };

  return sendToPlayer(playerId, paymentMessage);
}

// Broadcast withdrawal confirmation
export function broadcastWithdrawalConfirmation(playerId: string, amount: number): boolean {
  const player = playerModel.get(playerId);
  if (!player) return false;

  const withdrawalMessage = {
    type: "withdrawal_confirmed",
    amount,
    newBalance: player.balance,
    timestamp: new Date().toISOString()
  };

  return sendToPlayer(playerId, withdrawalMessage);
}

// Broadcast error to player
export function broadcastError(playerId: string, error: string, code?: string): boolean {
  const errorMessage = {
    type: "error",
    message: error,
    code,
    timestamp: new Date().toISOString()
  };

  return sendToPlayer(playerId, errorMessage);
}

// Broadcast admin message to room
export function broadcastAdminMessage(roomId: string, message: string): boolean {
  const room = roomModel.get(roomId);
  if (!room) return false;

  const adminMessage = {
    type: "admin_message",
    roomId,
    message,
    timestamp: new Date().toISOString()
  };

  broadcastToRoom(roomId, adminMessage);
  return true;
}

// Batch broadcast for efficiency
export function batchBroadcast(roomId: string, messages: any[]): boolean {
  const room = roomModel.get(roomId);
  if (!room) return false;

  const batchMessage = {
    type: "batch",
    messages,
    timestamp: new Date().toISOString()
  };

  broadcastToRoom(roomId, batchMessage);
  return true;
}

// Rate-limited broadcast to prevent flooding
export function rateLimitedBroadcast(
  roomId: string, 
  message: any, 
  minInterval: number = 100
): boolean {
  const room = roomModel.get(roomId);
  if (!room) return false;

  const now = Date.now();
  const lastBroadcast = room.lastBroadcast || 0;

  if (now - lastBroadcast < minInterval) {
    // Queue for later
    if (!room.queuedMessages) {
      room.queuedMessages = [];
    }
    room.queuedMessages.push({
      message,
      timestamp: now
    });

    // Schedule processing if not already scheduled
    if (!room.broadcastTimeout) {
      room.broadcastTimeout = setTimeout(() => {
        processQueuedMessages(roomId);
      }, minInterval);
    }

    return true;
  }

  // Broadcast immediately
  room.lastBroadcast = now;
  return broadcastToRoom(roomId, message);
}

// Process queued messages
function processQueuedMessages(roomId: string): void {
  const room = roomModel.get(roomId);
  if (!room || !room.queuedMessages || room.queuedMessages.length === 0) {
    room.broadcastTimeout = null;
    return;
  }

  // Take all queued messages
  const messagesToSend = [...room.queuedMessages];
  room.queuedMessages = [];

  // Send batch message
  if (messagesToSend.length > 1) {
    const batch = messagesToSend.map(item => item.message);
    batchBroadcast(roomId, batch);
  } else if (messagesToSend.length === 1) {
    broadcastToRoom(roomId, messagesToSend[0].message);
  }

  room.lastBroadcast = Date.now();
  room.broadcastTimeout = null;
}

// Clean up broadcast timeouts
export function cleanupBroadcastTimeouts(): void {
  const rooms = roomModel.getAll();
  rooms.forEach(room => {
    if (room.broadcastTimeout) {
      clearTimeout(room.broadcastTimeout);
      room.broadcastTimeout = null;
    }
  });
}