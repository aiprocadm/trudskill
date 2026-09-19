import { Module } from '@nestjs/common';

import { SupportController } from './support.controller.js';
import { AuditModule } from '../audit/audit.module.js';

/**
 * Обращения «Сообщить о проблеме» (ТЗ «Стабилизация, UX и развитие», 15.5).
 *
 * Модуль из одного контроллера и без своего хранилища: обращение попадает в журнал аудита —
 * туда же, куда всё остальное, что нужно уметь найти потом. Отдельная таблица обращений была бы
 * второй сущностью с теми же свойствами (есть автор, есть время, ищется по человеку и по дате),
 * а журнал уже умеет всё это и переживает перезапуски.
 */
@Module({
  imports: [AuditModule],
  controllers: [SupportController]
})
export class SupportModule {}
