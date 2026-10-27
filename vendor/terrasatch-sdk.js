const DEFAULT_API_ORIGIN = "https://api.terrasatch.com";

function stripTrailingSlash(value) {
  return value.replace(/\/$/, "");
}

function encode(value) {
  return encodeURIComponent(String(value));
}

function defaultBaseUrl() {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return DEFAULT_API_ORIGIN;
}

function deriveWebSocketBaseUrl(baseUrl) {
  return stripTrailingSlash(baseUrl)
    .replace(/^https:/, "wss:")
    .replace(/^http:/, "ws:");
}

export class TerraSatchApiError extends Error {
  constructor(status, message, detail = undefined) {
    super(message);
    this.name = "TerraSatchApiError";
    this.status = status;
    this.detail = detail;
  }
}

export class TerraSatchClient {
  constructor(options = {}) {
    this.baseUrl = stripTrailingSlash(options.baseUrl || defaultBaseUrl());
    this.wsBaseUrl = stripTrailingSlash(
      options.wsBaseUrl || deriveWebSocketBaseUrl(this.baseUrl),
    );
    this.token = options.token || null;
    this.credentials = options.credentials || "include";
    this.fetchImpl =
      options.fetch ||
      (typeof globalThis.fetch === "function"
        ? globalThis.fetch.bind(globalThis)
        : undefined);
    this.resolveUrl =
      options.resolveUrl || ((path) => `${this.baseUrl}${path}`);
    this.WebSocketImpl = options.WebSocket || globalThis.WebSocket;

    if (typeof this.fetchImpl !== "function") {
      throw new Error("TerraSatchClient requires a fetch implementation");
    }
  }

