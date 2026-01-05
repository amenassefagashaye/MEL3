import { Room, Winner, Player } from "./interfaces.ts";
import { playerModel } from "./player.ts";

// Room model class
export class RoomModel {
  private rooms: Map<string, Room> = new Map();
  private roomSequence: number = 1;

  // Create new room
  create(roomData: {
    gameType: string;
    stake: number;
    adminSocket?: any;
  }): Room {
    const roomId = `ROOM_${Date.now()}_${this.roomSequence++}`;
    
    const room: Room = {
      id: roomId,
      gameType: roomData.gameType,
      stake: roomData.stake,
      players: new Set(),
      admin: roomData.adminSocket || null,
      active: false,
      calledNumbers: [],
      winners: [],
      createdAt: new Date()
    };

    this.rooms.set(roomId, room);
    return room;
  }

  // Get room by ID
  get(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  // Get all rooms
  getAll(): Room[] {
    return Array.from(this.rooms.values());
  }

  // Get active rooms
  getActive(): Room[] {
    return Array.from(this.rooms.values())
      .filter(room => room.active);
  }

  // Get rooms by game type
  getByGameType(gameType: string): Room[] {
    return Array.from(this.rooms.values())
      .filter(room => room.gameType === gameType);
  }

  // Get rooms with available slots
  getAvailable(maxPlayers: number = 90): Room[] {
    return Array.from(this.rooms.values())
      .filter(room => room.players.size < maxPlayers);
  }

  // Update room
  update(roomId: string, updates: Partial<Room>): Room | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;

    Object.assign(room, updates);
    return room;
  }

  // Remove room
  remove(roomId: string): boolean {
    // Get all players in room and remove them from room
    const room = this.rooms.get(roomId);
    if (room) {
      room.players.forEach(playerId => {
        const player = playerModel.get(playerId);
        if (player) {
          player.roomId = null;
          player.markedNumbers.clear();
        }
      });
    }

    return this.rooms.delete(roomId);
  }

  // Add player to room
  addPlayer(roomId: string, playerId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    room.players.add(playerId);
    return true;
  }

  // Remove player from room
  removePlayer(roomId: string, playerId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    const removed = room.players.delete(playerId);
    
    // If room becomes empty, remove it
    if (room.players.size === 0) {
      this.remove(roomId);
    }
    
    return removed;
  }

  // Get players in room
  getPlayers(roomId: string): Player[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];

