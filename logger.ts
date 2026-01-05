// Logger service for the Bingo game server

export enum LogLevel {
  DEBUG = "DEBUG",
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR"
}

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
  error?: Error;
}

export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel = LogLevel.INFO;
  private logFile: string | null = null;
  private enableConsole: boolean = true;

  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  // Configure logger
  configure(config: {
    level?: LogLevel;
    logFile?: string;
    enableConsole?: boolean;
  }): void {
    if (config.level) {
      this.logLevel = config.level;
    }
    if (config.logFile) {
      this.logFile = config.logFile;
    }
    if (config.enableConsole !== undefined) {
      this.enableConsole = config.enableConsole;
    }
  }

  // Check if should log at given level
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= currentLevelIndex;
  }

  // Create log entry
  private createEntry(level: LogLevel, message: string, context?: any, error?: Error): LogEntry {
    return {
      timestamp: new Date(),
      level,
      message,
      context,
      error
    };
  }

  // Format log entry
  private formatEntry(entry: LogEntry): string {
    const timestamp = entry.timestamp.toISOString();
    const level = entry.level.padEnd(5);
    let logMessage = `[${timestamp}] ${level} ${entry.message}`;
    
    if (entry.context && Object.keys(entry.context).length > 0) {
      logMessage += ` | ${JSON.stringify(entry.context)}`;
    }
    
    if (entry.error) {
      logMessage += ` | Error: ${entry.error.message}`;
      if (entry.error.stack) {
        logMessage += `\n${entry.error.stack}`;
      }
    }
    
    return logMessage;
  }

  // Write log to console
  private writeToConsole(entry: LogEntry): void {
    if (!this.enableConsole) return;

    const message = this.formatEntry(entry);
    
    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(message);
        break;
      case LogLevel.INFO:
        console.info(message);
        break;
      case LogLevel.WARN:
        console.warn(message);
        break;
      case LogLevel.ERROR:
        console.error(message);
        break;
    }
  }

  // Write log to file
  private async writeToFile(entry: LogEntry): Promise<void> {
    if (!this.logFile) return;

    try {
      const message = this.formatEntry(entry) + "\n";
      await Deno.writeTextFile(this.logFile, message, { append: true });
    } catch (error) {
      console.error("Failed to write to log file:", error);
    }
  }

  // Log method
  private async log(level: LogLevel, message: string, context?: any, error?: Error): Promise<void> {
    if (!this.shouldLog(level)) return;

    const entry = this.createEntry(level, message, context, error);
    
    // Write to console
    this.writeToConsole(entry);
    
    // Write to file (async)
    if (this.logFile) {
      await this.writeToFile(entry);
    }
  }

  // Public logging methods
  async debug(message: string, context?: any): Promise<void> {
    await this.log(LogLevel.DEBUG, message, context);
  }

  async info(message: string, context?: any): Promise<void> {
    await this.log(LogLevel.INFO, message, context);
  }

  async warn(message: string, context?: any, error?: Error): Promise<void> {
    await this.log(LogLevel.WARN, message, context, error);
  }

  async error(message: string, context?: any, error?: Error): Promise<void> {
    await this.log(LogLevel.ERROR, message, context, error);
  }

  // Log WebSocket events
  async logWebSocketEvent(
    event: string, 
    playerId?: string, 
    roomId?: string, 
    details?: any
  ): Promise<void> {
    const context: any = {};
    if (playerId) context.playerId = playerId;
    if (roomId) context.roomId = roomId;
    if (details) context.details = details;

    await this.info(`WebSocket ${event}`, context);
  }

  // Log game events
  async logGameEvent(
    event: string,
    roomId: string,
    playerId?: string,
    details?: any
  ): Promise<void> {
    const context: any = { roomId };
    if (playerId) context.playerId = playerId;
    if (details) context.details = details;

    await this.info(`Game ${event}`, context);
  }

  // Log payment events
  async logPayment(
    playerId: string,
    amount: number,
    method: string,
    status: string,
    details?: any
  ): Promise<void> {
    const context = {
      playerId,
      amount,
      method,
      status,
      ...details
    };

    await this.info(`Payment ${status}`, context);
  }

  // Log win events
  async logWin(
    playerId: string,
    roomId: string,
    amount: number,
    pattern: string,
    details?: any
  ): Promise<void> {
    const context = {
      playerId,
      roomId,
      amount,
      pattern,
      ...details
    };

    await this.info(`Win announced`, context);
  }

  // Log admin actions
  async logAdminAction(
    adminId: string,
    action: string,
    target?: string,
    details?: any
  ): Promise<void> {
    const context: any = { adminId, action };
    if (target) context.target = target;
    if (details) context.details = details;

    await this.info(`Admin action: ${action}`, context);
  }

  // Log error with context
  async logError(
    error: Error,
    context?: any,
    message: string = "An error occurred"
  ): Promise<void> {
    await this.error(message, context, error);
  }

  // Log server statistics
  async logStatistics(stats: any): Promise<void> {
    await this.debug("Server statistics", stats);
  }

  // Get log entries (for admin viewing)
  async getLogEntries(
    level?: LogLevel,
    startTime?: Date,
    endTime?: Date,
    limit: number = 100
  ): Promise<LogEntry[]> {
    // In production, this would read from log file or database
    // For now, return empty array
    return [];
  }

  // Clear old logs
  async clearOldLogs(daysToKeep: number = 7): Promise<void> {
    if (!this.logFile) return;

    try {
      // In production, implement log rotation
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - daysToKeep);
      
      // Read file, filter, write back
      // Simplified for now
      console.log(`Clearing logs older than ${daysToKeep} days`);
    } catch (error) {
      await this.error("Failed to clear old logs", {}, error);
    }
  }
}

// Export singleton instance
export const logger = Logger.getInstance();

// Middleware for Oak framework
export async function loggingMiddleware(ctx: any, next: () => Promise<void>) {
  const startTime = Date.now();
  
  try {
    await next();
    
    const duration = Date.now() - startTime;
    
    logger.info("HTTP request", {
      method: ctx.request.method,
      url: ctx.request.url.pathname,
      status: ctx.response.status,
      duration: `${duration}ms`,
      ip: ctx.request.ip,
      userAgent: ctx.request.headers.get("user-agent")
    });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error("HTTP request error", {
      method: ctx.request.method,
      url: ctx.request.url.pathname,
      status: ctx.response.status || 500,
      duration: `${duration}ms`,
      ip: ctx.request.ip,
      error: error.message
    }, error as Error);
    
    throw error;
  }
}