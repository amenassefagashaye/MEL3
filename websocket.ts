// WebSocket utility functions for Deno

import { WebSocketClient } from "../models/interfaces.ts";
import { logger } from "../services/logger.ts";

// Extended WebSocket class with additional properties
export class WebSocket extends globalThis.WebSocket {
  playerId?: string;
  isAdmin?: boolean;
  adminId?: string;
  deviceInfo?: any;
  roomId?: string;
  lastPing?: number;
  lastPong?: number;
  connectedAt?: Date;
  messageCount: number = 0;
  lastMessageTime?: Date;
  
  constructor(socket: globalThis.WebSocket) {
    super(socket.url, socket.protocol ? [socket.protocol] : undefined);
    Object.setPrototypeOf(this, WebSocket.prototype);
    
    // Copy all properties from the original socket
    for (const key in socket) {
      if (key in this) continue;
      (this as any)[key] = (socket as any)[key];
    }
  }
  
  // Send JSON message
  sendJSON(data: any): void {
    try {
      const message = JSON.stringify(data);
      this.send(message);
      this.messageCount++;
      this.lastMessageTime = new Date();
    } catch (error) {
      logger.error("Error sending WebSocket message", { error: error.message }, error as Error);
    }
  }
  
  // Close with reason
  closeWithReason(code: number, reason: string): void {
    try {
      this.close(code, reason);
    } catch (error) {
      logger.error("Error closing WebSocket", { error: error.message }, error as Error);
    }
  }
  
  // Check if connection is stale (no activity for 5 minutes)
  isStale(): boolean {
    if (!this.lastMessageTime) return false;
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return this.lastMessageTime < fiveMinutesAgo;
  }
  
  // Check if connection is healthy (ping/pong)
  isHealthy(): boolean {
    if (!this.lastPing || !this.lastPong) return true;
    const oneMinuteAgo = Date.now() - 60 * 1000;
    return this.lastPong > oneMinuteAgo;
  }
}

// WebSocket manager for handling connections
export class WebSocketManager {
  private connections: Set<WebSocket> = new Set();
  private playerConnections: Map<string, WebSocket> = new Map();
  private adminConnections: Map<string, WebSocket> = new Map();
  private roomConnections: Map<string, Set<WebSocket>> = new Map();
  
  // Add connection
  addConnection(ws: WebSocket): void {
    this.connections.add(ws);
    
    if (ws.playerId) {
      this.playerConnections.set(ws.playerId, ws);
      logger.debug("Player connection added", { playerId: ws.playerId });
    }
    
    if (ws.isAdmin && ws.adminId) {
      this.adminConnections.set(ws.adminId, ws);
      logger.debug("Admin connection added", { adminId: ws.adminId });
    }
    
    if (ws.roomId) {
      this.addToRoom(ws.roomId, ws);
    }
  }
  
  // Remove connection
  removeConnection(ws: WebSocket): void {
    this.connections.delete(ws);
    
    if (ws.playerId) {
      this.playerConnections.delete(ws.playerId);
      logger.debug("Player connection removed", { playerId: ws.playerId });
    }
    
    if (ws.isAdmin && ws.adminId) {
      this.adminConnections.delete(ws.adminId);
      logger.debug("Admin connection removed", { adminId: ws.adminId });
    }
    
    if (ws.roomId) {
      this.removeFromRoom(ws.roomId, ws);
    }
  }
  
  // Get connection by player ID
  getPlayerConnection(playerId: string): WebSocket | undefined {
    return this.playerConnections.get(playerId);
  }
  
  // Get connection by admin ID
  getAdminConnection(adminId: string): WebSocket | undefined {
    return this.adminConnections.get(adminId);
  }
  
  // Get all player connections
  getAllPlayerConnections(): WebSocket[] {
    return Array.from(this.playerConnections.values());
  }
  
  // Get all admin connections
  getAllAdminConnections(): WebSocket[] {
    return Array.from(this.adminConnections.values());
  }
  
  // Get all connections
  getAllConnections(): WebSocket[] {
    return Array.from(this.connections);
  }
  
  // Add connection to room
  addToRoom(roomId: string, ws: WebSocket): void {
    if (!this.roomConnections.has(roomId)) {
      this.roomConnections.set(roomId, new Set());
    }
    
    const room = this.roomConnections.get(roomId)!;
    room.add(ws);
    ws.roomId = roomId;
    
    logger.debug("Connection added to room", { roomId, playerId: ws.playerId });
  }
  
  // Remove connection from room
  removeFromRoom(roomId: string, ws: WebSocket): void {
    const room = this.roomConnections.get(roomId);
    if (room) {
      room.delete(ws);
      ws.roomId = undefined;
      
      // Clean up empty rooms
      if (room.size === 0) {
        this.roomConnections.delete(roomId);
      }
      
      logger.debug("Connection removed from room", { roomId, playerId: ws.playerId });
    }
  }
  
  // Get connections in room
  getConnectionsInRoom(roomId: string): WebSocket[] {
    const room = this.roomConnections.get(roomId);
    return room ? Array.from(room) : [];
  }
  
  // Get player IDs in room
  getPlayersInRoom(roomId: string): string[] {
    const connections = this.getConnectionsInRoom(roomId);
    return connections
      .map(ws => ws.playerId)
      .filter((id): id is string => id !== undefined);
  }
  
