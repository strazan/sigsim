# sigsim

Detect near-duplicate files in Node.js using TLSH fingerprints. Native Rust, prebuilt binaries.

## Install

```bash
pnpm add sigsim
```

## Usage

```ts
import { sigsim } from "sigsim";

// Fingerprint a file (returns null if too small / no entropy)
const fp = await sigsim.file("/path/to/upload.pdf");
// → "T1A12..." (70-char hex string) or null

// Fingerprint a buffer
const fp = await sigsim.buffer(data);

// Distance between two fingerprints (0 = identical, lower = more similar)
const d = sigsim.distance(fpA, fpB);

// Boolean similarity check with threshold (default 30)
sigsim.similar(fpA, fpB); // true/false
sigsim.similar(fpA, fpB, { threshold: 60 }); // more lenient
```

### Batch fingerprinting

Fingerprint many files in a single native call. Rayon distributes files across cores - no NAPI overhead per file.

```ts
const fps = await sigsim.files([
  "/uploads/a.pdf",
  "/uploads/b.png",
  "/uploads/c.docx",
]);
```

### Bulk search

Find similar fingerprints in an array. Results sorted by distance (ascending).

```ts
const matches = sigsim.search(needle, haystack, { threshold: 30 });
// → [{ index: 3, distance: 12 }, { index: 7, distance: 28 }]
```

## Benchmarks

Measured on Apple M3 Pro, Node.js v24. Compared against [`tlsh`](https://www.npmjs.com/package/tlsh) (pure JS TLSH) and [`ssdeep.js`](https://github.com/cloudtracer/ssdeep.js) (pure JS ssdeep).

### Fingerprint throughput

| Size | sigsim (native) | tlsh (JS) | ssdeep.js | vs tlsh | vs ssdeep |
|------|-----------------|-----------|-----------|---------|-----------|
| 1 KB | 0.024ms | 0.11ms | 0.15ms | **4x** | **6x** |
| 64 KB | 0.26ms | 5.9ms | 7.6ms | **23x** | **29x** |
| 1 MB | 3.8ms | 94ms | 256ms | **24x** | **67x** |

### Search at scale

Single-call search across a haystack of pre-computed fingerprints, vs ssdeep.js loop:

| Haystack size | sigsim (native) | ssdeep.js | Speedup |
|---------------|-----------------|-----------|---------|
| 1,000 | 0.16ms | 2.2ms | **14x** |
| 10,000 | 1.6ms | 20ms | **12x** |
| 100,000 | 17ms | 199ms | **12x** |

Run benchmarks yourself:

```bash
pnpm bench
```

## How it works

- **TLSH**: Trend Micro Locality Sensitive Hash. Analyzes byte distribution patterns to produce a 70-char fingerprint that tolerates minor changes (metadata updates, re-exports, re-saves)
- **Distance, not similarity**: TLSH native unit is distance 0-1000+. Threshold 30 = near-exact duplicate (0.007% FP rate). No lossy conversion to 0-1
- **`null` for unhashable**: TLSH requires ~50+ bytes and sufficient entropy. Returns `null` instead of throwing
- **Sync distance ops**: `distance()`, `similar()`, `search()` are synchronous - pure CPU math on small fixed-size data
- **Batch API**: Single NAPI boundary crossing for N files. Rayon distributes work across cores inside Rust - no JS event loop involvement
- **mmap**: Files > 1 MB are memory-mapped for zero-copy reads