  async request(path, init = {}) {
    const { csrfToken, ...requestInit } = init;
    const headers = new Headers(requestInit.headers || {});
    headers.set("accept", "application/json");
    if (requestInit.body && !(typeof FormData !== "undefined" && requestInit.body instanceof FormData)
        && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    if (csrfToken) {
      headers.set("x-csrf-token", csrfToken);
    }
    if (this.token && !headers.has("authorization")) {
      headers.set("authorization", `Bearer ${this.token}`);
    }

    const response = await this.fetchImpl(this.resolveUrl(path), {
      ...requestInit,
      headers,
      credentials: this.credentials,
      cache: requestInit.cache || "no-store",
    });

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : { detail: await response.text() };

    if (!response.ok) {
      const message =
        typeof payload?.detail === "string"
          ? payload.detail
          : `TerraSatch API request failed with status ${response.status}`;
      throw new TerraSatchApiError(response.status, message, payload);
    }
    return payload;
  }

  workspaceSession() {
    return this.request("/api/v1/workspace/session");
  }

  loginWorkspace(email, password, csrfToken) {
    return this.request("/api/v1/workspace/login", {
      method: "POST",
      csrfToken,
      body: JSON.stringify({ email, password }),
    });
  }

  logoutWorkspace(csrfToken) {
    return this.request("/api/v1/workspace/logout", {
      method: "POST",
      csrfToken,
      body: JSON.stringify({}),
    });
  }

  getWorkspace(organizationId) {
    return this.request(
      `/api/v1/workspace/organizations/${encode(organizationId)}`,
    );
  }

  getWorkspaceConvergence(organizationId) {
    return this.request(
      `/api/v1/workspace/organizations/${encode(organizationId)}/convergence`,
    );
  }

  getWorkspaceModuleSettings(organizationId, context = {}, support = false) {
    const query = new URLSearchParams();
    if (context.site_id) query.set("site_id", context.site_id);
    if (context.team_id) query.set("team_id", context.team_id);
    return this.request(`/api/v1/workspace/${support ? "admin/" : ""}organizations/${encode(organizationId)}/modules/settings${query.size ? "?" + query : ""}`);
  }

  saveWorkspaceModuleSettings(organizationId, payload, csrfToken, support = false) {
    return this.request(`/api/v1/workspace/${support ? "admin/" : ""}organizations/${encode(organizationId)}/modules/settings`, {
      method: "PUT", csrfToken, body: JSON.stringify(payload),
    });
  }

  getWorkspaceModuleCatalog(organizationId, options, support = false) {
    const query = new URLSearchParams({source: options.source});
    if (options.fire_states?.length) query.set("fire_states", options.fire_states.join(","));
    if (options.region_ids?.length) query.set("region_ids", options.region_ids.join(","));
    return this.request(`/api/v1/workspace/${support ? "admin/" : ""}organizations/${encode(organizationId)}/modules/catalog?${query}`);
  }

  getWorkspaceModuleEnvironment(organizationId, options, support = false) {
    const query = new URLSearchParams({source: options.source, region_id: options.region_id});
    if (options.fire_states?.length) query.set("fire_states", options.fire_states.join(","));
    return this.request(`/api/v1/workspace/${support ? "admin/" : ""}organizations/${encode(organizationId)}/modules/environment?${query}`);
  }

  getWorkspaceDiscovery(organizationId) {
    return this.request(
      `/api/v1/workspace/organizations/${encode(organizationId)}/discovery`,
    );
  }

  listWorkspaceDiscoveryEvents(organizationId, workflowKey, limit = 200) {
    const query = new URLSearchParams({limit: String(Math.max(1, Math.min(200, Number(limit) || 200)))});
    if (workflowKey) query.set("workflow_key", workflowKey);
    return this.request(`/api/v1/workspace/organizations/${encode(organizationId)}/discovery/events?${query}`);
  }

  identifyWorkspaceDiscoveryWorkflow(organizationId, payload, csrfToken) {
    return this.request(`/api/v1/workspace/organizations/${encode(organizationId)}/discovery/events`, {
      method: "POST", csrfToken, body: JSON.stringify(payload),
    });
  }

  startWorkspaceDiscoveryTest(organizationId, workflowKey, payload, csrfToken) {
    return this.request(`/api/v1/workspace/organizations/${encode(organizationId)}/discovery/workflows/${encode(workflowKey)}/testing`, {
      method: "POST", csrfToken, body: JSON.stringify(payload),
    });
  }

  measureWorkspaceDiscoveryTest(organizationId, workflowKey, payload, csrfToken) {
    return this.request(`/api/v1/workspace/organizations/${encode(organizationId)}/discovery/workflows/${encode(workflowKey)}/testing/measurements`, {
      method: "POST", csrfToken, body: JSON.stringify(payload),
    });
  }

  reviewWorkspaceDiscoveryTest(organizationId, workflowKey, payload, csrfToken) {
    return this.request(`/api/v1/workspace/organizations/${encode(organizationId)}/discovery/workflows/${encode(workflowKey)}/review`, {
      method: "POST", csrfToken, body: JSON.stringify(payload),
    });
  }

  updateWorkspaceConvergence(organizationId, payload, csrfToken) {
    return this.request(
      `/api/v1/workspace/organizations/${encode(organizationId)}/convergence`,
      {
        method: "PATCH",
        csrfToken,
        body: JSON.stringify(payload),
      },
    );
  }

  chatWithSatchy(organizationId, payload, csrfToken) {
    return this.request(
      `/api/v1/workspace/organizations/${encode(organizationId)}/chat`,
      {
        method: "POST",
        csrfToken,
        body: JSON.stringify(payload),
      },
    );
  }

  listSatchyRuns(organizationId, limit = 20) {
    const safeLimit = Math.max(1, Math.min(50, Number(limit) || 20));
    return this.request(
      `/api/v1/workspace/organizations/${encode(organizationId)}/runs?limit=${safeLimit}`,
    );
  }

  getSatchyRun(organizationId, runId) {
    return this.request(
      `/api/v1/workspace/organizations/${encode(organizationId)}/runs/${encode(runId)}`,
    );
  }

  reviewSatchyAction(
    organizationId,
    actionId,
    decision,
    csrfToken,
    notes = "",
  ) {
    return this.request(
      `/api/v1/workspace/organizations/${encode(organizationId)}/actions/${encode(actionId)}`,
      {
        method: "POST",
        csrfToken,
        body: JSON.stringify({ decision, notes }),
      },
    );
  }

  createWorkspaceObservation(organizationId, payload, csrfToken) {
    return this.request(
      `/api/v1/workspace/organizations/${encode(organizationId)}/observations`,
      {
        method: "POST",
        csrfToken,
        body: JSON.stringify(payload),
      },
    );
  }

  getWorkspaceIntegrationCatalog(organizationId) {
    return this.request(
      `/api/v1/workspace/organizations/${encode(organizationId)}/integrations/catalog`,
    );
  }

  createWorkspaceIntegration(organizationId, payload, csrfToken) {
    return this.request(
      `/api/v1/workspace/organizations/${encode(organizationId)}/integrations`,
      {
        method: "POST",
        csrfToken,
        body: JSON.stringify(payload),
      },
    );
  }

  configureWorkspaceIntegrationCredentials(
    organizationId,
    connectionId,
    values,
    csrfToken,
  ) {
    return this.request(
      `/api/v1/workspace/organizations/${encode(organizationId)}/integrations/${encode(connectionId)}/credentials`,
      {
        method: "POST",
        csrfToken,
        body: JSON.stringify({ values }),
      },
    );
  }

  authorizeWorkspaceIntegration(organizationId, connectionId, csrfToken) {
    return this.request(
      `/api/v1/workspace/organizations/${encode(organizationId)}/integrations/${encode(connectionId)}/authorize`,
      {
        method: "POST",
        csrfToken,
        body: "{}",
      },
    );
  }

  testWorkspaceIntegration(organizationId, connectionId, csrfToken) {
    return this.request(
      `/api/v1/workspace/organizations/${encode(organizationId)}/integrations/${encode(connectionId)}/test`,
      {
        method: "POST",
        csrfToken,
        body: "{}",
      },
    );
  }

  revokeWorkspaceIntegration(organizationId, connectionId, csrfToken) {
    return this.request(
      `/api/v1/workspace/organizations/${encode(organizationId)}/integrations/${encode(connectionId)}/revoke`,
      {
        method: "POST",
        csrfToken,
        body: "{}",
      },
    );
  }

  queryWorkspaceIntegration(organizationId, payload, csrfToken) {
    return this.request(
      `/api/v1/workspace/organizations/${encode(organizationId)}/integrations/query`,
      {
        method: "POST",
        csrfToken,
        body: JSON.stringify(payload),
      },
    );
  }

  getWorkspaceAccess(organizationId) {
    return this.request(`/api/v1/workspace/organizations/${encode(organizationId)}/access`);
  }

  createWorkspaceBillingPortal(organizationId, csrfToken) {
    return this.request(`/api/v1/workspace/organizations/${encode(organizationId)}/billing`, {
      method: "POST", csrfToken, body: JSON.stringify({}),
    });
  }

  getWorkspaceAccount() {
    return this.request(`/api/v1/workspace/account`);
  }

  getWorkspaceInvitations(organizationId) {
    return this.request(`/api/v1/workspace/organizations/${encode(organizationId)}/invitations`);
  }

  createWorkspaceInvitation(organizationId, payload, csrfToken) {
    return this.request(`/api/v1/workspace/organizations/${encode(organizationId)}/invitations`, {
      method: "POST", csrfToken, body: JSON.stringify(payload),
    });
  }

  revokeWorkspaceInvitation(organizationId, invitationId, csrfToken) {
    return this.request(`/api/v1/workspace/organizations/${encode(organizationId)}/invitations/${encode(invitationId)}/revoke`, {
      method: "POST", csrfToken,
    });
  }

  getWorkspaceInvitationPreview(token, csrfToken) {
    return this.request(`/api/v1/workspace/invitations/preview`, {
      method: "POST", csrfToken, body: JSON.stringify({ token }),
    });
  }

  acceptWorkspaceInvitation(token, csrfToken) {
    return this.request(`/api/v1/workspace/invitations/accept`, {
      method: "POST", csrfToken, body: JSON.stringify({ token }),
    });
  }

  updateWorkspaceAccount(payload, csrfToken) {
    return this.request(`/api/v1/workspace/account`, {
      method: "PATCH",
      csrfToken,
      body: JSON.stringify(payload),
    });
  }

  getWorkspaceDevices(organizationId) {
    return this.request(`/api/v1/workspace/organizations/${encode(organizationId)}/devices`);
  }

  getWorkspaceDevice(organizationId, deviceId) {
    return this.request(`/api/v1/workspace/organizations/${encode(organizationId)}/devices/${encode(deviceId)}`);
  }

  updateWorkspaceDevice(organizationId, deviceId, payload, csrfToken) {
    return this.request(`/api/v1/workspace/organizations/${encode(organizationId)}/devices/${encode(deviceId)}`, {
      method: "PATCH",
      csrfToken,
      body: JSON.stringify(payload),
    });
  }

  pairWorkspaceDevice(organizationId, payload, csrfToken) {
    return this.request(`/api/v1/workspace/organizations/${encode(organizationId)}/devices/pair`, {
      method: "POST",
      csrfToken,
      body: JSON.stringify(payload),
    });
  }

  getWorkspaceOrganization(organizationId) {
    return this.request(`/api/v1/workspace/organizations/${encode(organizationId)}/settings`);
  }

  updateWorkspaceOrganization(organizationId, payload, csrfToken) {
    return this.request(`/api/v1/workspace/organizations/${encode(organizationId)}`, {
      method: "PATCH",
      csrfToken,
      body: JSON.stringify(payload),
    });
  }

  getWorkspaceSites(organizationId) {
    return this.request(`/api/v1/workspace/organizations/${encode(organizationId)}/sites`);
  }

  createWorkspaceSite(organizationId, payload, csrfToken) {
    return this.request(`/api/v1/workspace/organizations/${encode(organizationId)}/sites`, {
      method: "POST",
      csrfToken,
      body: JSON.stringify(payload),
    });
  }

  updateWorkspaceSite(organizationId, siteId, payload, csrfToken) {
    return this.request(`/api/v1/workspace/organizations/${encode(organizationId)}/sites/${encode(siteId)}`, {
      method: "PATCH",
      csrfToken,
      body: JSON.stringify(payload),
    });
  }

  getWorkspaceTeams(organizationId) {
    return this.request(`/api/v1/workspace/organizations/${encode(organizationId)}/teams`);
  }

  createWorkspaceTeam(organizationId, payload, csrfToken) {
    return this.request(`/api/v1/workspace/organizations/${encode(organizationId)}/teams`, {
      method: "POST",
      csrfToken,
      body: JSON.stringify(payload),
    });
  }

  updateWorkspaceTeam(organizationId, teamId, payload, csrfToken) {
    return this.request(`/api/v1/workspace/organizations/${encode(organizationId)}/teams/${encode(teamId)}`, {
      method: "PATCH",
      csrfToken,
      body: JSON.stringify(payload),
    });
  }

  getWorkspaceMembers(organizationId) {
    return this.request(`/api/v1/workspace/organizations/${encode(organizationId)}/members`);
  }

  createWorkspaceMember(organizationId, payload, csrfToken) {
    return this.request(`/api/v1/workspace/organizations/${encode(organizationId)}/members`, {
      method: "POST",
      csrfToken,
      body: JSON.stringify(payload),
    });
  }

  updateWorkspaceMember(organizationId, memberId, payload, csrfToken) {
    return this.request(`/api/v1/workspace/organizations/${encode(organizationId)}/members/${encode(memberId)}`, {
      method: "PATCH",
      csrfToken,
      body: JSON.stringify(payload),
    });
  }

  getWorkspaceApiKeys(organizationId) {
    return this.request(`/api/v1/workspace/organizations/${encode(organizationId)}/api-keys`);
  }

  createWorkspaceApiKey(organizationId, payload, csrfToken) {
    return this.request(`/api/v1/workspace/organizations/${encode(organizationId)}/api-keys`, {
      method: "POST",
      csrfToken,
      body: JSON.stringify(payload),
    });
  }

  revokeWorkspaceApiKey(organizationId, keyId, csrfToken) {
    return this.request(`/api/v1/workspace/organizations/${encode(organizationId)}/api-keys/${encode(keyId)}/revoke`, {
      method: "POST",
      csrfToken,
      body: JSON.stringify({}),
    });
  }

  getWorkspaceAdminSession() {
    return this.request(`/api/v1/workspace/admin/session`);
  }

  getWorkspaceAdminOrganizations() {
    return this.request(`/api/v1/workspace/admin/organizations`);
  }

  getWorkspaceAdminOverview(organizationId) {
    return this.request(`/api/v1/workspace/admin/organizations/${encode(organizationId)}/overview`);
  }

  chatWithAdminSatchy(organizationId, payload, csrfToken) {
    return this.request(`/api/v1/workspace/admin/organizations/${encode(organizationId)}/chat`, {
      method: "POST", csrfToken, body: JSON.stringify(payload),
    });
  }

  listAdminSatchyRuns(organizationId) {
    return this.request(`/api/v1/workspace/admin/organizations/${encode(organizationId)}/runs`);
  }

  getWorkspaceContext(organizationId, options = {}, platformSupport = false) {
    const query = new URLSearchParams();
    if (options.q) query.set("q", options.q);
    if (options.offset) query.set("offset", String(options.offset));
    if (options.siteId) query.set("site_id", options.siteId);
    return this.request(`/api/v1/workspace/${platformSupport ? "admin/" : ""}organizations/${encode(organizationId)}/context?${query}`);
  }

  updateWorkspaceContext(organizationId, sourceId, payload, csrfToken) {
    return this.request(`/api/v1/workspace/admin/organizations/${encode(organizationId)}/context/${encode(sourceId)}/lifecycle`, {
      method: "POST", csrfToken, body: JSON.stringify(payload),
    });
  }

  getWorkspaceFiles(organizationId) {
    return this.request(`/api/v1/workspace/organizations/${encode(organizationId)}/files`);
  }

  uploadWorkspaceFile(organizationId, payload, csrfToken) {
    return this.request(`/api/v1/workspace/organizations/${encode(organizationId)}/files`, {
      method: "POST", csrfToken, body: payload,
    });
  }

  async downloadWorkspaceFile(organizationId, fileId) {
    const response = await this.fetchImpl(this.resolveUrl(`/api/v1/workspace/organizations/${encode(organizationId)}/files/${encode(fileId)}/download`), {
      credentials: this.credentials, cache: "no-store",
    });
    if (!response.ok) throw new TerraSatchApiError(response.status, "File is not available for this account");
    return response.blob();
  }

  updateWorkspaceAdminOrganization(organizationId, payload, csrfToken) {
    return this.request(`/api/v1/workspace/admin/organizations/${encode(organizationId)}`, {
      method: "PATCH",
      csrfToken,
      body: JSON.stringify(payload),
    });
  }

  getWorkspaceAdminDevice(organizationId, deviceId) {
    return this.request(`/api/v1/workspace/admin/organizations/${encode(organizationId)}/devices/${encode(deviceId)}`);
  }

  updateWorkspaceAdminDevice(organizationId, deviceId, payload, csrfToken) {
    return this.request(`/api/v1/workspace/admin/organizations/${encode(organizationId)}/devices/${encode(deviceId)}`, {
      method: "PATCH",
      csrfToken,
      body: JSON.stringify(payload),
    });
  }

  getWorkspaceEmails(organizationId, options = {}) {
    const query = new URLSearchParams();
    if (options.q) query.set("q", options.q);
    if (options.mailbox) query.set("mailbox", options.mailbox);
    if (options.offset !== undefined) query.set("offset", String(options.offset));
    return this.request(`/api/v1/workspace/organizations/${encode(organizationId)}/email${query.size ? "?" + query : ""}`);
  }

  getWorkspaceEmailAttachment(organizationId, messageId, attachmentId) {
    return this.request(`/api/v1/workspace/organizations/${encode(organizationId)}/email/${encode(messageId)}/attachments/${encode(attachmentId)}`);
  }

  getWorkspaceEmail(organizationId, messageId) {
    return this.request(`/api/v1/workspace/organizations/${encode(organizationId)}/email/${encode(messageId)}`);
  }

  sendWorkspaceEmail(organizationId, payload, csrfToken) {
    return this.request(`/api/v1/workspace/organizations/${encode(organizationId)}/email`, {
      method: "POST",
      csrfToken,
      body: JSON.stringify(payload),
    });
  }

  replyWorkspaceEmail(organizationId, messageId, payload, csrfToken) {
    return this.request(`/api/v1/workspace/organizations/${encode(organizationId)}/email/${encode(messageId)}/reply`, {
      method: "POST",
      csrfToken,
      body: JSON.stringify(payload),
    });
  }

  markWorkspaceEmailRead(organizationId, messageId, csrfToken) {
    return this.request(`/api/v1/workspace/organizations/${encode(organizationId)}/email/${encode(messageId)}/read`, {
      method: "POST",
      csrfToken,
      body: JSON.stringify({}),
    });
  }

  getWorkspaceMailboxDelegations(organizationId, mailbox) {
    return this.request(`/api/v1/workspace/organizations/${encode(organizationId)}/email-access/delegations?mailbox=${encode(mailbox)}`);
  }

  grantWorkspaceMailboxDelegation(organizationId, payload, csrfToken) {
    return this.request(`/api/v1/workspace/organizations/${encode(organizationId)}/email-access/delegations`, {
      method: "POST",
      csrfToken,
      body: JSON.stringify(payload),
    });
  }

  revokeWorkspaceMailboxDelegation(organizationId, payload, csrfToken) {
    return this.request(`/api/v1/workspace/organizations/${encode(organizationId)}/email-access/delegations/revoke`, {
      method: "POST",
      csrfToken,
      body: JSON.stringify(payload),
    });
  }
  getWinterRecord(organizationId, recordId) {
    return this.request(`/api/v1/workspace/organizations/${encode(organizationId)}/winter/records/${encode(recordId)}`);
  }
  listWinterRecords(organizationId, siteId, kind, offset = 0, limit = 100) {
    return this.request(`/api/v1/workspace/organizations/${encode(organizationId)}/winter/records?site_id=${encode(siteId)}&kind=${encode(kind)}&offset=${encode(offset)}&limit=${encode(limit)}`);
  }
  saveWinterRecord(organizationId, recordId, payload, csrfToken) {
    return this.request(`/api/v1/workspace/organizations/${encode(organizationId)}/winter/records/${encode(recordId)}`, {
      method: "PUT", csrfToken, body: JSON.stringify(payload),
    });
  }
  analyzeWinterRecord(organizationId, recordId, payload, csrfToken) {
    return this.request(`/api/v1/workspace/organizations/${encode(organizationId)}/winter/records/${encode(recordId)}/analysis`, {
      method: "POST", csrfToken, body: JSON.stringify(payload),
    });
  }
  connectEvents({ token = this.token, topics = ["events"] } = {}) {
    if (!token) {
      throw new Error("TerraSatch realtime subscriptions require an API token");
    }
    if (typeof this.WebSocketImpl !== "function") {
      throw new Error("TerraSatchClient requires a WebSocket implementation");
    }

    const socket = new this.WebSocketImpl(`${this.wsBaseUrl}/ws/v1/events`);
    socket.addEventListener("open", () => {
      socket.send(
        JSON.stringify({
          action: "subscribe",
          token,
          topics,
        }),
      );
    });
    return socket;
  }
}
