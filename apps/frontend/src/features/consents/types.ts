/** Раздельные согласия на ПДн и на фото (ФТ-C3.2, Фаза 3 Task 6). */
export type ConsentKind = 'personal_data' | 'photo';

export interface ConsentStateDto {
  kind: ConsentKind;
  /** Действует ли согласие прямо сейчас — единственное, на что смотрит запрет подачи. */
  granted: boolean;
  grantedAt?: string;
  revokedAt?: string;
  /** Текст согласия изменился после того, как слушатель его дал. */
  renewalRecommended: boolean;
  documentVersion?: number;
  hasDocument: boolean;
}

export interface ConsentStatusDto {
  learnerId: string;
  personalData: ConsentStateDto;
  photo: ConsentStateDto;
}

export interface ConsentDocumentDto {
  kind: ConsentKind;
  version: number;
  body: string;
  bodyHash: string;
  createdAt: string;
}

export interface ConsentDocumentsDto {
  personal_data: ConsentDocumentDto | null;
  photo: ConsentDocumentDto | null;
}
