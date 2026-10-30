// Bundles GramJS (npm "telegram") for the browser into one file,
// pages/telegram/gramjs-<version>.<fingerprint>.js, exposing window.GramJS =
// { TelegramClient, Api, StringSession }. Run: npm install && npm run build
// The parts of GramJS that only work in Node are swapped for their browser
// versions (as GramJS's own browser build does) or left out.
import * as esbuild from "esbuild";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const tg = path.join(here, "node_modules/telegram");
const version = JSON.parse(fs.readFileSync(path.join(tg, "package.json"), "utf8")).version;
// CryptoFile.js hands Node's crypto to the rest of GramJS as its default
// export; in the browser it hands over GramJS's own crypto/crypto.js instead,
// in the same shape.
const cryptoFile = path.join(tg, "CryptoFile.js");
const browserCrypto = path.join(tg, "crypto/crypto.js");
const leaveOut = new Set([path.join(tg, "extensions/net.js"), path.join(tg, "extensions/socks.js"), path.join(tg, "sessions/localStorage.js")]);
const nodeOnly = new Set(["net", "tls", "fs", "crypto", "constants", "node-localstorage", "socks"]);

const browserOnly = {
  name: "browser-only",
  setup(build) {
    build.onResolve({ filter: /.*/ }, async (args) => {
      if (args.pluginData || args.kind === "entry-point") return;
      if (nodeOnly.has(args.path)) return { path: args.path, namespace: "left-out" };
      const r = await build.resolve(args.path, { resolveDir: args.resolveDir, kind: args.kind, pluginData: true });
      if (r.errors.length) return;
      if (r.path === cryptoFile) return { path: r.path, namespace: "crypto-file" };
      if (leaveOut.has(r.path)) return { path: r.path, namespace: "left-out" };
      return r;
    });
    build.onLoad({ filter: /.*/, namespace: "left-out" }, () => ({ contents: "module.exports = {};", loader: "js" }));
    build.onLoad({ filter: /.*/, namespace: "crypto-file" }, () => ({
      contents: `Object.defineProperty(exports, "__esModule", { value: true }); exports.default = require(${JSON.stringify(browserCrypto)});`,
      loader: "js",
      resolveDir: path.dirname(cryptoFile)
    }));
  }
};

// The file is named after its contents (gramjs-<version>.<fingerprint>.js):
// ONE keeps app files on the device and never refetches a name it has, so a
// rebuilt bundle must get a new name. client.js is pointed at it, and older
// bundles are removed.
const pagesDir = path.join(here, "../../pages/telegram");
const result = await esbuild.build({
  entryPoints: [path.join(here, "entry.js")],
  bundle: true,
  format: "iife",
  globalName: "GramJS",
  platform: "browser",
  target: "es2020",
  minify: true,
  legalComments: "none",
  inject: [path.join(here, "shim.js")],
  define: { global: "globalThis" },
  alias: { os: "os-browserify/browser", path: "path-browserify", util: "util", events: "events" },
  plugins: [browserOnly],
  banner: { js: `/* GramJS ${version} (MIT), bundled for ONE by tools/telegram (npm run build). */` },
  write: false,
  outfile: path.join(pagesDir, "gramjs.js")
});
const code = result.outputFiles[0].contents;
const fingerprint = crypto.createHash("sha256").update(code).digest("hex").slice(0, 10);
const name = `gramjs-${version}.${fingerprint}.js`;
for (const f of fs.readdirSync(pagesDir)) if (f.startsWith("gramjs-") && f !== name) fs.unlinkSync(path.join(pagesDir, f));
fs.writeFileSync(path.join(pagesDir, name), code);
const clientFile = path.join(pagesDir, "client.js");
fs.writeFileSync(clientFile, fs.readFileSync(clientFile, "utf8").replace(/"pages\/telegram\/gramjs-[^"]+\.js"/, `"pages/telegram/${name}"`));
console.log("wrote", name);
