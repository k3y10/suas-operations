import { defineConfig } from "vite";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import bridge from "./api/workspace.js";
import environment from "./api/environment.js";
import fireContext from "./api/fire-context.js";
import avalanche from "./api/avalanche.js";
import pyro from "./api/pyro.js";
import rainfall from "./api/rainfall.js";
import integrity from "./api/integrity.js";
import {localSITLPlugin} from "./dev/local-sitl.js";
export default defineConfig({
  plugins: [
    localSITLPlugin(process.env.TERRASATCH_LOCAL_QA_DIR || null),
    {
      name: "local-workspace-bridge",
      configureServer(server) {
        server.middlewares.use("/api/avalanche",avalanche);
        server.middlewares.use("/api/pyro",pyro);
        server.middlewares.use("/api/rainfall",rainfall);
        server.middlewares.use("/api/integrity",integrity);
        server.middlewares.use("/api/environment",environment);
        server.middlewares.use("/api/fire-context",fireContext);
        server.middlewares.use("/api/workspace", (req, res) =>
          bridge(req, res),
        );
      },
      configurePreviewServer(server) {
        server.middlewares.use("/api/avalanche",avalanche);
        server.middlewares.use("/api/pyro",pyro);
        server.middlewares.use("/api/rainfall",rainfall);
        server.middlewares.use("/api/integrity",integrity);
        server.middlewares.use("/api/environment",environment);
        server.middlewares.use("/api/fire-context",fireContext);
        server.middlewares.use("/api/workspace", (req, res) =>
          bridge(req, res),
        );
      },
    },
    {
      name: "bounded-offline-shell",
      async closeBundle() {
        let paths = [
          "/",
          "/index.html",
          "/manifest.webmanifest",
          "/terrasatch-logo.png",
          "/satchy.png",
        ];
        for (const dir of ["assets", "fonts"])
          for (const f of await readdir("dist/" + dir))
            paths.push("/" + dir + "/" + f);
        let bytes = 0;
        const contentHash = createHash("sha256");
        for (const p of paths) if (p !== "/") {
          const content = await readFile("dist" + p);
          bytes += content.length; contentHash.update(p).update(content);
        }
        if (paths.length > 50 || bytes > 10 * 1024 * 1024)
          throw Error("Offline shell exceeds its resource budget");
        let sw = await readFile("public/sw.js", "utf8");
        const id = contentHash.digest("hex").slice(0, 12);
        sw = sw.replace(
          "terrasatch-sim-shell-v1",
          "terrasatch-sim-shell-" + id,
        );
        if (!/const CORE\s*=\s*\[[\s\S]*?\];/.test(sw)) throw Error("Offline worker asset list missing");
        sw = sw.replace(/const CORE\s*=\s*\[[\s\S]*?\];/, "const CORE = " + JSON.stringify(paths) + ";");
        await writeFile("dist/sw.js", sw);
        await writeFile(
          "dist/cache-budget.json",
          JSON.stringify({ version: id, files: paths.length, bytes }, null, 2),
        );
      },
    },
  ],
  server: { port: 3180, strictPort: true },
  preview: { port: 3181, strictPort: true },
  build: { chunkSizeWarningLimit: 1200 },
});
