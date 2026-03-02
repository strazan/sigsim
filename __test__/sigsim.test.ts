import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FileNotFoundError, SigsimError, sigsim } from "../dist/index.js";

let tempDir: string;
let pdfLikePath: string;
let pdfLikePath2: string;
let differentFilePath: string;
let tinyFilePath: string;
let zeroEntropyPath: string;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "sigsim-test-"));

  // A file with enough size and entropy to fingerprint (>= 256 bytes with variation)
  pdfLikePath = join(tempDir, "document.pdf");
  const pdfData = randomBytes(4096);
  await writeFile(pdfLikePath, pdfData);

  // Same content with minor metadata change (flip a few bytes at the end)
  pdfLikePath2 = join(tempDir, "document-resaved.pdf");
  const pdfData2 = Buffer.from(pdfData);
  pdfData2[pdfData2.length - 1] = (pdfData2[pdfData2.length - 1]! + 1) % 256;
  pdfData2[pdfData2.length - 2] = (pdfData2[pdfData2.length - 2]! + 1) % 256;
  pdfData2[pdfData2.length - 3] = (pdfData2[pdfData2.length - 3]! + 1) % 256;
  await writeFile(pdfLikePath2, pdfData2);

  // Completely different file
  differentFilePath = join(tempDir, "different.bin");
  await writeFile(differentFilePath, randomBytes(4096));

  // Too small to fingerprint
  tinyFilePath = join(tempDir, "tiny.txt");
  await writeFile(tinyFilePath, "hi");

  // Zero entropy (all same bytes)
  zeroEntropyPath = join(tempDir, "zero.bin");
  await writeFile(zeroEntropyPath, Buffer.alloc(4096, 0xaa));
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("buffer", () => {
  it("fingerprints a buffer with enough data", async () => {
    const data = randomBytes(1024);
    const fp = await sigsim.buffer(data);
    expect(fp).not.toBeNull();
    expect(fp).toMatch(/^T1/);
  });

  it("returns null for tiny buffer", async () => {
    const fp = await sigsim.buffer(Buffer.from("hi"));
    expect(fp).toBeNull();
  });

  it("returns null for zero-entropy buffer", async () => {
    const fp = await sigsim.buffer(Buffer.alloc(4096, 0xaa));
    expect(fp).toBeNull();
  });

  it("produces consistent fingerprints", async () => {
    const data = randomBytes(2048);
    const fp1 = await sigsim.buffer(data);
    const fp2 = await sigsim.buffer(data);
    expect(fp1).toBe(fp2);
  });

  it("accepts Uint8Array", async () => {
    const data = new Uint8Array(randomBytes(1024));
    const fp = await sigsim.buffer(data);
    expect(fp).not.toBeNull();
  });
});

describe("file", () => {
  it("fingerprints a file", async () => {
    const fp = await sigsim.file(pdfLikePath);
    expect(fp).not.toBeNull();
    expect(fp).toMatch(/^T1/);
  });

  it("returns null for tiny file", async () => {
    const fp = await sigsim.file(tinyFilePath);
    expect(fp).toBeNull();
  });

  it("returns null for zero-entropy file", async () => {
    const fp = await sigsim.file(zeroEntropyPath);
    expect(fp).toBeNull();
  });

  it("throws FileNotFoundError for missing file", async () => {
    await expect(sigsim.file("/nonexistent/path/file.txt")).rejects.toThrow(FileNotFoundError);
  });

  it("file fingerprint matches buffer fingerprint", async () => {
    const data = randomBytes(2048);
    const filePath = join(tempDir, "match-test.bin");
    await writeFile(filePath, data);

    const fileFp = await sigsim.file(filePath);
    const bufFp = await sigsim.buffer(data);
    expect(fileFp).toBe(bufFp);
  });
});

describe("files (batch)", () => {
  it("fingerprints multiple files in one call", async () => {
    const fps = await sigsim.files([pdfLikePath, differentFilePath]);
    expect(fps).toHaveLength(2);
    expect(fps[0]).not.toBeNull();
    expect(fps[1]).not.toBeNull();
  });

  it("batch matches individual calls", async () => {
    const fps = await sigsim.files([pdfLikePath, differentFilePath]);
    const fp1 = await sigsim.file(pdfLikePath);
    const fp2 = await sigsim.file(differentFilePath);
    expect(fps[0]).toBe(fp1);
    expect(fps[1]).toBe(fp2);
  });

  it("handles empty array", async () => {
    const fps = await sigsim.files([]);
    expect(fps).toHaveLength(0);
  });

  it("throws on missing file in batch", async () => {
    await expect(sigsim.files([pdfLikePath, "/nonexistent/file"])).rejects.toThrow(SigsimError);
  });

  it("returns null for unhashable files in batch", async () => {
    const fps = await sigsim.files([pdfLikePath, tinyFilePath]);
    expect(fps[0]).not.toBeNull();
    expect(fps[1]).toBeNull();
  });
});

