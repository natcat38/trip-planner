export class ValidationError extends Error {}

export class StaleWriteError extends Error {
  constructor() {
    super('This trip was changed elsewhere — reload and try again.');
  }
}

export class InvalidShareLinkError extends Error {
  constructor() {
    super('This link is no longer valid.');
  }
}
