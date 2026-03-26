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

export class CreateUserDto {
  login!: string;
  email?: string | null;
  displayName!: string;
  password?: string;
  status?: 'active' | 'blocked';
}

export class UpdateUserDto {
  email?: string | null;
  displayName?: string;
  status?: 'active' | 'blocked';
}
