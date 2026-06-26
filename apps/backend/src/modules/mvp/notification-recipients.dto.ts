import { ArrayMaxSize, IsArray, IsEmail, IsString, MaxLength } from 'class-validator';

/**
 * Phase 5C-2 — DTO для PUT /notification-staff-recipients.
 * Заменяет список email сотрудников тенанта целиком (пустой массив = выключить копии).
 * Нормализация (trim/lowercase) и дедуп — в `MvpService.setNotificationStaffRecipients`.
 * Формат адреса валидируется здесь (бэкенд — граница доверия): мусорные строки в обход UI
 * не должны попасть в снимок и сорвать ночную cron-рассылку.
 */
export class SetNotificationStaffRecipientsRequest {
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(254, { each: true })
  @IsEmail({}, { each: true })
  emails!: string[];
}
