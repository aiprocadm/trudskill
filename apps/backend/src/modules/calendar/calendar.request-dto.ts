import 'reflect-metadata';

import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength
} from 'class-validator';

import { CALENDAR_EVENT_TYPES } from './calendar.types.js';

import type { CalendarEventType } from './calendar.types.js';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** ТЗ перехода §16: `GET /calendar/events`. Списки — через запятую: `types=exam,task`. */
export class CalendarEventsQuery {
  @Matches(DAY, { message: 'from: дата в виде ГГГГ-ММ-ДД' })
  from!: string;

  @Matches(DAY, { message: 'to: дата в виде ГГГГ-ММ-ДД' })
  to!: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : value
  )
  @IsArray()
  @IsIn(CALENDAR_EVENT_TYPES, {
    each: true,
    message: `types: ожидается из: ${CALENDAR_EVENT_TYPES.join(', ')}`
  })
  types?: CalendarEventType[];

  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean({ message: 'mine: true или false' })
  mine?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  groupStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  counterpartyId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  directionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}
