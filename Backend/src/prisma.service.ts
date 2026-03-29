import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { PrismaClient } from '@prisma/client';
import { getPrismaClientOptions } from '../prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super(getPrismaClientOptions());
  }

  async onModuleInit() {
    if (!process.env.DATABASE_URL || process.env.NODE_ENV === 'test') {
      return;
    }
    await this.$connect();
  }

  async onModuleDestroy () {
    await this.$disconnect();
  }
}
