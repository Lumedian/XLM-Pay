import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { VoiceSessionService } from './services/voice-session.service';
import { StreamingResponseService } from './services/streaming-response.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { VoiceMessageDto } from './dto/voice-message.dto';
import { SessionActionDto } from './dto/session-action.dto';
import { ConversationState } from './types/conversation-state.enum';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/voice',
})
export class VoiceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(VoiceGateway.name);

  constructor(
    private readonly voiceSessionService: VoiceSessionService,
    private readonly streamingResponseService: StreamingResponseService,
  ) {}

  async handleConnection(client: Socket) {
    const userId = client.handshake.auth.userId;
    const sessionId = client.handshake.auth.sessionId;

    this.logger.log(`Voice client connected: ${client.id}, userId: ${userId}`);

    if (userId && sessionId) {
      // Resume existing session
      const session = await this.voiceSessionService.getSession(sessionId);
      if (session && session.userId === userId) {
        await this.voiceSessionService.updateSessionSocket(
          sessionId,
          client.id,
        );
        await this.voiceSessionService.resumeSession(sessionId);

        client.join(sessionId);
        // AC-1: restore the Redis-backed active-session pointer on reconnect
        await this.voiceSessionService.setUserActiveSession(userId, sessionId);

        client.emit('voice:resumed', { sessionId, state: session.state });
        this.logger.log(
          `Resumed voice session ${sessionId} for user ${userId}`,
        );
      } else {
        client.emit('voice:error', { message: 'Invalid session' });
        client.disconnect();
      }
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = client.handshake.auth.userId;
    const sessionId = client.handshake.auth.sessionId;

    this.logger.log(
      `Voice client disconnected: ${client.id}, userId: ${userId}`,
    );

    if (userId && sessionId) {
      // Don't terminate session immediately — allow for reconnection.
      // The Redis TTL on the active-session pointer will expire naturally (10 min)
      // and the cron job will clean up truly stale sessions.
      await this.voiceSessionService.updateSessionState(
        sessionId,
        ConversationState.IDLE,
      );
      // AC-1: remove the active-session pointer so other instances know the socket is gone
      await this.voiceSessionService.deleteUserActiveSession(userId);
    }
  }

  @SubscribeMessage('voice:create-session')
  async createSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() createSessionDto: CreateSessionDto,
  ) {
    try {
      const userId = client.handshake.auth.userId;
      if (!userId) {
        client.emit('voice:error', { message: 'Authentication required' });
        return;
      }

      // Check if user already has an active session
      const existingSessions =
        await this.voiceSessionService.getUserActiveSessions(userId);
      if (existingSessions.length > 0) {
        const existingSession = existingSessions[0];
        await this.voiceSessionService.updateSessionSocket(
          existingSession.id,
          client.id,
        );
        client.join(existingSession.id);
        // AC-1: keep the Redis pointer in sync
        await this.voiceSessionService.setUserActiveSession(
          userId,
          existingSession.id,
        );

        client.emit('voice:session-created', { session: existingSession });
        return;
      }

      // Create new session — throws if the per-user limit is hit (AC-4)
      let session;
      try {
        session = await this.voiceSessionService.createSession(
          createSessionDto.userId,
          createSessionDto.context,
          createSessionDto.walletAddress,
          createSessionDto.metadata,
        );
      } catch (err: any) {
        if (err.message?.includes('Session limit reached')) {
          client.emit('voice:error', {
            code: 'SESSION_LIMIT_REACHED',
            message: err.message,
          });
          return;
        }
        throw err;
      }

      await this.voiceSessionService.updateSessionSocket(session.id, client.id);
      client.join(session.id);
      // AC-1: store the active-session pointer in Redis
      await this.voiceSessionService.setUserActiveSession(userId, session.id);

      client.emit('voice:session-created', { session });
      this.logger.log(`Created voice session ${session.id} for user ${userId}`);
    } catch (error) {
      this.logger.error('Error creating session:', error);
      client.emit('voice:error', { message: 'Failed to create session' });
    }
  }

  @SubscribeMessage('voice:message')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() messageDto: VoiceMessageDto,
  ) {
    try {
      const userId = client.handshake.auth.userId;
      // AC-1: resolve the session via Redis instead of the in-memory Map
      const sessionId =
        await this.voiceSessionService.getUserActiveSession(userId);

      if (!sessionId) {
        client.emit('voice:error', { message: 'No active session' });
        return;
      }

      const session = await this.voiceSessionService.getSession(sessionId);
      if (!session || session.userId !== userId) {
        client.emit('voice:error', { message: 'Invalid session' });
        return;
      }

      // Start streaming response
      const streamId =
        await this.streamingResponseService.startStreamingResponse(
          this.server,
          sessionId,
          messageDto.content,
        );

      this.logger.log(
        `Started streaming response ${streamId} for session ${sessionId}`,
      );
    } catch (error) {
      this.logger.error('Error handling message:', error);
      client.emit('voice:error', { message: 'Failed to process message' });
    }
  }

  @SubscribeMessage('voice:interrupt')
  async handleInterrupt(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { streamId?: string },
  ) {
    try {
      const userId = client.handshake.auth.userId;
      // AC-1: resolve the session via Redis
      const sessionId =
        await this.voiceSessionService.getUserActiveSession(userId);

      if (!sessionId) {
        client.emit('voice:error', { message: 'No active session' });
        return;
      }

      const success = await this.streamingResponseService.interruptStream(
        this.server,
        sessionId,
        data.streamId,
      );

      if (success) {
        client.emit('voice:interrupt-acknowledged', {
          sessionId,
          streamId: data.streamId,
        });
      } else {
        client.emit('voice:error', { message: 'Failed to interrupt' });
      }
    } catch (error) {
      this.logger.error('Error handling interrupt:', error);
      client.emit('voice:error', { message: 'Failed to interrupt' });
    }
  }

  @SubscribeMessage('voice:action')
  async handleSessionAction(
    @ConnectedSocket() client: Socket,
    @MessageBody() actionDto: SessionActionDto,
  ) {
    try {
      const userId = client.handshake.auth.userId;
      // AC-1: resolve the session via Redis
      const sessionId =
        await this.voiceSessionService.getUserActiveSession(userId);

      if (!sessionId) {
        client.emit('voice:error', { message: 'No active session' });
        return;
      }

      if (actionDto.interrupt) {
        await this.streamingResponseService.interruptStream(
          this.server,
          sessionId,
        );
      }

      if (actionDto.state) {
        const success = await this.voiceSessionService.updateSessionState(
          sessionId,
          actionDto.state,
        );

        if (success) {
          client.emit('voice:state-updated', {
            sessionId,
            state: actionDto.state,
          });
        } else {
          client.emit('voice:error', { message: 'Invalid state transition' });
        }
      }
    } catch (error) {
      this.logger.error('Error handling session action:', error);
      client.emit('voice:error', { message: 'Failed to perform action' });
    }
  }

  @SubscribeMessage('voice:terminate')
  async handleTerminate(@ConnectedSocket() client: Socket) {
    try {
      const userId = client.handshake.auth.userId;
      // AC-1: resolve the session via Redis
      const sessionId =
        await this.voiceSessionService.getUserActiveSession(userId);

      if (!sessionId) {
        client.emit('voice:error', { message: 'No active session' });
        return;
      }

      // Interrupt any active streams
      await this.streamingResponseService.interruptStream(
        this.server,
        sessionId,
      );

      // Terminate session (also clears the active-session pointer)
      const success =
        await this.voiceSessionService.terminateSession(sessionId);

      if (success) {
        client.leave(sessionId);
        // AC-1: explicit pointer removal (terminateSession also handles this,
        // but we remove here for defence-in-depth)
        await this.voiceSessionService.deleteUserActiveSession(userId);
        client.emit('voice:terminated', { sessionId });
        this.logger.log(
          `Terminated voice session ${sessionId} for user ${userId}`,
        );
      } else {
        client.emit('voice:error', { message: 'Failed to terminate session' });
      }
    } catch (error) {
      this.logger.error('Error terminating session:', error);
      client.emit('voice:error', { message: 'Failed to terminate session' });
    }
  }

  @SubscribeMessage('voice:ping')
  async handlePing(@ConnectedSocket() client: Socket) {
    const userId = client.handshake.auth.userId;
    // AC-1: resolve the session via Redis
    const sessionId =
      await this.voiceSessionService.getUserActiveSession(userId);

    if (sessionId) {
      // Update session last activity and heartbeat timestamp (AC-2)
      await this.voiceSessionService.updateSessionSocket(sessionId, client.id);
      await this.voiceSessionService.updateLastPingAt(sessionId);
      // AC-1: refresh the 10-minute TTL on the active-session pointer
      await this.voiceSessionService.refreshUserSessionTTL(userId);
    }

    client.emit('voice:pong', { timestamp: Date.now() });
  }
}
