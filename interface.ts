// WebSocket client interface
export interface WebSocketClient extends WebSocket {
  playerId?: string;
  isAdmin?: boolean;
  deviceInfo?: any;
  lastPing?: number;
  lastPong?: number;
}

// Player interface
export interface Player {
  id: string;
  name: string;
  phone: string;
  stake: number;
  gameType: string;
  payment: number;
  wonAmount?: number;
  withdrawn?: number;
  balance?: number;
  joinedAt: Date;
  socket: WebSocketClient;
  roomId: string | null;
  markedNumbers: Set<number>;
  lastActive?: Date;
}

// Room interface
export interface Room {
  id: string;
  gameType: string;
  stake: number;
  players: Set<string>; // Player IDs
  admin: WebSocketClient | null;
  active: boolean;
  calledNumbers: number[];
  winners: Winner[];
  createdAt: Date;
  startedAt?: Date;
  endedAt?: Date;
}

// Winner interface
export interface Winner {
  playerId: string;
  name: string;
  pattern: string;
  amount: number;
  timestamp: Date;
}

// Game configuration interface
export interface GameConfig {
  gameTypes: string[];
  stakes: number[];
  patterns: {
    [gameType: string]: string[];
  };
  winMultipliers: {
    [gameType: string]: {
      [pattern: string]: number;
    };
  };
}

// Message interface
export interface Message {
  type: string;
  [key: string]: any;
}

// Admin command interface
export interface AdminCommand {
  command: string;
  data?: any;
  timestamp: Date;
}

// Payment interface
export interface Payment {
  playerId: string;
  amount: number;
  method: string;
  status: 'pending' | 'completed' | 'failed';
  transactionId?: string;
  timestamp: Date;
}

// Withdrawal interface
export interface Withdrawal {
  playerId: string;
  amount: number;
  accountNumber: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  transactionId?: string;
  requestedAt: Date;
  processedAt?: Date;
}

// Statistics interface
export interface Statistics {
  totalPlayers: number;
  activePlayers: number;
  totalRooms: number;
  activeGames: number;
  totalRevenue: number;
  totalWinnings: number;
  totalWithdrawals: number;
  averageStake: number;
  mostPopularGame: string;
  peakConcurrentPlayers: number;
}

// Device info interface
export interface DeviceInfo {
  userAgent: string;
  platform: string;
  language: string;
  screenWidth: number;
  screenHeight: number;
  isMobile: boolean;
  isIOS?: boolean;
  isAndroid?: boolean;
}

// Error response interface
export interface ErrorResponse {
  success: false;
  message: string;
  code?: string;
  details?: any;
}

// Success response interface
export interface SuccessResponse {
  success: true;
  data: any;
  message?: string;
}

// Authentication interface
export interface AuthRequest {
  type: 'admin' | 'player';
  identifier: string;
  password?: string;
  token?: string;
}

// WebRTC signaling interface
export interface RTCSignaling {
  type: 'offer' | 'answer' | 'ice_candidate';
  sdp?: any;
  candidate?: any;
  roomId: string;
  senderId: string;
  timestamp: Date;
}

// Game state interface
export interface GameState {
  roomId: string;
  gameType: string;
  stake: number;
  calledNumbers: number[];
  winners: Winner[];
  remainingNumbers: number[];
  startedAt: Date;
  estimatedEndAt?: Date;
  isPaused: boolean;
  pauseReason?: string;
}

// Player game state interface
export interface PlayerGameState {
  playerId: string;
  roomId: string;
  markedNumbers: number[];
  patternsCompleted: string[];
  potentialWin: number;
  lastCalledNumber?: number;
  timeJoined: Date;
}