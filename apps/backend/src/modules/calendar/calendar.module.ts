import { Module } from '@nestjs/common';

import { CalendarController } from './calendar.controller.js';
import { CalendarService } from './calendar.service.js';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module.js';
import { IamModule } from '../iam/iam.module.js';
import { MvpModule } from '../mvp/mvp.module.js';
import { TasksModule } from '../tasks/tasks.module.js';

/** ТЗ перехода §5, Фаза 5: календарь — запрос по источникам, своего хранения нет. */
@Module({
  imports: [InfrastructureModule, IamModule, MvpModule, TasksModule],
  controllers: [CalendarController],
  providers: [CalendarService]
})
export class CalendarModule {}
