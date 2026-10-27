import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { KEY, readDrafts, writeDrafts, createDraft } from "../src/drafts.js";
import { allowedPath } from "../api/workspace.js";
const org =
  "/api/v1/workspace/organizations/00000000-0000-0000-0000-000000000000";
test("bridge permits audited context, Satchy chat and read-only simulator telemetry", () => {
  for (const p of [
    "/api/v1/workspace/session",
    org,
    org + "/radio/events?limit=25",
    org + "/modules/catalog?source=avy_na",
    org + "/runs",
    org + "/simulations/capabilities",
    org + "/simulations/missions/00000000-0000-0000-0000-000000000000/telemetry?limit=300",
  ])
    assert(allowedPath("GET", p));
  for (const p of [
    org + "/actions/00000000-0000-0000-0000-000000000000",
    "/api/v1/transmissions",
    "//evil.example",
    "/api/v1/workspace/admin/session",
    org + "/../chat",
    org + "/%2fadmin",
  ])
    for (const m of ["GET", "POST", "DELETE"])
      assert.equal(allowedPath(m, p), false);
  for(const path of ["/simulations/sessions","/simulations/plans","/simulations/plans/00000000-0000-0000-0000-000000000000/approve","/simulations/plans/00000000-0000-0000-0000-000000000000/dispatch"]) assert(allowedPath("POST",org+path));
  assert(allowedPath("POST", "/api/v1/workspace/login"));
  assert(allowedPath("POST", "/api/v1/workspace/logout"));
  assert.equal(allowedPath("POST", org + "/chat"), true);
  assert.equal(allowedPath("POST",org+"/simulations/missions"),false);
  assert.equal(allowedPath("PATCH",org+"/assets/00000000-0000-0000-0000-000000000000"),false);
});
test("offline drafts remain unauthorised and bounded", () => {
  const values = new Map(),
    storage = {
      getItem: (k) => values.get(k),
      setItem: (k, v) => values.set(k, v),
    };
  const draft = createDraft("Reconnaissance", "Mountain reconnaissance", null);
  writeDrafts(storage, [draft]);
  assert.equal(readDrafts(storage)[0].executionAuthorized, false);
  assert.equal(readDrafts(storage)[0].status, "local_draft");
  assert.throws(() => createDraft(" ".repeat(10), "world", null));
  assert.throws(() =>
    writeDrafts(storage, [{ ...draft, objective: "x".repeat(110000) }]),
  );
  values.set(KEY, "{broken");
  assert.deepEqual(readDrafts(storage), []);
});
function worker(source) {
  const listeners = {},
    put = [],
    deleted = [],
    fetches = [],
    self = {
      location: { origin: "https://sim.test" },
      clients: { claim: async () => {} },
      addEventListener: (n, f) => (listeners[n] = f),
      skipWaiting: () => {
        self.activated = true;
      },
    };
  const caches = {
    open: async () => ({
      addAll: async (p) => put.push(...p),
      keys: async () => [],
      put: async (k) => put.push(k),
    }),
    keys: async () => ["other-app-cache", "terrasatch-sim-shell-old"],
    delete: async (k) => deleted.push(k),
    match: async () => ({ offline: true }),
  };
  vm.runInNewContext(source, {
    self,
    caches,
    fetch: async (r) => {
      fetches.push(r);
      throw Error("offline");
    },
    URL,
  });
  return { listeners, self, put, deleted, fetches };
}
const source = await readFile(
  new URL("../public/sw.js", import.meta.url),
  "utf8",
);
test("service worker never intercepts private API, cross-origin or mutations", () => {
  const w = worker(source);
  for (const request of [
    {
      method: "GET",
      url: "https://sim.test/api/workspace?path=private",
      mode: "cors",
    },
    {
      method: "GET",
      url: "https://api.terrasatch.com/api/v1/transmissions",
      mode: "cors",
    },
    { method: "POST", url: "https://sim.test/approve", mode: "navigate" },
    {
      method: "GET",
      url: "https://a.tile.opentopomap.org/8/1/1.png",
      mode: "cors",
    },
    { method: "GET", url: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/11/770/388", mode: "cors" },
  ]) {
    let intercepted = false;
    w.listeners.fetch({ request, respondWith: () => (intercepted = true) });
    assert.equal(intercepted, false);
  }
  assert.equal(w.fetches.length, 0);
});
test("offline navigation returns shell, updates require explicit message", async () => {
  const w = worker(source);
  let response;
  w.listeners.fetch({
    request: {
      method: "GET",
      url: "https://sim.test/missions",
      mode: "navigate",
    },
    respondWith: (p) => (response = p),
  });
  assert.deepEqual(await response, { offline: true });
  assert.equal(w.self.activated, undefined);
  w.listeners.message({ data: "UNRELATED" });
  assert.equal(w.self.activated, undefined);
  w.listeners.message({ data: "ACTIVATE_UPDATE" });
  assert.equal(w.self.activated, true);
  let done;
  w.listeners.activate({ waitUntil: (p) => (done = p) });
  await done;
  assert.deepEqual(w.deleted, ["terrasatch-sim-shell-old"]);
});
test("production shell includes all bundled assets within budget", async () => {
  const budget = JSON.parse(
    await readFile(new URL("../dist/cache-budget.json", import.meta.url)),
  );
  assert(budget.files <= 50);
  assert(budget.bytes <= 10 * 1024 * 1024);
  const sw = await readFile(new URL("../dist/sw.js", import.meta.url), "utf8");
  assert(sw.includes("/assets/index-"));
  assert(sw.includes("/fonts/"));
  assert(sw.includes("maplibre-gl-worker-"));
});
