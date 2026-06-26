import { ArrayMaxSize, IsArray, IsString, MaxLength } from 'class-validator';

/**
 * Phase 5C-2 — DTO для PUT /notification-staff-recipients.
 * Заменяет список email сотрудников тенанта целиком (пустой массив = выключить копии).
 * Нормализация (trim/lowercase) и дедуп — в `MvpService.setNotificationStaffRecipients`.
 */
export class SetNotificationStaffRecipientsRequest {
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(254, { each: true })
  emails!: string[];
}
