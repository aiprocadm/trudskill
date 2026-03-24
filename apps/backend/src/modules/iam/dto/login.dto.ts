export class LoginDto {
  login!: string;
  password!: string;
}

export class RefreshDto {
  refreshToken!: string;
}

export class LogoutDto {
  sessionId!: string;
}

export class SetUserRolesDto {
  roleCodes!: string[];
}
