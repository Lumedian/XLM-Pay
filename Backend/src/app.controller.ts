import { Controller, Get, UseGuards } from '@nestjs/common';
import { AppService } from './app.service';
import { ThrottleGuard } from './throttle/throttle.guard';
import { ThrottleStrategy } from './throttle/throttle.decorator';

@Controller()
@UseGuards(ThrottleGuard)
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ThrottleStrategy('GLOBAL')
  getHello(): string {
    return this.appService.getHello();
  }
}
