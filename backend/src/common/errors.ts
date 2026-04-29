export class BusinessError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
  }
}

export class UnauthorizedError extends Error {}

export class ForbiddenError extends Error {}

export function requirePositiveNumber(value: unknown, name: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new BusinessError(name + ' is invalid');
  }
  return parsed;
}

export function compactText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}
