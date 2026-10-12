export class EnigmaError extends Error {
  override name = 'EnigmaError';
  constructor(
    message: string,
    readonly code: string,
    readonly context: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** The engine was unreachable or returned a non-2xx response. */
export class EngineError extends EnigmaError {
  override name = 'EngineError';
  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message, 'ENGINE_ERROR', context);
  }
}

/** A step ran before the step it depends on. */
export class PipelineOrderError extends EnigmaError {
  override name = 'PipelineOrderError';
  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message, 'PIPELINE_ORDER', context);
  }
}
