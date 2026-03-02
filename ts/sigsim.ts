import {
  fingerprintBuffer,
  fingerprintFile,
  fingerprintFiles,
  tlshDistance,
  tlshSearch,
  tlshSimilar,
} from "../native.cjs";
import { toSigsimError } from "./errors.js";
import type { SearchOptions, SearchResult } from "./types.js";

async function withErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw toSigsimError(err);
  }
}

const file = (path: string): Promise<string | null> =>
  withErrors(() => fingerprintFile(path));

const files = (paths: string[]): Promise<(string | null)[]> =>
  withErrors(() => fingerprintFiles(paths));

const buffer = (data: Buffer | Uint8Array): Promise<string | null> =>
  withErrors(() => {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    return fingerprintBuffer(buf);
  });

const distance = (a: string, b: string): number => tlshDistance(a, b);

const similar = (a: string, b: string, options?: SearchOptions): boolean =>
  tlshSimilar(a, b, options);

const search = (
  needle: string,
  haystack: string[],
  options?: SearchOptions,
): SearchResult[] => tlshSearch(needle, haystack, options);

export const sigsim = {
  file,
  files,
  buffer,
  distance,
  similar,
  search,
};
