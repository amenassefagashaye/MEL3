// Authentication middleware for the Bingo game

import { Context } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { WebSocketClient } from "../models/interfaces.ts";
import { logger } from "../services/logger.ts";

// Admin password from environment
const ADMIN_PASSWORD = Deno.env.get("ADMIN_PASSWORD") || "asse2123";
const SECRET_KEY = Deno.env.get("SECRET_KEY") || "assefa_gashaye_bingo_secret_2024";

// Rate limiting
const rateLimit = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const MAX_REQUESTS = 100;

// Admin authentication middleware for HTTP
export async function validateAdmin(ctx: Context, next: () => Promise<void>) {
  try {
    const authHeader = ctx.request.headers.get("Authorization");
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      ctx.response.status = 401;
      ctx.response.body = { 
        success: false, 
        message: "Authentication required" 
      };
      return;
    }
    
    const token = authHeader.substring(7);
    
    // Validate token (simplified - in production use JWT)
    const isValid = validateAdminToken(token);
    
    if (!isValid) {
      ctx.response.status = 403;
      ctx.response.body = { 
        success: false, 
        message: "Invalid or expired token" 
      };
      return;
    }
    
    // Rate limiting
    const clientIp = ctx.request.ip;
    if (!checkRateLimit(clientIp)) {
      ctx.response.status = 429;
      ctx.response.body = { 
        success: false, 
        message: "Too many requests" 
      };
      return;
    }
    
    await next();
    
  } catch (error) {
    logger.error("Admin validation error", { error: error.message }, error as Error);
    ctx.response.status = 500;
    ctx.response.body = { 
      success: false, 
      message: "Internal server error" 
    };
  }
}

// Player validation middleware for HTTP
export async function validatePlayer(ctx: Context, next: () => Promise<void>) {
  try {
    const authHeader = ctx.request.headers.get("Authorization");
    
    if (!authHeader || !authHeader.startsWith("Player ")) {
      ctx.response.status = 401;
      ctx.response.body = { 
        success: false, 
        message: "Player authentication required" 
      };
      return;
    }
    
    const playerId = authHeader.substring(7);
    
    // Validate player ID format
    if (!playerId || playerId.length < 10) {
      ctx.response.status = 400;
      ctx.response.body = { 
        success: false, 
        message: "Invalid player ID" 
      };
      return;
    }
    
    // Rate limiting
    const clientIp = ctx.request.ip;
    if (!checkRateLimit(clientIp)) {
      ctx.response.status = 429;
      ctx.response.body = { 
        success: false, 
        message: "Too many requests" 
      };
      return;
    }
    
    // Store player ID in context for later use
    ctx.state.playerId = playerId;
    
    await next();
    
  } catch (error) {
    logger.error("Player validation error", { error: error.message }, error as Error);
    ctx.response.status = 500;
    ctx.response.body = { 
      success: false, 
      message: "Internal server error" 
    };
  }
}

// WebSocket authentication
export function authenticateWebSocket(ws: WebSocketClient, message: any): boolean {
  try {
    if (message.type === 'hello') {
      // Admin authentication
      if (message.isAdmin) {
        return authenticateAdminWebSocket(ws, message);
      }
      
      // Player authentication
      return authenticatePlayerWebSocket(ws, message);
    }
    
    // For other messages, check if already authenticated
    if (ws.isAdmin || ws.playerId) {
      return true;
    }
    
    return false;
    
  } catch (error) {
    logger.error("WebSocket authentication error", { error: error.message }, error as Error);
    return false;
  }
}

// Admin WebSocket authentication
function authenticateAdminWebSocket(ws: WebSocketClient, message: any): boolean {
  const { password } = message;
  
  if (!password || password !== ADMIN_PASSWORD) {
    ws.send(JSON.stringify({
      type: "error",
      message: "Invalid admin password"
    }));
    ws.close(1008, "Authentication failed");
    return false;
  }
  
  // Check for multiple admin connections from same IP
  const clientIp = getClientIP(ws);
  if (hasMultipleAdminConnections(clientIp)) {
    ws.send(JSON.stringify({
      type: "error",
      message: "Multiple admin connections not allowed"
    }));
    ws.close(1008, "Multiple connections");
    return false;
  }
  
  // Mark as admin
  ws.isAdmin = true;
  ws.adminId = generateAdminId();
  ws.connectedAt = new Date();
  
  logger.logAdminAction(ws.adminId, "connected", clientIp);
  
  return true;
}

