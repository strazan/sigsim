import type { Plugin } from "esbuild";
import { defineConfig } from "tsup";

const nativeRewrite: Plugin = {
  name: "native-cjs-rewrite",
  setup(build) {
    build.onResolve({ filter: /native\.cjs$/ }, () => ({
      path: "../native.cjs",
      external: true,
    }));
  },
};

export default defineConfig({
  entry: ["ts/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: false,
  clean: true,
  outDir: "dist",
  splitting: false,
  noExternal: [],
  esbuildPlugins: [nativeRewrite],
});
