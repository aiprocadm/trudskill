import { Type } from 'class-transformer';
import { IsObject, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';

class PushSubscriptionKeysDto {
  @IsString()
  @MinLength(1)
  p256dh!: string;

  @IsString()
  @MinLength(1)
  auth!: string;
}

/** POST /web-push/subscribe — браузерный PushSubscription.toJSON(). */
export class SubscribePushRequest {
  @IsString()
  @MinLength(1)
  endpoint!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys!: PushSubscriptionKeysDto;

  @IsOptional()
  @IsString()
  userAgent?: string;
}

/** DELETE /web-push/subscribe — отписка по endpoint. */
export class UnsubscribePushRequest {
  @IsString()
  @MinLength(1)
  endpoint!: string;
}
