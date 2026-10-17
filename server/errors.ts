export class NewsError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 503,
  ) {
    super("Headlines are temporarily unavailable. Please try again shortly.");
  }
}
