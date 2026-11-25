export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (m = 'Не найдено') => new ApiError(404, 'not_found', m);
export const badRequest = (code: string, m: string) => new ApiError(400, code, m);
export const forbidden = (m = 'Нет доступа') => new ApiError(403, 'forbidden', m);
export const conflict = (code: string, m: string) => new ApiError(409, code, m);
export const tooMany = (m: string) => new ApiError(429, 'too_many_requests', m);
