export class ValidationError extends Error {}

export class StaleWriteError extends Error {
  constructor() {
    super('This trip was changed elsewhere — reload and try again.');
  }
}
