export interface ILoginResponse {
  access_token: string;
  user: {
    id: string;
    email: string;
    role: string;
  };
}

export interface IRegisterResponse {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
  token: string;
}

export interface IJwtPayload {
  sub: string;
  email?: string;
  role?: string;
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
  role: string;
} 