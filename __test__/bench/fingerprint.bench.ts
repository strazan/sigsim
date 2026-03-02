import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error — no types
import ssdeep from "ssdeep.js";
// @ts-expect-error — no types
import jsTlsh from "tlsh";
import { afterAll, beforeAll, bench, describe } from "vitest";
import { sigsim } from "../../dist/index.js";
import { fingerprintBuffer, tlshDistance, tlshSearch } from "../../native.cjs";

let tempDir: string;
const files: Record<string, string> = {};
const buffers: Record<string, Buffer> = {};
const strings: Record<string, string> = {};

// Pre-computed for distance/search benches
let fpA: string;
let fpB: string;
let ssdeepA: string;
let ssdeepB: string;

// Search haystacks at different scales
let tlshHaystack1k: string[];
let tlshHaystack10k: string[];
let tlshHaystack100k: string[];
let ssdeepHaystack1k: string[];
let ssdeepHaystack10k: string[];
let ssdeepHaystack100k: string[];
let tlshNeedle: string;
let ssdeepNeedle: string;

const sizes = {
  "1KB": 1024,
  "64KB": 64 * 1024,
  "1MB": 1024 * 1024,
};

function randomSsdeepFingerprint(): string {
  const buf = randomBytes(1024);
  return ssdeep.digest(buf.toString("binary")) as string;
}

// --- Setup ---

beforeAll(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "sigsim-bench-"));

  for (const [label, size] of Object.entries(sizes)) {
    const buf = randomBytes(size);
    const filePath = join(tempDir, `${label}.bin`);
    writeFileSync(filePath, buf);
    files[label] = filePath;
    buffers[label] = buf;
    strings[label] = buf.toString("binary");
  }

  // Pre-compute fingerprints for distance benchmarks
  fpA = (await sigsim.file(files["1MB"]!))!;
  fpB = (await sigsim.file(files["64KB"]!))!;
  ssdeepA = ssdeep.digest(strings["1MB"]!) as string;
  ssdeepB = ssdeep.digest(strings["64KB"]!) as string;

  // Generate search haystacks using native fingerprints
  console.log("Generating 100k TLSH fingerprints (native)...");
  const tlshFps: string[] = [];
  const BATCH = 1000;
  for (let i = 0; i < 100_000; i += BATCH) {
    const promises = Array.from({ length: BATCH }, () =>
      fingerprintBuffer(Buffer.from(randomBytes(1024))),
    );
    const batch = await Promise.all(promises);
    for (const fp of batch) {
      if (fp) tlshFps.push(fp);
    }
  }
  tlshHaystack100k = tlshFps;
  tlshHaystack10k = tlshHaystack100k.slice(0, 10_000);
  tlshHaystack1k = tlshHaystack100k.slice(0, 1_000);
  tlshNeedle = tlshHaystack100k[0]!;

  console.log("Generating 100k ssdeep fingerprints...");
  ssdeepHaystack100k = Array.from({ length: 100_000 }, randomSsdeepFingerprint);
  ssdeepHaystack10k = ssdeepHaystack100k.slice(0, 10_000);
  ssdeepHaystack1k = ssdeepHaystack100k.slice(0, 1_000);
  ssdeepNeedle = ssdeepHaystack100k[0]!;
});

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// --- Fingerprint buffer ---

describe("fingerprint buffer: sigsim (native) vs tlsh (JS) vs ssdeep.js", () => {
  for (const label of Object.keys(sizes)) {
    bench(`sigsim native (${label})`, async () => {
      await fingerprintBuffer(buffers[label]!);
    });

    bench(`tlsh pure JS (${label})`, () => {
      jsTlsh(strings[label]!);
    });

    bench(`ssdeep.js (${label})`, () => {
      ssdeep.digest(strings[label]!);
    });
  }
});

// --- Fingerprint file ---

describe("fingerprint file: sigsim vs read+tlsh(JS) vs read+ssdeep.js", () => {
  for (const label of Object.keys(sizes)) {
    bench(`sigsim native (${label})`, async () => {
      await sigsim.file(files[label]!);
    });

    bench(`read + tlsh JS (${label})`, () => {
      jsTlsh(readFileSync(files[label]!).toString("binary"));
    });

    bench(`read + ssdeep.js (${label})`, () => {
      ssdeep.digest(readFileSync(files[label]!).toString("binary"));
    });
  }
});

// --- Distance ---

describe("distance computation", () => {
  bench("sigsim distance (native TLSH)", () => {
    tlshDistance(fpA, fpB);
  });

  bench("ssdeep.js similarity", () => {
    ssdeep.similarity(ssdeepA, ssdeepB);
  });
});

// --- Search at scale ---

describe("search at scale: sigsim vs ssdeep.js", () => {
  bench("sigsim 1k fingerprints", () => {
    tlshSearch(tlshNeedle, tlshHaystack1k, { threshold: 100 });
  });

  bench("ssdeep.js 1k comparisons", () => {
    for (const h of ssdeepHaystack1k) {
      ssdeep.similarity(ssdeepNeedle, h);
    }
  });

  bench("sigsim 10k fingerprints", () => {
    tlshSearch(tlshNeedle, tlshHaystack10k, { threshold: 100 });
  });

  bench("ssdeep.js 10k comparisons", () => {
    for (const h of ssdeepHaystack10k) {
      ssdeep.similarity(ssdeepNeedle, h);
    }
  });

  bench("sigsim 100k fingerprints", () => {
    tlshSearch(tlshNeedle, tlshHaystack100k, { threshold: 100 });
  });

  bench("ssdeep.js 100k comparisons", () => {
    for (const h of ssdeepHaystack100k) {
      ssdeep.similarity(ssdeepNeedle, h);
    }
  });
});
