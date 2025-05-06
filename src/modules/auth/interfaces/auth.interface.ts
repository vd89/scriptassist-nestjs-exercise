import { Role } from '@common/enums/role.enum';

export interface ILoginResponse {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email: string;
    role: Role;
  };
}

export interface IRegisterResponse {
  user: {
    id: string;
    email: string;
    name: string;
    role: Role;
  };
  token: string;
}

export interface IJwtPayload {
  sub: string;
  email?: string;
  role?: Role;
}

export interface ILogData {
  url: string;
  method: string;
  ip: string;
  userAgent: string;
  error: string;
  token: string;
}

export interface IValidateUserResponse {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface ITokenPair {
  accessToken: string;
  refreshToken: string;
} 