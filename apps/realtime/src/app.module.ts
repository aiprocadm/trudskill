import { Controller, Get, Module } from '@nestjs/common';

@Controller('health')
class HealthController {
  @Get()
  health() {
    return {
      status: 'ok',
      service: 'realtime',
      timestamp: new Date().toISOString()
    };
  }
}

@Module({ controllers: [HealthController] })
export class AppModule {}
