import { Player, DeviceInfo } from "./interfaces.ts";

// Player model class
export class PlayerModel {
  private players: Map<string, Player> = new Map();
  private deviceSessions: Map<string, Set<string>> = new Map(); // deviceId -> playerIds

  // Create new player
  create(playerData: {
    id: string;
    name: string;
    phone: string;
    stake: number;
    gameType: string;
    payment: number;
    socket: any;
    deviceInfo?: DeviceInfo;
  }): Player {
    const player: Player = {
      ...playerData,
      joinedAt: new Date(),
      roomId: null,
      markedNumbers: new Set(),
      balance: playerData.payment || 0,
      lastActive: new Date()
    };

    this.players.set(player.id, player);

    // Track device sessions
    if (playerData.deviceInfo) {
      const deviceId = this.getDeviceId(playerData.deviceInfo);
      if (!this.deviceSessions.has(deviceId)) {
        this.deviceSessions.set(deviceId, new Set());
      }
      this.deviceSessions.get(deviceId)!.add(player.id);
    }

    return player;
  }

  // Get player by ID
  get(playerId: string): Player | undefined {
    return this.players.get(playerId);
  }

  // Get player by phone
  getByPhone(phone: string): Player | undefined {
    return Array.from(this.players.values())
      .find(player => player.phone === phone);
  }

  // Update player
  update(playerId: string, updates: Partial<Player>): Player | undefined {
    const player = this.players.get(playerId);
    if (!player) return undefined;

    Object.assign(player, updates, { lastActive: new Date() });
    return player;
  }

  // Remove player
  remove(playerId: string): boolean {
    const player = this.players.get(playerId);
    if (!player) return false;

    // Remove from device sessions
    if (player.socket.deviceInfo) {
      const deviceId = this.getDeviceId(player.socket.deviceInfo);
      const sessions = this.deviceSessions.get(deviceId);
      if (sessions) {
        sessions.delete(playerId);
        if (sessions.size === 0) {
          this.deviceSessions.delete(deviceId);
        }
      }
    }

    return this.players.delete(playerId);
  }

  // Get all players
  getAll(): Player[] {
    return Array.from(this.players.values());
  }

  // Get players in room
  getByRoom(roomId: string): Player[] {
    return Array.from(this.players.values())
      .filter(player => player.roomId === roomId);
  }

  // Get active players (active in last 5 minutes)
  getActive(): Player[] {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return Array.from(this.players.values())
      .filter(player => player.lastActive && player.lastActive > fiveMinutesAgo);
  }

  // Get players by game type
  getByGameType(gameType: string): Player[] {
    return Array.from(this.players.values())
      .filter(player => player.gameType === gameType);
  }

  // Get players with balance
  getWithBalance(minBalance: number = 0): Player[] {
    return Array.from(this.players.values())
      .filter(player => (player.balance || 0) >= minBalance);
  }

  // Get players who have won
  getWinners(): Player[] {
    return Array.from(this.players.values())
      .filter(player => (player.wonAmount || 0) > 0);
  }

  // Get player statistics
  getStats(playerId: string): {
    gamesPlayed: number;
    totalWon: number;
    totalPaid: number;
    totalWithdrawn: number;
    currentBalance: number;
    winRate: number;
    favoriteGame: string;
  } {
    const player = this.players.get(playerId);
    if (!player) {
      throw new Error("Player not found");
    }

    // Simplified stats - in production, track actual game history
    return {
      gamesPlayed: 0, // Would track actual games
      totalWon: player.wonAmount || 0,
      totalPaid: player.payment || 0,
      totalWithdrawn: player.withdrawn || 0,
      currentBalance: player.balance || 0,
      winRate: 0, // Would calculate from game history
      favoriteGame: player.gameType || "75ball"
    };
  }

  // Process payment for player
  processPayment(playerId: string, amount: number): Player | undefined {
    const player = this.players.get(playerId);
    if (!player) return undefined;

    player.payment = (player.payment || 0) + amount;
    player.balance = (player.balance || 0) + amount;
    player.lastActive = new Date();

    return player;
  }

  // Process win for player
  processWin(playerId: string, amount: number): Player | undefined {
    const player = this.players.get(playerId);
    if (!player) return undefined;

    player.wonAmount = (player.wonAmount || 0) + amount;
    player.balance = (player.balance || 0) + amount;
    player.lastActive = new Date();

    return player;
  }

