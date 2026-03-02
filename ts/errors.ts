export class SigsimError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SigsimError";
  }
}

export class FileNotFoundError extends SigsimError {
  constructor(path: string, options?: ErrorOptions) {
    super(`File not found: ${path}`, options);
    this.name = "FileNotFoundError";
  }
}

export function toSigsimError(err: unknown): SigsimError | FileNotFoundError {
  if (err instanceof Error && err.message.startsWith("ENOENT: ")) {
    return new FileNotFoundError(err.message.slice("ENOENT: ".length), { cause: err });
  }
  return new SigsimError(err instanceof Error ? err.message : String(err), {
    cause: err instanceof Error ? err : undefined,
  });
}
