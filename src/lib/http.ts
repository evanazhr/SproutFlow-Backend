export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }

  static unauthorized(message = 'Sesi tidak valid, silakan login') {
    return new ApiError(401, 'UNAUTHORIZED', message)
  }

  static forbidden(message = 'Anda tidak memiliki izin') {
    return new ApiError(403, 'FORBIDDEN', message)
  }

  static notFound(message = 'Data tidak ditemukan') {
    return new ApiError(404, 'NOT_FOUND', message)
  }

  static validation(message = 'Input tidak valid') {
    return new ApiError(422, 'VALIDATION_ERROR', message)
  }

  static rateLimited(message = 'Terlalu banyak permintaan, coba lagi nanti') {
    return new ApiError(429, 'RATE_LIMITED', message)
  }
}
