import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { MessageRouterService } from '../services/message-router.service';

@Controller('message-router')
@ApiTags('message-router')
export class MessageRouterController {
  private readonly logger = new Logger(MessageRouterController.name);

  constructor(private readonly messageRouterService: MessageRouterService) {}

  @Get('queue-status')
  @ApiOperation({ summary: 'Get message queue status' })
  async getQueueStatus(): Promise<any> {
    return await this.messageRouterService.getQueueStatus();
  }
}
