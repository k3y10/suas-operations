export const KEY = "terrasatch-sim-drafts-v1";
export const MAX_BYTES = 100 * 1024;
export function readDrafts(storage) {
  try {
    const raw = storage.getItem(KEY) || "[]";
    if (raw.length > MAX_BYTES) return [];
    return JSON.parse(raw)
      .filter(
        (d) =>
          d &&
          d.version === 1 &&
          d.status === "local_draft" &&
          typeof d.objective === "string",
      )
      .slice(0, 20);
  } catch {
    return [];
  }
}
export function writeDrafts(storage, drafts) {
  const value = JSON.stringify(drafts.slice(0, 20));
  if (new TextEncoder().encode(value).length > MAX_BYTES)
    throw Error(
      "Draft storage limit reached. Export or remove an older draft.",
    );
  storage.setItem(KEY, value);
}
export function createDraft(objective, world, target) {
  const text = objective.trim();
  if (!text || text.length > 500)
    throw Error("Enter an objective up to 500 characters.");
  return {
    version: 1,
    id: crypto.randomUUID(),
    status: "local_draft",
    objective: text,
    world,
    target,
    createdAt: new Date().toISOString(),
    executionAuthorized: false,
  };
}
export function download(data, name) {
  const u = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
