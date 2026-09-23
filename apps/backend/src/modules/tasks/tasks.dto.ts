import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested
} from 'class-validator';

import { TASK_BULK_ACTIONS, TASK_PRIORITIES } from './tasks.types.js';

import type { TaskBulkAction, TaskPriority } from './tasks.types.js';

/** §5.4 МГ-G2.1: название ≤ 200, исполнители, файлы ≤ 10, напоминание. */
export const TASK_TITLE_MAX = 200;
export const TASK_TEXT_MAX = 5000;
export const TASK_FILES_MAX = 10;
export const TASK_ASSIGNEES_MAX = 50;
export const TASK_BULK_MAX = 100;

export class TaskReminderDto {
  @IsInt()
  @Min(0)
  minutesBefore!: number;

  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  channels!: string[];
}

export class TaskLinksDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  counterpartyId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  groupId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  learnerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  lessonId?: string;
}

/** `POST /tasks` (§16). Обязательно только название: исполнитель по умолчанию — автор (§5.4). */
export class CreateTaskRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(TASK_TITLE_MAX)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(TASK_TEXT_MAX)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(TASK_ASSIGNEES_MAX)
  @IsString({ each: true })
  assigneeIds?: string[];

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(TASK_PRIORITIES)
  priority?: TaskPriority;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => TaskReminderDto)
  reminder?: TaskReminderDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => TaskLinksDto)
  links?: TaskLinksDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(TASK_FILES_MAX)
  @IsString({ each: true })
  fileIds?: string[];
}

/** `PATCH /tasks/:id` — те же поля, все необязательные; статус меняется только переходами. */
export class UpdateTaskRequest {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(TASK_TITLE_MAX)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(TASK_TEXT_MAX)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(TASK_ASSIGNEES_MAX)
  @IsString({ each: true })
  assigneeIds?: string[];

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(TASK_PRIORITIES)
  priority?: TaskPriority;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => TaskReminderDto)
  reminder?: TaskReminderDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => TaskLinksDto)
  links?: TaskLinksDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(TASK_FILES_MAX)
  @IsString({ each: true })
  fileIds?: string[];
}

/** `POST /tasks/:id/start|complete|confirm|return|cancel` — комментарий; для `return` обязателен (§5.4). */
export class TaskTransitionRequest {
  @IsOptional()
  @IsString()
  @MaxLength(TASK_TEXT_MAX)
  comment?: string;
}

/** `POST /tasks/:id/reschedule` (§16). */
export class RescheduleTaskRequest {
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(TASK_TEXT_MAX)
  comment?: string;
}

/** `POST /tasks/:id/comments` (§4: text ≤ 5000, необязательный файл). */
export class CreateTaskCommentRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(TASK_TEXT_MAX)
  text!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  fileId?: string;
}

/** `POST /tasks/bulk` (§16) — частичный успех по строкам. */
export class BulkTasksRequest {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(TASK_BULK_MAX)
  @IsString({ each: true })
  taskIds!: string[];

  @IsString()
  @IsIn(TASK_BULK_ACTIONS)
  action!: TaskBulkAction;

  @IsOptional()
  @IsObject()
  payload?: { startsAt?: string; dueAt?: string; comment?: string };
}