  // Process withdrawal for player
  processWithdrawal(playerId: string, amount: number): {
    success: boolean;
    player?: Player;
    error?: string;
  } {
    const player = this.players.get(playerId);
    if (!player) {
      return { success: false, error: "Player not found" };
    }

    if (amount > (player.balance || 0)) {
      return { success: false, error: "Insufficient balance" };
    }

    player.balance = (player.balance || 0) - amount;
    player.withdrawn = (player.withdrawn || 0) + amount;
    player.lastActive = new Date();

    return { success: true, player };
  }

  // Mark number for player
  markNumber(playerId: string, number: number, marked: boolean = true): void {
    const player = this.players.get(playerId);
    if (!player) return;

    if (marked) {
      player.markedNumbers.add(number);
    } else {
      player.markedNumbers.delete(number);
    }
    player.lastActive = new Date();
  }

  // Get marked numbers for player
  getMarkedNumbers(playerId: string): number[] {
    const player = this.players.get(playerId);
    return player ? Array.from(player.markedNumbers) : [];
  }

  // Clear marked numbers for player
  clearMarkedNumbers(playerId: string): void {
    const player = this.players.get(playerId);
    if (player) {
      player.markedNumbers.clear();
    }
  }

  // Join room
  joinRoom(playerId: string, roomId: string): boolean {
    const player = this.players.get(playerId);
    if (!player) return false;

    player.roomId = roomId;
    player.lastActive = new Date();
    return true;
  }

  // Leave room
  leaveRoom(playerId: string): boolean {
    const player = this.players.get(playerId);
    if (!player) return false;

    player.roomId = null;
    player.markedNumbers.clear();
    player.lastActive = new Date();
    return true;
  }

  // Check if player is in a room
  isInRoom(playerId: string, roomId?: string): boolean {
    const player = this.players.get(playerId);
    if (!player) return false;

    if (roomId) {
      return player.roomId === roomId;
    }
    return player.roomId !== null;
  }

  // Get device ID from device info
  private getDeviceId(deviceInfo: DeviceInfo): string {
    // Create a unique device ID based on device info
    const components = [
      deviceInfo.userAgent,
      deviceInfo.platform,
      deviceInfo.screenWidth,
      deviceInfo.screenHeight
    ];
    return btoa(components.join(':')).substring(0, 32);
  }

  // Get players by device
  getByDevice(deviceInfo: DeviceInfo): Player[] {
    const deviceId = this.getDeviceId(deviceInfo);
    const playerIds = this.deviceSessions.get(deviceId);
    if (!playerIds) return [];

    return Array.from(playerIds)
      .map(id => this.players.get(id))
      .filter((p): p is Player => p !== undefined);
  }

  // Clean up inactive players (older than timeout)
  cleanupInactive(timeoutMs: number = 30 * 60 * 1000): string[] {
    const cutoff = new Date(Date.now() - timeoutMs);
    const removed: string[] = [];

    for (const [playerId, player] of this.players.entries()) {
      if (player.lastActive && player.lastActive < cutoff) {
        this.remove(playerId);
        removed.push(playerId);
      }
    }

    return removed;
  }

  // Get total statistics
  getTotalStats(): {
    totalPlayers: number;
    activePlayers: number;
    totalRevenue: number;
    totalWinnings: number;
    totalWithdrawals: number;
    averageBalance: number;
  } {
    const allPlayers = Array.from(this.players.values());
    
    if (allPlayers.length === 0) {
      return {
        totalPlayers: 0,
        activePlayers: 0,
        totalRevenue: 0,
        totalWinnings: 0,
        totalWithdrawals: 0,
        averageBalance: 0
      };
    }

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const activePlayers = allPlayers.filter(p => 
      p.lastActive && p.lastActive > fiveMinutesAgo
    );

    const totalRevenue = allPlayers.reduce((sum, p) => sum + (p.payment || 0), 0);
    const totalWinnings = allPlayers.reduce((sum, p) => sum + (p.wonAmount || 0), 0);
    const totalWithdrawals = allPlayers.reduce((sum, p) => sum + (p.withdrawn || 0), 0);
    const totalBalance = allPlayers.reduce((sum, p) => sum + (p.balance || 0), 0);
    const averageBalance = totalBalance / allPlayers.length;

    return {
      totalPlayers: allPlayers.length,
      activePlayers: activePlayers.length,
      totalRevenue,
      totalWinnings,
      totalWithdrawals,
      averageBalance
    };
  }
}

// Export singleton instance
export const playerModel = new PlayerModel();