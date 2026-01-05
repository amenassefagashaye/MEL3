// Validation service for the Bingo game

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  data?: any;
}

export class Validator {
  // Validate player registration
  static validateRegistration(data: any): ValidationResult {
    const errors: string[] = [];

    // Name validation
    if (!data.name || typeof data.name !== 'string') {
      errors.push("Name is required and must be a string");
    } else if (data.name.trim().length < 2) {
      errors.push("Name must be at least 2 characters long");
    } else if (data.name.length > 50) {
      errors.push("Name must not exceed 50 characters");
    }

    // Phone validation (Ethiopian format)
    if (!data.phone || typeof data.phone !== 'string') {
      errors.push("Phone number is required");
    } else {
      const phoneRegex = /^(09|\\+2519|2519)[0-9]{8}$/;
      const cleanPhone = data.phone.replace(/\s+/g, '');
      if (!phoneRegex.test(cleanPhone)) {
        errors.push("Invalid Ethiopian phone number format");
      }
    }

    // Stake validation
    if (!data.stake || typeof data.stake !== 'number') {
      errors.push("Stake amount is required");
    } else if (data.stake < 25) {
      errors.push("Minimum stake is 25 ETB");
    } else if (data.stake > 5000) {
      errors.push("Maximum stake is 5000 ETB");
    } else if (![25, 50, 100, 200, 500, 1000, 2000, 5000].includes(data.stake)) {
      errors.push("Stake must be one of the allowed amounts");
    }

    // Game type validation
    const validGameTypes = ['75ball', '90ball', '30ball', '50ball', 'pattern', 'coverall'];
    if (!data.gameType || !validGameTypes.includes(data.gameType)) {
      errors.push(`Game type must be one of: ${validGameTypes.join(', ')}`);
    }

    // Payment validation
    if (data.payment) {
      if (typeof data.payment !== 'number') {
        errors.push("Payment must be a number");
      } else if (data.payment < 25) {
        errors.push("Minimum payment is 25 ETB");
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      data: errors.length === 0 ? {
        name: data.name.trim(),
        phone: data.phone.replace(/\s+/g, ''),
        stake: data.stake,
        gameType: data.gameType,
        payment: data.payment || 0
      } : undefined
    };
  }

  // Validate payment
  static validatePayment(data: any): ValidationResult {
    const errors: string[] = [];

    if (!data.amount || typeof data.amount !== 'number') {
      errors.push("Payment amount is required");
    } else if (data.amount < 25) {
      errors.push("Minimum payment is 25 ETB");
    } else if (data.amount > 50000) {
      errors.push("Maximum payment is 50000 ETB");
    }

    if (!data.playerId || typeof data.playerId !== 'string') {
      errors.push("Player ID is required");
    }

    return {
      isValid: errors.length === 0,
      errors,
      data: errors.length === 0 ? {
        amount: data.amount,
        playerId: data.playerId,
        method: data.method || 'unknown'
      } : undefined
    };
  }

  // Validate win claim
  static validateWinClaim(data: any): ValidationResult {
    const errors: string[] = [];

    if (!data.playerId || typeof data.playerId !== 'string') {
      errors.push("Player ID is required");
    }

    if (!data.pattern || typeof data.pattern !== 'string') {
      errors.push("Winning pattern is required");
    }

    if (!data.amount || typeof data.amount !== 'number') {
      errors.push("Win amount is required");
    } else if (data.amount < 0) {
      errors.push("Win amount cannot be negative");
    }

    if (!data.roomId || typeof data.roomId !== 'string') {
      errors.push("Room ID is required");
    }

    return {
      isValid: errors.length === 0,
      errors,
      data: errors.length === 0 ? {
        playerId: data.playerId,
        pattern: data.pattern,
        amount: data.amount,
        roomId: data.roomId
      } : undefined
    };
  }

  // Validate number call
  static validateNumberCall(data: any, gameType: string): ValidationResult {
    const errors: string[] = [];

    if (!data.number) {
      errors.push("Number is required");
    }

    if (!data.roomId || typeof data.roomId !== 'string') {
      errors.push("Room ID is required");
    }

    // Validate number based on game type
    if (data.number) {
      switch (gameType) {
        case '75ball':
        case 'pattern':
          // Format: B-15, I-30, etc.
          const match75 = String(data.number).match(/^([BINGO])-(\d+)$/i);
          if (!match75) {
            errors.push("Number must be in format like B-15, I-30, etc.");
          } else {
            const [, letter, num] = match75;
            const numValue = parseInt(num);
            
            const ranges: { [key: string]: [number, number] } = {
              'B': [1, 15], 'I': [16, 30], 'N': [31, 45],
              'G': [46, 60], 'O': [61, 75]
            };
            
            const range = ranges[letter.toUpperCase()];
            if (!range || numValue < range[0] || numValue > range[1]) {
              errors.push(`Number for ${letter} must be between ${range[0]} and ${range[1]}`);
            }
          }
          break;

        case '90ball':
          const num90 = parseInt(data.number);
          if (isNaN(num90) || num90 < 1 || num90 > 90) {
            errors.push("Number must be between 1 and 90");
          }
          break;

        case '30ball':
          const num30 = parseInt(data.number);
          if (isNaN(num30) || num30 < 1 || num30 > 30) {
            errors.push("Number must be between 1 and 30");
          }
          break;

        case '50ball':
          const num50 = parseInt(data.number);
          if (isNaN(num50) || num50 < 1 || num50 > 50) {
            errors.push("Number must be between 1 and 50");
          }
          break;

        case 'coverall':
          const numCoverall = parseInt(data.number);
          if (isNaN(numCoverall) || numCoverall < 1 || numCoverall > 90) {
            errors.push("Number must be between 1 and 90");
          }
          break;
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      data: errors.length === 0 ? {
        number: data.number,
        roomId: data.roomId
      } : undefined
    };
  }

  // Validate room join
  static validateRoomJoin(data: any): ValidationResult {
    const errors: string[] = [];

    if (!data.playerId || typeof data.playerId !== 'string') {
      errors.push("Player ID is required");
    }

    if (!data.roomId || typeof data.roomId !== 'string') {
      errors.push("Room ID is required");
    }

    return {
      isValid: errors.length === 0,
      errors,
      data: errors.length === 0 ? {
        playerId: data.playerId,
        roomId: data.roomId
      } : undefined
    };
  }

  // Validate withdrawal request
  static validateWithdrawal(data: any): ValidationResult {
    const errors: string[] = [];

    if (!data.playerId || typeof data.playerId !== 'string') {
      errors.push("Player ID is required");
    }

    if (!data.amount || typeof data.amount !== 'number') {
      errors.push("Amount is required");
    } else if (data.amount < 25) {
      errors.push("Minimum withdrawal is 25 ETB");
    }

    if (!data.accountNumber || typeof data.accountNumber !== 'string') {
      errors.push("Account number is required");
    } else if (data.accountNumber.length < 10) {
      errors.push("Invalid account number");
    }

    return {
      isValid: errors.length === 0,
      errors,
      data: errors.length === 0 ? {
        playerId: data.playerId,
        amount: data.amount,
        accountNumber: data.accountNumber.trim()
      } : undefined
    };
  }

  // Validate admin command
  static validateAdminCommand(data: any): ValidationResult {
    const errors: string[] = [];

    if (!data.command || typeof data.command !== 'string') {
      errors.push("Command is required");
    }

    const validCommands = [
      'start_game', 'end_game', 'call_number', 'broadcast',
      'kick_player', 'get_stats', 'get_players', 'pause_game',
      'resume_game', 'reset_room'
    ];

    if (!validCommands.includes(data.command)) {
      errors.push(`Invalid command. Valid commands: ${validCommands.join(', ')}`);
    }

    // Validate command-specific data
    if (data.command === 'call_number' && !data.number) {
      errors.push("Number is required for call_number command");
    }

    if (data.command === 'broadcast' && !data.message) {
      errors.push("Message is required for broadcast command");
    }

    if (data.command === 'kick_player' && !data.playerId) {
      errors.push("Player ID is required for kick_player command");
    }

    if (data.command === 'start_game' && (!data.gameType || !data.stake)) {
      errors.push("Game type and stake are required for start_game command");
    }

    return {
      isValid: errors.length === 0,
      errors,
      data: errors.length === 0 ? {
        command: data.command,
        ...data
      } : undefined
    };
  }

  // Validate chat message
  static validateChatMessage(data: any): ValidationResult {
    const errors: string[] = [];

    if (!data.text || typeof data.text !== 'string') {
      errors.push("Message text is required");
    } else if (data.text.trim().length === 0) {
      errors.push("Message cannot be empty");
    } else if (data.text.length > 500) {
      errors.push("Message cannot exceed 500 characters");
    }

    if (!data.playerId || typeof data.playerId !== 'string') {
      errors.push("Player ID is required");
    }

    if (!data.roomId || typeof data.roomId !== 'string') {
      errors.push("Room ID is required");
    }

    // Check for inappropriate content (basic)
    const inappropriateWords = ['badword1', 'badword2']; // Add actual list
    const lowerText = data.text.toLowerCase();
    const foundWord = inappropriateWords.find(word => lowerText.includes(word));
    if (foundWord) {
      errors.push("Message contains inappropriate content");
    }

    return {
      isValid: errors.length === 0,
      errors,
      data: errors.length === 0 ? {
        text: data.text.trim().substring(0, 500),
        playerId: data.playerId,
        roomId: data.roomId
      } : undefined
    };
  }

  // Validate WebRTC signaling
  static validateRTCSignaling(data: any): ValidationResult {
    const errors: string[] = [];

    if (!data.type || !['offer', 'answer', 'ice_candidate'].includes(data.type)) {
      errors.push("Invalid signaling type");
    }

    if (!data.roomId || typeof data.roomId !== 'string') {
      errors.push("Room ID is required");
    }

    if (!data.senderId || typeof data.senderId !== 'string') {
      errors.push("Sender ID is required");
    }

    if (data.type === 'offer' && !data.sdp) {
      errors.push("SDP is required for offer");
    }

    if (data.type === 'answer' && !data.sdp) {
      errors.push("SDP is required for answer");
    }

    if (data.type === 'ice_candidate' && !data.candidate) {
      errors.push("Candidate is required for ice_candidate");
    }

    return {
      isValid: errors.length === 0,
      errors,
      data: errors.length === 0 ? {
        type: data.type,
        roomId: data.roomId,
        senderId: data.senderId,
        sdp: data.sdp,
        candidate: data.candidate
      } : undefined
    };
  }

  // Sanitize input (basic XSS prevention)
  static sanitizeInput(input: string): string {
    if (typeof input !== 'string') return '';
    
    return input
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  // Validate email (if needed in future)
  static validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // Validate Ethiopian ID (if needed)
  static validateEthiopianID(id: string): boolean {
    // Basic Ethiopian ID validation (10 digits)
    const idRegex = /^\d{10}$/;
    return idRegex.test(id);
  }

  // Validate date
  static validateDate(dateString: string): boolean {
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date.getTime());
  }

  // Validate numeric range
  static validateRange(value: number, min: number, max: number): boolean {
    return value >= min && value <= max;
  }

  // Generate validation error response
  static errorResponse(errors: string[]): any {
    return {
      type: "validation_error",
      errors,
      timestamp: new Date().toISOString()
    };
  }
}

// Export utility functions
export function validateRequired(value: any, fieldName: string): string | null {
  if (value === undefined || value === null || value === '') {
    return `${fieldName} is required`;
  }
  return null;
}

export function validateString(value: any, fieldName: string, minLength = 1, maxLength = 255): string | null {
  const requiredError = validateRequired(value, fieldName);
  if (requiredError) return requiredError;

  if (typeof value !== 'string') {
    return `${fieldName} must be a string`;
  }

  if (value.length < minLength) {
    return `${fieldName} must be at least ${minLength} characters`;
  }

  if (value.length > maxLength) {
    return `${fieldName} must not exceed ${maxLength} characters`;
  }

  return null;
}

export function validateNumber(value: any, fieldName: string, min?: number, max?: number): string | null {
  const requiredError = validateRequired(value, fieldName);
  if (requiredError) return requiredError;

  const num = Number(value);
  if (isNaN(num)) {
    return `${fieldName} must be a number`;
  }

  if (min !== undefined && num < min) {
    return `${fieldName} must be at least ${min}`;
  }

  if (max !== undefined && num > max) {
    return `${fieldName} must not exceed ${max}`;
  }

  return null;
}

export function validateArray(value: any, fieldName: string, minLength = 0): string | null {
  const requiredError = validateRequired(value, fieldName);
  if (requiredError) return requiredError;

  if (!Array.isArray(value)) {
    return `${fieldName} must be an array`;
  }

  if (value.length < minLength) {
    return `${fieldName} must contain at least ${minLength} items`;
  }

  return null;
}

export function validateBoolean(value: any, fieldName: string): string | null {
  const requiredError = validateRequired(value, fieldName);
  if (requiredError) return requiredError;

  if (typeof value !== 'boolean') {
    return `${fieldName} must be a boolean`;
  }

  return null;
}