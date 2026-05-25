function readStringField(value: Record<string, unknown>, key: string): string | null {
  const field = value[key]
  return typeof field === 'string' && field.trim() ? field.trim() : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

export function getErrorMessage(error: unknown, fallback = '操作失败，请稍后重试') {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  if (!isRecord(error)) {
    return fallback
  }

  const message = readStringField(error, 'message')
    ?? readStringField(error, 'error_description')
    ?? readStringField(error, 'error')

  if (!message) {
    return fallback
  }

  const detail = readStringField(error, 'details') ?? readStringField(error, 'hint')
  const code = readStringField(error, 'code')
  const suffix = code ? `（${code}）` : ''

  return detail ? `${message}：${detail}${suffix}` : `${message}${suffix}`
}
