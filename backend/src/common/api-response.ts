export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string | null;
}

export function ok<T>(data: T): ApiResponse<T> {
  return { success: true, data, message: null };
}
