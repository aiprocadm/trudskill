import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ApproveRecertificationDraftRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  targetGroupId!: string;
}

export class RejectRecertificationDraftRequest {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
