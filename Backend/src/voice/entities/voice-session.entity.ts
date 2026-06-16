import { randomUUID as uuidv4 } from 'crypto';
import { ConversationState } from '../types/conversation-state.enum';
import { FeatureContext } from '../types/feature-context.enum';

export interface VoiceMessage {
  id: string;
  content: string;
  timestamp: Date;
  isUser: boolean;
  metadata?: Record<string, any>;
}

export interface VoiceSession {
  id: string;
  userId: string;
  walletAddress?: string;
  context: FeatureContext;
  state: ConversationState;
  messages: VoiceMessage[];
  createdAt: Date;
  lastActivityAt: Date;
  /** Timestamp of the last voice:ping received; used for heartbeat timeout detection */
  lastPingAt?: Date;
  ttl: number; // Time to live in seconds
  socketId?: string;
  metadata?: Record<string, any>;
}

export class VoiceSessionFactory {
  static create(
    userId: string,
    context: FeatureContext,
    walletAddress?: string,
    metadata?: Record<string, any>,
  ): VoiceSession {
    const now = new Date();
    return {
      id: uuidv4(),
      userId,
      walletAddress,
      context,
      state: ConversationState.IDLE,
      messages: [],
      createdAt: now,
      lastActivityAt: now,
      ttl: 3600, // 1 hour default TTL
      metadata,
    };
  }
}
