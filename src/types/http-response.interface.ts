export interface HttpResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface ServiceError extends Error {
  message: string;
  stack?: string;
}