describe("distance", () => {
  it("returns 0 for same file fingerprinted twice", async () => {
    const fp = await sigsim.file(pdfLikePath);
    expect(fp).not.toBeNull();
    const d = sigsim.distance(fp!, fp!);
    expect(d).toBe(0);
  });

  it("returns low distance for minor metadata change", async () => {
    const fpA = await sigsim.file(pdfLikePath);
    const fpB = await sigsim.file(pdfLikePath2);
    expect(fpA).not.toBeNull();
    expect(fpB).not.toBeNull();
    const d = sigsim.distance(fpA!, fpB!);
    expect(d).toBeLessThan(30);
  });

  it("returns high distance for completely different files", async () => {
    const fpA = await sigsim.file(pdfLikePath);
    const fpB = await sigsim.file(differentFilePath);
    expect(fpA).not.toBeNull();
    expect(fpB).not.toBeNull();
    const d = sigsim.distance(fpA!, fpB!);
    expect(d).toBeGreaterThan(100);
  });
});

describe("similar", () => {
  it("returns true for same fingerprint", async () => {
    const fp = await sigsim.file(pdfLikePath);
    expect(fp).not.toBeNull();
    expect(sigsim.similar(fp!, fp!)).toBe(true);
  });

  it("returns true for near-duplicate", async () => {
    const fpA = await sigsim.file(pdfLikePath);
    const fpB = await sigsim.file(pdfLikePath2);
    expect(fpA).not.toBeNull();
    expect(fpB).not.toBeNull();
    expect(sigsim.similar(fpA!, fpB!)).toBe(true);
  });

  it("returns false for different files", async () => {
    const fpA = await sigsim.file(pdfLikePath);
    const fpB = await sigsim.file(differentFilePath);
    expect(fpA).not.toBeNull();
    expect(fpB).not.toBeNull();
    expect(sigsim.similar(fpA!, fpB!)).toBe(false);
  });

  it("respects custom threshold", async () => {
    const fpA = await sigsim.file(pdfLikePath);
    const fpB = await sigsim.file(differentFilePath);
    expect(fpA).not.toBeNull();
    expect(fpB).not.toBeNull();
    // Very high threshold should make everything similar
    expect(sigsim.similar(fpA!, fpB!, { threshold: 10000 })).toBe(true);
    // Very low threshold should make nearly everything dissimilar
    expect(sigsim.similar(fpA!, fpB!, { threshold: 0 })).toBe(false);
  });
});

describe("search", () => {
  it("finds similar fingerprints", async () => {
    const fpA = await sigsim.file(pdfLikePath);
    const fpB = await sigsim.file(pdfLikePath2);
    const fpC = await sigsim.file(differentFilePath);
    expect(fpA).not.toBeNull();
    expect(fpB).not.toBeNull();
    expect(fpC).not.toBeNull();

    const matches = sigsim.search(fpA!, [fpB!, fpC!]);
    // Should find fpB (near-duplicate) but not fpC (completely different)
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0]!.index).toBe(0);
    expect(matches[0]!.distance).toBeLessThan(30);
  });

  it("returns correct indices and distances", async () => {
    const fpA = await sigsim.file(pdfLikePath);
    expect(fpA).not.toBeNull();

    // Search against self — should always match
    const matches = sigsim.search(fpA!, [fpA!]);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.index).toBe(0);
    expect(matches[0]!.distance).toBe(0);
  });

  it("returns empty array when no matches", async () => {
    const fpA = await sigsim.file(pdfLikePath);
    const fpC = await sigsim.file(differentFilePath);
    expect(fpA).not.toBeNull();
    expect(fpC).not.toBeNull();

    const matches = sigsim.search(fpA!, [fpC!], { threshold: 5 });
    expect(matches).toHaveLength(0);
  });

  it("results are sorted by distance ascending", async () => {
    const fpA = await sigsim.file(pdfLikePath);
    const fpB = await sigsim.file(pdfLikePath2);
    expect(fpA).not.toBeNull();
    expect(fpB).not.toBeNull();

    const matches = sigsim.search(fpA!, [fpB!, fpA!], { threshold: 10000 });
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i]!.distance).toBeGreaterThanOrEqual(matches[i - 1]!.distance);
    }
  });
});

describe("error types", () => {
  it("SigsimError is an Error", () => {
    const err = new SigsimError("test");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(SigsimError);
    expect(err.name).toBe("SigsimError");
  });

  it("FileNotFoundError extends SigsimError", () => {
    const err = new FileNotFoundError("/test");
    expect(err).toBeInstanceOf(SigsimError);
    expect(err).toBeInstanceOf(FileNotFoundError);
    expect(err.name).toBe("FileNotFoundError");
  });
});
