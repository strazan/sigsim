export interface SearchOptions {
  threshold?: number;
}

export interface SearchResult {
  index: number;
  distance: number;
}

export declare function fingerprintBuffer(data: Buffer): Promise<string | null>;

export declare function fingerprintFile(path: string): Promise<string | null>;

export declare function fingerprintFiles(
  paths: string[],
): Promise<(string | null)[]>;

export declare function tlshDistance(a: string, b: string): number;

export declare function tlshSimilar(
  a: string,
  b: string,
  options?: SearchOptions | undefined | null,
): boolean;

export declare function tlshSearch(
  needle: string,
  haystack: string[],
  options?: SearchOptions | undefined | null,
): SearchResult[];