  // Broadcast to room
  broadcastToRoom(roomId: string, message: any): number {
    const connections = this.getConnectionsInRoom(roomId);
    let sentCount = 0;
    
    connections.forEach(ws => {
      if (ws.readyState === 1) { // OPEN
        try {
          ws.sendJSON(message);
          sentCount++;
        } catch (error) {
          logger.error("Error broadcasting to connection", { 
            playerId: ws.playerId,
            error: error.message 
          }, error as Error);
        }
      }
    });
    
    logger.debug("Broadcast to room", { 
      roomId, 
      sentCount, 
      totalConnections: connections.length 
    });
    
    return sentCount;
  }
  
  // Send to specific player
  sendToPlayer(playerId: string, message: any): boolean {
    const ws = this.getPlayerConnection(playerId);
    if (!ws || ws.readyState !== 1) {
      return false;
    }
    
    try {
      ws.sendJSON(message);
      return true;
    } catch (error) {
      logger.error("Error sending to player", { 
        playerId,
        error: error.message 
      }, error as Error);
      return false;
    }
  }
  
  // Send to admin
  sendToAdmin(adminId: string, message: any): boolean {
    const ws = this.getAdminConnection(adminId);
    if (!ws || ws.readyState !== 1) {
      return false;
    }
    
    try {
      ws.sendJSON(message);
      return true;
    } catch (error) {
      logger.error("Error sending to admin", { 
        adminId,
        error: error.message 
      }, error as Error);
      return false;
    }
  }
  
  // Broadcast to all admins
  broadcastToAdmins(message: any): number {
    const admins = this.getAllAdminConnections();
    let sentCount = 0;
    
    admins.forEach(ws => {
      if (ws.readyState === 1) {
        try {
          ws.sendJSON(message);
          sentCount++;
        } catch (error) {
          logger.error("Error broadcasting to admin", { 
            adminId: ws.adminId,
            error: error.message 
          }, error as Error);
        }
      }
    });
    
    return sentCount;
  }
  
  // Check for stale connections and clean them up
  cleanupStaleConnections(): string[] {
    const staleConnections: WebSocket[] = [];
    
    this.connections.forEach(ws => {
      if (ws.isStale() || !ws.isHealthy()) {
        staleConnections.push(ws);
      }
    });
    
    const removedIds: string[] = [];
    
    staleConnections.forEach(ws => {
      this.removeConnection(ws);
      
      if (ws.playerId) {
        removedIds.push(`player:${ws.playerId}`);
      }
      if (ws.isAdmin && ws.adminId) {
        removedIds.push(`admin:${ws.adminId}`);
      }
      
      try {
        ws.closeWithReason(1001, "Connection stale");
      } catch (error) {
        // Ignore close errors
      }
    });
    
    if (removedIds.length > 0) {
      logger.info("Cleaned up stale connections", { removedIds });
    }
    
    return removedIds;
  }
  
  // Get statistics
  getStats(): {
    totalConnections: number;
    playerConnections: number;
    adminConnections: number;
    rooms: number;
    connectionsPerRoom: { [roomId: string]: number };
  } {
    const connectionsPerRoom: { [roomId: string]: number } = {};
    
    this.roomConnections.forEach((connections, roomId) => {
      connectionsPerRoom[roomId] = connections.size;
    });
    
    return {
      totalConnections: this.connections.size,
      playerConnections: this.playerConnections.size,
      adminConnections: this.adminConnections.size,
      rooms: this.roomConnections.size,
      connectionsPerRoom
    };
  }
  
  // Update connection room
  updateConnectionRoom(oldRoomId: string | undefined, newRoomId: string, ws: WebSocket): void {
    if (oldRoomId) {
      this.removeFromRoom(oldRoomId, ws);
    }
    this.addToRoom(newRoomId, ws);
  }
  
  // Find connection by criteria
  findConnection(criteria: {
    playerId?: string;
    isAdmin?: boolean;
    roomId?: string;
  }): WebSocket[] {
    return Array.from(this.connections).filter(ws => {
      if (criteria.playerId && ws.playerId !== criteria.playerId) return false;
      if (criteria.isAdmin !== undefined && !!ws.isAdmin !== criteria.isAdmin) return false;
      if (criteria.roomId && ws.roomId !== criteria.roomId) return false;
      return true;
    });
  }
}

// Singleton instance
export const wsManager = new WebSocketManager();

// Periodic cleanup
setInterval(() => {
  wsManager.cleanupStaleConnections();
}, 5 * 60 * 1000); // Every 5 minutes

// Heartbeat for all connections
setInterval(() => {
  const connections = wsManager.getAllConnections();
  const now = Date.now();
  
  connections.forEach(ws => {
    if (ws.readyState === 1) {
      // Send ping every 30 seconds
      if (!ws.lastPing || now - ws.lastPing > 30000) {
        try {
          ws.sendJSON({ type: "ping", timestamp: now });
          ws.lastPing = now;
        } catch (error) {
          logger.error("Error sending ping", { error: error.message }, error as Error);
        }
      }
    }
  });
}, 10000); // Check every 10 seconds