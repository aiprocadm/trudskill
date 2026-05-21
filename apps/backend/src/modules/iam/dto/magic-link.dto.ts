import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class MagicLinkRequestDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class MagicLinkRedeemDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token!: string;
}
