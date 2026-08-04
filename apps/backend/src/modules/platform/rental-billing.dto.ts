import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min
} from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `POST /platform/rental-invoices` — выставить счёт аренды (ФТ-D5.1). */
export class IssueRentalInvoiceRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  tenantId!: string;

  /** Номер ведёт бухгалтерия платформы — своей маски не навязываем. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  number!: string;

  @IsString()
  @Matches(ISO_DATE)
  periodStart!: string;

  @IsString()
  @Matches(ISO_DATE)
  periodEnd!: string;

  /** Копейки: деньги дробным типом не принимаем. */
  @IsInt()
  @Min(0)
  amountKopecks!: number;

  @IsOptional()
  @IsString()
  @Matches(ISO_DATE)
  dueAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsIn(['manual', 'noop', 'yookassa'])
  providerCode?: 'manual' | 'noop' | 'yookassa';
}
