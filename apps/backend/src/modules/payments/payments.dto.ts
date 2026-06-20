import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested
} from 'class-validator';

export class CreateOrderItemRequest {
  @IsString()
  @MinLength(1)
  groupId!: string;

  @IsString()
  @MinLength(1)
  learnerId!: string;

  @IsInt()
  @Min(0)
  unitAmount!: number; // kopecks
}

export class CreateOrderRequest {
  @IsIn(['learner', 'counterparty'])
  buyerType!: 'learner' | 'counterparty';

  @IsString()
  @MinLength(1)
  buyerId!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemRequest)
  items!: CreateOrderItemRequest[];
}

/** Learner self-order: buyer is the session learner, so no buyerType/buyerId in the body. */
export class CreateSelfOrderRequest {
  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemRequest)
  items!: CreateOrderItemRequest[];
}

export class MarkPaidRequest {
  @IsOptional()
  @IsIn(['manual', 'bank_transfer'])
  method?: 'manual' | 'bank_transfer';

  @IsOptional()
  @IsString()
  note?: string;
}

export class OrdersFilter {
  @IsOptional()
  @IsIn(['draft', 'awaiting_payment', 'paid', 'fulfilled', 'cancelled'])
  status?: string;
}
