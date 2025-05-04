export interface HttpResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  path?: string;
  timestamp?: string;
} 