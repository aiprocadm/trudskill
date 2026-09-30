import 'reflect-metadata';

import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min
} from 'class-validator';

const SOURCES = ['api'] as const;
const DOMAINS = ['counterparties', 'learners', 'all'] as const;
const ACTIONS = ['created', 'updated', 'skipped', 'failed'] as const;

/** ТЗ перехода §16: `POST /import/cdoprof/runs`. Выгрузки XLSX (`xlsx`) — срез 23.4. */
export class StartImportRunRequest {
  @IsIn(SOURCES, { message: `source: ожидается одно из: ${SOURCES.join(', ')}` })
  source!: (typeof SOURCES)[number];

  @IsIn(DOMAINS, { message: `domain: ожидается одно из: ${DOMAINS.join(', ')}` })
  domain!: (typeof DOMAINS)[number];

  @IsBoolean({ message: 'dryRun: ожидается true или false' })
  dryRun!: boolean;
}

export class ImportRowsQuery {
  @IsOptional()
  @IsIn(ACTIONS, { message: `action: ожидается одно из: ${ACTIONS.join(', ')}` })
  action?: (typeof ACTIONS)[number];

  /** Например `merge_candidate` — только кандидаты на слияние. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-z_]+$/, { message: 'errorCode: латинские строчные буквы и подчёркивание' })
  errorCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
