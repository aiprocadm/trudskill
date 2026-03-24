import { Controller, Get, Module } from '@nestjs/common';
import type { HealthResponseContract } from '@cdoprof/api-contracts';

@Controller('health')
class HealthController {
  @Get()
  getHealth(): HealthResponseContract {
    return {
      data: {
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'backend'
      }
    };
  }
}

@Module({
  controllers: [HealthController]
})
export class AppModule {}