    return Array.from(room.players)
      .map(playerId => playerModel.get(playerId))
      .filter((p): p is Player => p !== undefined);
  }

  // Get player count in room
  getPlayerCount(roomId: string): number {
    const room = this.rooms.get(roomId);
    return room ? room.players.size : 0;
  }

  // Check if room is full
  isFull(roomId: string, maxPlayers: number = 90): boolean {
    const room = this.rooms.get(roomId);
    return room ? room.players.size >= maxPlayers : true;
  }

  // Check if player is in room
  hasPlayer(roomId: string, playerId: string): boolean {
    const room = this.rooms.get(roomId);
    return room ? room.players.has(playerId) : false;
  }

  // Start game in room
  startGame(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room || room.active) return false;

    room.active = true;
    room.startedAt = new Date();
    room.calledNumbers = [];
    room.winners = [];
    
    // Reset player marked numbers
    room.players.forEach(playerId => {
      const player = playerModel.get(playerId);
      if (player) {
        player.markedNumbers.clear();
      }
    });

    return true;
  }

  // End game in room
  endGame(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room || !room.active) return false;

    room.active = false;
    room.endedAt = new Date();
    
    // Calculate and distribute winnings
    this.calculateWinnings(room);
    
    return true;
  }

  // Calculate winnings for room
  private calculateWinnings(room: Room): void {
    if (room.winners.length === 0) return;

    const totalStake = Array.from(room.players).reduce((sum, playerId) => {
      const player = playerModel.get(playerId);
      return sum + (player?.stake || 0);
    }, 0);

    const serviceCharge = totalStake * 0.03;
    const prizePool = totalStake - serviceCharge;

    // Distribute winnings proportionally to winners' stakes
    const totalWinnerStake = room.winners.reduce((sum, winner) => {
      const player = playerModel.get(winner.playerId);
      return sum + (player?.stake || 0);
    }, 0);

    room.winners.forEach(winner => {
      const player = playerModel.get(winner.playerId);
      if (player) {
        const stakeRatio = (player.stake || 0) / totalWinnerStake;
        const winAmount = Math.floor(prizePool * stakeRatio);
        
        // Update winner amount
        winner.amount = winAmount;
        
        // Update player balance
        playerModel.processWin(winner.playerId, winAmount);
      }
    });
  }

  // Call number in room
  callNumber(roomId: string, number: number): boolean {
    const room = this.rooms.get(roomId);
    if (!room || !room.active) return false;

    room.calledNumbers.push(number);
    return true;
  }

  // Add winner to room
  addWinner(roomId: string, winner: Omit<Winner, 'timestamp'>): boolean {
    const room = this.rooms.get(roomId);
    if (!room || !room.active) return false;

    const winnerWithTimestamp: Winner = {
      ...winner,
      timestamp: new Date()
    };

    room.winners.push(winnerWithTimestamp);
    return true;
  }

  // Get called numbers in room
  getCalledNumbers(roomId: string): number[] {
    const room = this.rooms.get(roomId);
    return room ? room.calledNumbers : [];
  }

  // Get winners in room
  getWinners(roomId: string): Winner[] {
    const room = this.rooms.get(roomId);
    return room ? room.winners : [];
  }

  // Set admin for room
  setAdmin(roomId: string, adminSocket: any): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    room.admin = adminSocket;
    return true;
  }

  // Get admin for room
  getAdmin(roomId: string): any | undefined {
    const room = this.rooms.get(roomId);
    return room?.admin;
  }

  // Check if game is active in room
  isGameActive(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    return room ? room.active : false;
  }

  // Pause game in room
  pauseGame(roomId: string, reason?: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room || !room.active) return false;

    room.active = false;
    // In production, would track pause state separately
    return true;
  }

  // Resume game in room
  resumeGame(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room || room.active) return false;

    room.active = true;
    return true;
  }

  // Get room statistics
  getStats(roomId: string): {
    playerCount: number;
    gameType: string;
    stake: number;
    active: boolean;
    calledNumbersCount: number;
    winnersCount: number;
    duration: number; // in minutes
    totalStake: number;
    prizePool: number;
  } {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error("Room not found");
    }

    const playerCount = room.players.size;
    const calledNumbersCount = room.calledNumbers.length;
    const winnersCount = room.winners.length;
    
    const totalStake = Array.from(room.players).reduce((sum, playerId) => {
      const player = playerModel.get(playerId);
      return sum + (player?.stake || 0);
    }, 0);

    const prizePool = totalStake * 0.97; // 3% service charge
    const duration = room.startedAt ? 
      Math.floor((new Date().getTime() - room.startedAt.getTime()) / 60000) : 0;

    return {
      playerCount,
      gameType: room.gameType,
      stake: room.stake,
      active: room.active,
      calledNumbersCount,
      winnersCount,
      duration,
      totalStake,
      prizePool
    };
  }

  // Get total statistics for all rooms
  getTotalStats(): {
    totalRooms: number;
    activeRooms: number;
    totalPlayers: number;
    activePlayers: number;
    totalRevenue: number;
    totalWinnings: number;
    averagePlayersPerRoom: number;
    mostPopularGame: string;
  } {
    const allRooms = Array.from(this.rooms.values());
    const activeRooms = allRooms.filter(room => room.active);
    
    if (allRooms.length === 0) {
      return {
        totalRooms: 0,
        activeRooms: 0,
        totalPlayers: 0,
        activePlayers: 0,
        totalRevenue: 0,
        totalWinnings: 0,
        averagePlayersPerRoom: 0,
        mostPopularGame: "75ball"
      };
    }

    let totalPlayers = 0;
    let activePlayers = 0;
    let totalRevenue = 0;
    let totalWinnings = 0;
    
    const gameTypeCount: { [key: string]: number } = {};

    allRooms.forEach(room => {
      const players = Array.from(room.players);
      totalPlayers += players.length;
      
      if (room.active) {
        activePlayers += players.length;
      }

      // Count game types
      gameTypeCount[room.gameType] = (gameTypeCount[room.gameType] || 0) + 1;

      // Calculate revenue and winnings for room
      players.forEach(playerId => {
        const player = playerModel.get(playerId);
        if (player) {
          totalRevenue += player.payment || 0;
          totalWinnings += player.wonAmount || 0;
        }
      });
    });

    const averagePlayersPerRoom = totalPlayers / allRooms.length;
    
    // Find most popular game type
    let mostPopularGame = "75ball";
    let maxCount = 0;
    for (const [gameType, count] of Object.entries(gameTypeCount)) {
      if (count > maxCount) {
        maxCount = count;
        mostPopularGame = gameType;
      }
    }

    return {
      totalRooms: allRooms.length,
      activeRooms: activeRooms.length,
      totalPlayers,
      activePlayers,
      totalRevenue,
      totalWinnings,
      averagePlayersPerRoom,
      mostPopularGame
    };
  }

  // Clean up inactive rooms (no activity for 1 hour)
  cleanupInactive(timeoutMs: number = 60 * 60 * 1000): string[] {
    const cutoff = new Date(Date.now() - timeoutMs);
    const removed: string[] = [];

    for (const [roomId, room] of this.rooms.entries()) {
      if (!room.active) {
        // Check last activity (simplified - check if started long ago)
        const lastActivity = room.startedAt || room.createdAt;
        if (lastActivity < cutoff) {
          this.remove(roomId);
          removed.push(roomId);
        }
      }
    }

    return removed;
  }

  // Find room for player based on preferences
  findRoom(preferences: {
    gameType?: string;
    stake?: number;
    minPlayers?: number;
    maxPlayers?: number;
  }): Room | undefined {
    const availableRooms = this.getAvailable(preferences.maxPlayers || 90);
    
    return availableRooms.find(room => {
      if (preferences.gameType && room.gameType !== preferences.gameType) {
        return false;
      }
      if (preferences.stake && room.stake !== preferences.stake) {
        return false;
      }
      if (preferences.minPlayers && room.players.size < preferences.minPlayers) {
        return false;
      }
      return true;
    });
  }
}

// Export singleton instance
export const roomModel = new RoomModel();