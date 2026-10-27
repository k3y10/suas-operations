import { TerraSatchClient } from "../vendor/terrasatch-sdk.js";
export const client = new TerraSatchClient({
  baseUrl: window.location.origin,
  resolveUrl: (path) => "/api/workspace?path=" + encodeURIComponent(path),
});
export const orgPath = (id) =>
  "/api/v1/workspace/organizations/" + encodeURIComponent(id);
