import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { RedisOptions } from 'ioredis';

@Injectable()
export class RedisService implements OnApplicationShutdown {
  private readonly client: Redis;
  private readonly bullConnection: RedisOptions;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('REDIS_HOST', 'localhost');
    const port = parseInt(this.configService.get<string>('REDIS_PORT', '6379'), 10);
    const password = this.configService.get<string>('REDIS_PASSWORD');

    this.bullConnection = {
      host,
      port,
      password,
      maxRetriesPerRequest: null,
    };

    this.client = new Redis(this.bullConnection);
  }

  getClient(): Redis {
    return this.client;
  }

  getBullConnection(): RedisOptions {
    return { ...this.bullConnection };
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }

  // Additional methods for CDP services
  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string): Promise<void> {
    await this.client.set(key, value);
  }

  async setex(key: string, seconds: number, value: string): Promise<void> {
    await this.client.setex(key, seconds, value);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async exists(key: string): Promise<number> {
    return this.client.exists(key);
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async expire(key: string, seconds: number): Promise<number> {
    return this.client.expire(key, seconds);
  }

  async lpush(key: string, value: string): Promise<number> {
    return this.client.lpush(key, value);
  }

  async rpop(key: string): Promise<string | null> {
    return this.client.rpop(key);
  }

  async publish(channel: string, message: string): Promise<number> {
    return this.client.publish(channel, message);
  }

  async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    const subscriber = new Redis(this.bullConnection);
    await subscriber.subscribe(channel);
    subscriber.on('message', (receivedChannel, message) => {
      if (receivedChannel === channel) {
        callback(message);
      }
    });
  }

  async addToRoom(socketId: string, room: string): Promise<void> {
    await this.client.sadd(`room:${room}`, socketId);
  }

  async removeFromRoom(socketId: string, room: string): Promise<void> {
    await this.client.srem(`room:${room}`, socketId);
  }

  async getRoomMembers(room: string): Promise<string[]> {
    return this.client.smembers(`room:${room}`);
  }

  async sendToRoom(room: string, event: string, data: any): Promise<void> {
    const members = await this.getRoomMembers(room);
    const message = JSON.stringify({ event, data });
    
    for (const socketId of members) {
      await this.client.publish(`socket:${socketId}`, message);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.client.status === 'end') {
      return;
    }

    await this.client.quit().catch(async () => {
      await this.client.disconnect(false);
    });
  }
}
