import { IsNotEmpty, IsString, Matches } from 'class-validator';

/** Второй шаг логина: challenge из ответа login/redeem + код из приложения-аутентификатора. */
export class TotpVerifyDto {
  @IsString()
  @IsNotEmpty()
  challengeToken!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code!: string;
}

/** Подтверждение настройки / выключение 2FA — только код. */
export class TotpCodeDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code!: string;
}
