/** A rule violation the user can fix. `fieldErrors` is keyed by form field name. */
export class DomainError extends Error {
  readonly fieldErrors: Record<string, string>;
  constructor(message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = 'DomainError';
    this.fieldErrors = fieldErrors;
  }
}

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} tidak ditemukan.`);
    this.name = 'NotFoundError';
  }
}