// Player WebSocket authentication
function authenticatePlayerWebSocket(ws: WebSocketClient, message: any): boolean {
  const { playerId, deviceInfo } = message;
  
  if (!playerId || playerId.length < 10) {
    ws.send(JSON.stringify({
      type: "error",
      message: "Invalid player ID"
    }));
    ws.close(1008, "Authentication failed");
    return false;
  }
  
  // Rate limiting per player
  if (!checkPlayerRateLimit(playerId)) {
    ws.send(JSON.stringify({
      type: "error",
      message: "Too many connection attempts"
    }));
    ws.close(1008, "Rate limited");
    return false;
  }
  
  // Mark as player
  ws.playerId = playerId;
  ws.deviceInfo = deviceInfo;
  ws.connectedAt = new Date();
  
  logger.logWebSocketEvent("player_authenticated", playerId, undefined, { deviceInfo });
  
  return true;
}

// Validate admin token (simplified)
function validateAdminToken(token: string): boolean {
  try {
    // In production, use proper JWT validation
    const decoded = atob(token);
    const [timestamp, secret, role] = decoded.split(':');
    
    if (secret !== SECRET_KEY || role !== 'admin') {
      return false;
    }
    
    // Check if token is expired (1 hour)
    const tokenTime = parseInt(timestamp);
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    
    return (now - tokenTime) < oneHour;
    
  } catch (error) {
    return false;
  }
}

// Generate admin ID
function generateAdminId(): string {
  return `ADMIN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Get client IP from WebSocket
function getClientIP(ws: WebSocketClient): string {
  // This is a simplified version
  // In production, get actual IP from connection
  return "unknown";
}

// Check for multiple admin connections
function hasMultipleAdminConnections(clientIp: string): boolean {
  // Simplified - in production, track admin connections
  return false;
}

// Rate limiting check
function checkRateLimit(clientIp: string): boolean {
  const now = Date.now();
  const limitInfo = rateLimit.get(clientIp);
  
  if (!limitInfo) {
    rateLimit.set(clientIp, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  // Reset if window has passed
  if (now > limitInfo.resetTime) {
    rateLimit.set(clientIp, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  // Check count
  if (limitInfo.count >= MAX_REQUESTS) {
    return false;
  }
  
  limitInfo.count++;
  return true;
}

// Player rate limiting
function checkPlayerRateLimit(playerId: string): boolean {
  const now = Date.now();
  const key = `player_${playerId}`;
  const limitInfo = rateLimit.get(key);
  
  if (!limitInfo) {
    rateLimit.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  if (now > limitInfo.resetTime) {
    rateLimit.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  // Players have lower limit
  if (limitInfo.count >= 50) {
    return false;
  }
  
  limitInfo.count++;
  return true;
}

// Clean up rate limiting data
export function cleanupRateLimit(): void {
  const now = Date.now();
  for (const [key, info] of rateLimit.entries()) {
    if (now > info.resetTime) {
      rateLimit.delete(key);
    }
  }
}

// Schedule cleanup every hour
setInterval(cleanupRateLimit, 60 * 60 * 1000);

// Authorization checks
export function authorizeAdminAction(ws: WebSocketClient, action: string, target?: string): boolean {
  if (!ws.isAdmin) {
    return false;
  }
  
  // Additional authorization logic can be added here
  // For example, check if admin has permission for specific action
  
  logger.logAdminAction(ws.adminId || "unknown", action, target);
  return true;
}

export function authorizePlayerAction(ws: WebSocketClient, action: string, targetRoomId?: string): boolean {
  if (!ws.playerId) {
    return false;
  }
  
  // Check if player is in the correct room (if room-specific action)
  if (targetRoomId && ws.roomId !== targetRoomId) {
    return false;
  }
  
  return true;
}

// Generate player token (for future use)
export function generatePlayerToken(playerId: string): string {
  const timestamp = Date.now();
  const tokenData = `${timestamp}:${SECRET_KEY}:player:${playerId}`;
  return btoa(tokenData);
}

// Validate player token
export function validatePlayerToken(token: string): string | null {
  try {
    const decoded = atob(token);
    const [timestamp, secret, role, playerId] = decoded.split(':');
    
    if (secret !== SECRET_KEY || role !== 'player') {
      return null;
    }
    
    // Check if token is expired (24 hours)
    const tokenTime = parseInt(timestamp);
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    
    if ((now - tokenTime) > oneDay) {
      return null;
    }
    
    return playerId;
    
  } catch (error) {
    return null;
  }
}