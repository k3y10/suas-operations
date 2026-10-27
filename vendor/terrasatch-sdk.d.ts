// AUTO-GENERATED FROM TERRASATCH OPENAPI. DO NOT EDIT BY HAND.
// schema-sha256: 92f0581e5a7911e622e8304648b7d3da8ffa9c4906a2e086d60cee79d37c6e18

export type ActiveMapContext = {
  center_latitude?: number | null;
  center_longitude?: number | null;
  map_id?: string | null;
  selected_layers?: string[];
  selected_terrain?: string | null;
  zoom?: number | null;
};

export type AnalysisRequest = {
  analysis_domain?: "recorded-summary" | "snow-science";
  compare_record_ids?: string[];
  expected_version: number;
  lookback_days?: number;
  request_id: string;
};

export type AnalysisResponse = {
  generated_at: string;
  id: string;
  metadata: Record<string, unknown>;
  model: string;
  status: string;
  text: string;
};

export type AnalysisReview = {
  reason: string;
  status: "reviewed" | "needs-clarification";
};

export type Annotation = {
  id: string;
  kind: "boundary" | "label" | "outline" | "CT" | "ECT" | "observation";
  label?: string;
  layer_id?: string | null;
  photo_id: string;
  test_id?: string | null;
  x: number;
  x2?: number | null;
  y: number;
  y2?: number | null;
};

export type ApprovalRequest = {
  content_hash: string;
  revision: number;
};

export type BillingInterval = "monthly" | "annual";

export type Calibration = {
  depth1_cm: number;
  depth2_cm: number;
  notes?: string;
  photo_id: string;
  y1: number;
  y2: number;
};

export type CaptureProgress = {
  capture_kind?: "snowpit" | "field-observation" | "unclassified";
  conflicts?: ("capture purpose" | "location" | "total_depth_cm" | "elevation_ft" | "aspect" | "slope_angle_deg" | "test results" | "test failure depths")[];
  file_ids?: string[];
  missing?: ("capture purpose" | "location" | "total_depth_cm" | "elevation_ft" | "aspect" | "slope_angle_deg" | "test results" | "test failure depths")[];
  photo_ids?: string[];
  schema_version?: 1;
  source_message_ids: string[];
  status: "needs-input" | "ready-for-review";
};

export type CellReference = {
  cell_id: string;
  scheme: string;
  version: string;
};

export type Certification = {
  expires?: string | null;
  file_id?: string | null;
  id: string;
  name: string;
  type: "avalanche" | "medical";
};

export type Chat = {
  active_map?: ActiveMapContext | null;
  message: string;
  objective?: string | null;
  request_id?: string | null;
  site_id?: string | null;
  transmission_id?: string | null;
};

export type ComposeEmail = {
  recipients: string[];
  request_id: string;
  sender: string;
  subject: string;
  text: string;
};

export type ContextEntry = {
  id: string;
  original_text: string;
  reason: string;
  received_at: string;
  site_id: string;
  source_message_id: string;
  source_type: string;
  state: string;
  text_truncated?: boolean;
};

export type ContextLifecycle = {
  confirmed: true;
  reason: string;
  state: "active" | "excluded" | "archived" | "invalidated" | "superseded";
  superseded_by_id?: string | null;
};

export type ContextPage = {
  has_more: boolean;
  items: ContextEntry[];
  offset: number;
};

export type DiscoveryEventCreate = {
  confidence?: number | null;
  dedupe_key?: string | null;
  event_type: "signal_observed" | "context_observed" | "workflow_identified" | "workflow_testing" | "workflow_approved" | "workflow_rejected";
  evidence?: Record<string, unknown>;
  site_id?: string | null;
  source_ref?: string | null;
  supersedes_event_id?: string | null;
  workflow_key?: string | null;
  workflow_label?: string | null;
};

export type DiscoveryEventCreateResponse = {
  duplicate: boolean;
  event: DiscoveryEventResponse;
};

export type DiscoveryEventResponse = {
  actor_user_id: string | null;
  confidence: number | null;
  created_at: string;
  dedupe_key: string | null;
  event_type: string;
  evidence: Record<string, unknown>;
  id: string;
  occurred_at: string;
  organization_id: string;
  site_id: string | null;
  source_ref: string | null;
  source_type: string;
  supersedes_event_id: string | null;
  workflow_key: string | null;
  workflow_label: string | null;
};

export type DiscoveryEvidenceSummaryResponse = {
  active_event_count: number;
  context_count: number;
  event_count: number;
  latest_event_at: string | null;
  phase_evidence: DiscoveryPhaseEvidence;
  signal_count: number;
  workflow_counts: DiscoveryEvidenceWorkflowCounts;
  workflows: DiscoveryWorkflowSummary[];
};

export type DiscoveryEvidenceWorkflowCounts = {
  approved: number;
  identified: number;
  rejected: number;
  testing: number;
};

export type DiscoveryPhaseEvidence = {
  adapt: boolean;
  learn: boolean;
  listen: boolean;
  watch: boolean;
};

export type DiscoveryPhaseUpdate = {
  adapt?: "off" | "active" | "testing" | "ready" | null;
  learn?: "off" | "active" | "testing" | "ready" | null;
  listen?: "off" | "active" | "testing" | "ready" | null;
  watch?: "off" | "active" | "testing" | "ready" | null;
};

export type DiscoveryStateUpdate = {
  day?: number | null;
  phases?: DiscoveryPhaseUpdate | null;
  status?: "not_started" | "active" | "complete" | "integrated" | null;
  workflow_counts?: DiscoveryWorkflowCountUpdate | null;
};

export type DiscoveryWorkflowCountUpdate = {
  approved?: number | null;
  identified?: number | null;
  testing?: number | null;
};

export type DiscoveryWorkflowMeasurementCreate = {
  measurement_id: string;
  note?: string | null;
  source_ref?: string | null;
  value: number;
};

export type DiscoveryWorkflowReviewCreate = {
  decision: "approved" | "rejected";
  rationale: string;
  request_id: string;
};

export type DiscoveryWorkflowSummary = {
  key: string;
  label: string | null;
  latest_event_at: string;
  latest_event_id: string;
  revision_count: number;
  state: "identified" | "testing" | "approved" | "rejected";
  state_event_at: string;
  state_event_id: string;
};

export type DiscoveryWorkflowTestStart = {
  baseline_value: number;
  metric_key: string;
  metric_unit: string;
  objective: string;
  request_id: string;
  sample_target?: number;
  target_direction: "decrease" | "increase" | "maintain";
};

export type DispatchResponse = {
  dispatch: Record<string, unknown>;
  mission_id: string;
  replay_attempted?: boolean;
};

export type EntitlementsResponse = {
  api_access: boolean;
  included_processing_hours: number | null;
  max_channels: number | null;
  max_edge_devices: number | null;
  max_members: number | null;
  max_sites: number | null;
  priority_support: boolean;
  retention_days: number | null;
};

export type FeatureReview = {
  classification: "avalanche-path" | "mitigation-route" | "patrol-route" | "ski-cut" | "ski-run" | "shot-site" | "reference" | "media" | "unclassified";
  corrected_geometry?: Record<string, unknown> | null;
  feature_id: string;
  kind?: "feature-review";
  reason: string;
};

export type FieldReport = {
  capture?: CaptureProgress | null;
  document_reviews?: Record<string, string>;
  file_ids?: string[];
  kind?: "field-report";
  location?: Location | null;
  message?: string;
  notes?: string;
  observed_at: string;
  photo_ids?: string[];
  proposed_values?: Record<string, unknown>;
  route_id?: string | null;
  source_event_ids?: string[];
  state?: "draft" | "submitted" | "reviewed" | "needs-clarification";
  title?: string;
};

export type Layer = {
  bottom_cm: number;
  grain?: string;
  grain_code?: string;
  grain_size_max_mm?: number | null;
  grain_size_min_mm?: number | null;
  hardness?: string;
  id: string;
  notes?: string;
  top_cm: number;
};

export type Location = {
  latitude: number;
  longitude: number;
};

export type MailboxDelegationRequest = {
  can_send?: boolean;
  delegate_email: string;
  mailbox: string;
};

export type MailboxDelegationRevoke = {
  delegate_email: string;
  mailbox: string;
};

export type MobileInput = {
  cell_reference?: CellReference | null;
  file_ids?: string[];
  location?: Location | null;
  message?: string;
  mode?: "auto" | "chat" | "field-report";
  observed_at: string;
  photo_ids?: string[];
  reply_to_report_id?: string | null;
  request_id: string;
  site_id: string;
  source_ids?: string[];
};

export type MobileResponse = {
  activity?: Record<string, unknown> | null;
  attempts: number;
  cell_reference?: CellReference | null;
  created_at: string;
  delivery_state: string;
  file_ids?: string[];
  id: string;
  last_error: string | null;
  location: Location | null;
  message: string;
  mode: string;
  observed_at: string;
  photo_ids: string[];
  report_id: string | null;
  request_id: string;
  response: Record<string, unknown>;
  site_id: string;
  source_id: string | null;
  source_ids?: string[];
  source_state?: "active" | "excluded";
  state: string;
};

export type Observation = {
  latitude?: number | null;
  longitude?: number | null;
  request_id: string;
  site_id: string;
  text: string;
};

export type Operation = {
  crew_user_ids?: string[];
  events?: RouteEvent[];
  kind?: "operation";
  leader_comments?: string;
  leader_user_id: string;
  operating_date: string;
  provenance?: "training" | "pilot";
  route_id: string;
  shadow_user_ids?: string[];
  state?: "scheduled" | "active" | "down-and-clear" | "signed";
};

export type PhoneFinish = {
  challenge_id: string;
  code: string;
};

export type PhoneStart = {
  address: string;
  consent: true;
  provider?: "android-sms-gateway" | "photon";
  site_id: string;
};

export type PlanCode = "field" | "team" | "operations" | "enterprise";

export type PlanResponse = {
  action_id: string;
  action_status: string;
  authorization?: Record<string, unknown> | null;
  dispatch: Record<string, unknown>;
  integrity?: Record<string, unknown> | null;
  mission_id: string;
  plan: Record<string, unknown>;
  status: string;
};

export type Profile = {
  certifications?: Certification[];
  dispatcher?: boolean;
  dog_handler?: string;
  kind?: "profile";
  level?: string;
  notes?: string;
  routes?: RouteQualification[];
  shadow_preferences?: string[];
  snowpit_approval_expires?: string | null;
  snowpit_approved?: boolean;
  supervisor?: boolean;
  user_id: string;
  years?: number;
};

export type Proposal = {
  asset_id: string;
  latitude: number;
  longitude: number;
  previous_mission_id?: string | null;
  request_id: string;
  selected_cell_ids?: string[] | null;
  session_id: string;
  site_id: string;
  source_transmission_id?: string | null;
  text: string;
};

export type PushInput = {
  endpoint: string;
  keys: Record<string, string>;
  site_id: string;
};

export type RecordPage = {
  has_more: boolean;
  items: RecordResponse[];
  offset: number;
};

export type RecordResponse = {
  action_history?: Record<string, unknown>[];
  creator_user_id: string;
  document: Snowpit | RouteDefinition | Operation | Station | Weather | Profile | FeatureReview | FieldReport;
  id: string;
  kind: string;
  site_id: string;
  updated_at: string;
  version: number;
};

export type RecordWrite = {
  document: Snowpit | RouteDefinition | Operation | Station | Weather | Profile | FeatureReview | FieldReport;
  expected_version: number;
  reason?: string;
  request_id: string;
  site_id: string;
};

export type ReplyEmail = {
  request_id: string;
  text: string;
};

export type RouteDefinition = {
  feature_ids?: string[];
  kind?: "route";
  name: string;
  notes?: string;
  peak: string;
  provenance?: "training" | "pilot";
  route_role?: "mitigation" | "patrol" | "transfer";
  shot_site_ids?: string[];
};

export type RouteEvent = {
  activity: "started" | "shot" | "observation" | "radio" | "check-in";
  bed_surface?: string;
  charge?: string;
  confirmed?: boolean;
  failure_depth_cm?: number | null;
  id: string;
  location?: Location | null;
  notes?: string;
  observed_at: string;
  original_report?: string;
  outcome?: string;
  photo_ids?: string[];
  reported_by_user_id?: string | null;
  reporter_user_id?: string | null;
  run_to_ground?: boolean | null;
  shot_site_id?: string | null;
  size?: string;
  source_event_id?: string | null;
};

export type RouteQualification = {
  last_completed?: string | null;
  leader?: boolean;
  progress?: number;
  route_id: string;
  status?: "incomplete" | "in-progress" | "complete";
};

export type SatchyChatResponse = {
  action_id: string | null;
  action_status: string | null;
  answer: string;
  approval_required: boolean;
  run_id: string;
  run_status: string;
};

export type SatchyRunResponse = {
  completed_at: string | null;
  created_at: string;
  id: string;
  input_text: string;
  metadata: Record<string, unknown>;
  model: string | null;
  objective: string | null;
  organization_id: string;
  request_id: string;
  response_text: string | null;
  site_id: string;
  status: string;
  steps: SatchyRunStepResponse[];
  updated_at: string;
  user_id: string | null;
};

export type SatchyRunStepResponse = {
  action_id: string | null;
  completed_at: string | null;
  created_at: string;
  detail: Record<string, unknown>;
  id: string;
  label: string;
  sequence: number;
  source_refs: Record<string, unknown>[];
  status: string;
  type: string;
};

export type SimulationCapabilities = {
  available: boolean;
  capabilities?: string[];
  contract_version?: "1";
  enabled: boolean;
  max_lifetime_seconds?: 1800;
  max_sessions?: 1;
  provider?: string | null;
  reason?: string | null;
  simulator_only?: true;
  telemetry_sample_hz?: 1.0;
};

export type SimulationHome = {
  latitude: number;
  longitude: number;
};

export type SimulationMission = {
  action_id: string;
  id: string;
  session_id: string;
  source_links?: string[];
  state: "draft" | "approved" | "queued" | "starting" | "running" | "completed" | "failed" | "canceled" | "unknown";
  updated_at: string;
};

export type SimulationMissionPage = {
  items?: SimulationMission[];
  limit?: number;
  offset?: number;
};

export type SimulationSession = {
  aircraft_cancellation_verified?: boolean;
  connected: boolean;
  created_at: string;
  expires_at: string;
  id: string;
  organization_id: string;
  owner_user_id: string;
  site_id: string;
  status: "starting" | "ready" | "closed" | "expired" | "unknown";
};

export type SimulationSessionCreate = {
  asset_id?: string | null;
  home?: SimulationHome | null;
  lifetime_seconds?: number;
  request_id: string;
  site_id: string;
};

export type SimulationTelemetryPage = {
  connected: boolean;
  next_cursor?: string | null;
  samples?: SimulationTelemetrySample[];
  stale: boolean;
};

export type SimulationTelemetrySample = {
  armed?: boolean | null;
  battery_remaining_fraction?: number | null;
  flight_mode?: string | null;
  ground_speed_m_s?: number | null;
  in_air?: boolean | null;
  latitude_deg?: number | null;
  longitude_deg?: number | null;
  relative_altitude_m?: number | null;
  sampled_at: string;
};

export type SimulationTrack = {
  features?: SimulationTrackFeature[];
  sampled_point_count?: number;
  source?: "PX4/Gazebo SITL";
  type?: "FeatureCollection";
};

export type SimulationTrackFeature = {
  geometry: SimulationTrackGeometry;
  properties?: Record<string, string>;
  type?: "Feature";
};

export type SimulationTrackGeometry = {
  coordinates: unknown[][];
  type?: "LineString";
};

export type SimulatorEnrollment = {
  request_id: string;
  site_id: string;
};

export type SimulatorEnrollmentResponse = {
  created: boolean;
  id: string;
  name: string;
};

export type SiteCreateRequest = {
  name: string;
};

export type SiteResponse = {
  created_at: string;
  enabled: boolean;
  id: string;
  name: string;
  organization_id: string;
  slug: string;
  updated_at: string;
};

export type SiteUpdateRequest = {
  enabled?: boolean | null;
  name?: string | null;
};

export type SnowTemperature = {
  depth_cm: number;
  observed_at: string;
  temperature_c: number;
};

export type Snowpit = {
  annotations?: Annotation[];
  aspect_degrees?: number | null;
  calibrations?: Calibration[];
  depth_cm: number;
  depth_convention?: "surface-down";
  elevation_m?: number | null;
  kind?: "snowpit";
  layers?: Layer[];
  liquid_water?: "dry" | "moist" | "wet" | "very-wet" | "slush" | null;
  location: Location;
  location_name: string;
  notes?: string;
  observed_at: string;
  original_measurements?: Record<string, string>;
  photo_ids?: string[];
  provenance?: "training" | "pilot";
  review_notes?: string;
  slope_degrees?: number | null;
  snow_temperatures?: SnowTemperature[];
  source_capture_id?: string | null;
  state?: "draft" | "submitted" | "needs-clarification" | "under-review" | "approved";
  tests?: Test[];
  title: string;
};

export type Station = {
  elevation_m?: number | null;
  external_station_id?: string | null;
  kind?: "station";
  location: Location;
  name: string;
  provenance?: "training" | "pilot";
};

export type SubscriptionResponse = {
  billing_interval: BillingInterval | null;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  entitlements: EntitlementsResponse | null;
  grace_ends_at: string | null;
  managed: boolean;
  organization_id: string;
  plan_code: PlanCode | null;
  service_access: "full" | "grace" | "restricted" | "legacy";
  status: string;
  trial_ends_at: string | null;
};

export type TeamCreateRequest = {
  name: string;
  site_id?: string | null;
};

export type TeamResponse = {
  created_at: string;
  enabled: boolean;
  id: string;
  name: string;
  organization_id: string;
  site_id: string | null;
  updated_at: string;
};

export type TeamUpdateRequest = {
  enabled?: boolean | null;
  name?: string | null;
  site_id?: string | null;
};

export type Test = {
  failure_depth_cm?: number | null;
  fracture?: string;
  id: string;
  layer_id?: string | null;
  notes?: string;
  observed_at: string;
  outcome: "" | "CTN" | "CT" | "CTV" | "ECTN" | "ECTP" | "ECTPV" | "ECTX";
  photo_id?: string | null;
  taps?: number | null;
  type: "CT" | "ECT";
};

export type Weather = {
  accumulation_hours?: number;
  blowing_snow?: boolean | null;
  humidity_pct?: number | null;
  kind?: "weather";
  maximum_temperature_c?: number | null;
  minimum_temperature_c?: number | null;
  new_snow_cm?: number | null;
  new_snow_density_kg_m3?: number | null;
  notes?: string;
  observed_at: string;
  operating_date: string;
  period?: "instant" | "day" | "night";
  provenance?: "training" | "pilot";
  rain_mm?: number | null;
  sky_cover_fraction?: number | null;
  solar_radiation_w_m2?: number | null;
  stake_cleared?: boolean | null;
  station_id: string;
  surface_temperature_c?: number | null;
  temperature_c?: number | null;
  total_depth_cm?: number | null;
  wind_direction_degrees?: number | null;
  wind_speed_m_s?: number | null;
};

export type WorkspaceAccessOrganization = {
  id: string;
  name: string;
  role: "owner" | "admin" | "manager" | "operator" | "viewer";
};

export type WorkspaceAccessResponse = {
  capabilities: WorkspaceManagementCapabilities;
  key_scopes: string[];
  messaging: WorkspaceMessagingAccess;
  organization: WorkspaceAccessOrganization;
  roles: string[];
  scope_model: "organization" | "assigned";
  site_ids: string[];
  team_ids: string[];
  user: WorkspaceAccount;
};

export type WorkspaceAccount = {
  email: string;
  id: string;
  is_superadmin: boolean;
  name: string;
};

export type WorkspaceAccountUpdate = {
  current_password?: string | null;
  name?: string | null;
  new_password?: string | null;
};

export type WorkspaceActionResponse = {
  id: string;
  integration_execution: Record<string, unknown>;
  message: string | null;
  reason: string;
  source_id: string | null;
  status: string;
  type: string;
};

export type WorkspaceActionReviewResponse = {
  id: string;
  integration_detail: unknown | null;
  integration_execution: Record<string, unknown>;
  status: string;
};

export type WorkspaceAdminOverviewResponse = {
  devices: WorkspaceDeviceResponse[];
  members: WorkspaceMemberResponse[];
  organization: WorkspaceOrganizationResponse;
  sites: SiteResponse[];
  subscription: SubscriptionResponse;
  summary: Record<string, number>;
  support_context: boolean;
  teams: TeamResponse[];
};

export type WorkspaceAdminSession = {
  authorized: boolean;
  user: WorkspaceAccount;
};

export type WorkspaceAvalancheRating = {
  elevation_bands?: Record<string, number | null>;
  issuer: string;
  level?: 1 | 2 | 3 | 4 | 5 | null;
  reported_level?: 1 | 2 | 3 | 4 | 5 | null;
  source_url: string;
  status: "current" | "expired" | "no_rating" | "unavailable";
  valid_from?: string | null;
  valid_until?: string | null;
};

export type WorkspaceBillingPortalResponse = {
  url: string;
};

export type WorkspaceCapabilityManifest = {
  connected_providers: string[];
  edge: string[];
  edge_devices: WorkspaceEdgeCapabilityDevice[];
  physical: string[];
  policy: WorkspaceCapabilityPolicy;
  read: string[];
  runtime_mode: "legacy" | "shadow" | "agent_read" | "agent_propose";
  write: string[];
};

export type WorkspaceCapabilityPolicy = {
  agent_proposals_enabled: boolean;
  agent_reads_enabled: boolean;
  consequential_actions_require_approval: boolean;
  physical_actions_require_approval: boolean;
  shadow_only: boolean;
};

export type WorkspaceCapabilityResponse = {
  access: "read" | "write";
  key: string;
  label: string;
};

export type WorkspaceConvergenceResponse = {
  capability_manifest: WorkspaceCapabilityManifest;
  profile: WorkspaceProfileResponse;
};

export type WorkspaceConvergenceUpdate = {
  discovery?: DiscoveryStateUpdate | null;
  operational_domain?: string | null;
  preferred_map_layers?: string[] | null;
  recommended_modules?: string[] | null;
  runtime_mode?: "legacy" | "shadow" | "agent_read" | "agent_propose" | null;
  workflow_preferences?: string[] | null;
  workspace_template?: string | null;
};

export type WorkspaceConvergenceUpdateResponse = {
  profile: WorkspaceProfileResponse;
};

export type WorkspaceDeviceResponse = {
  agent_version: string | null;
  enabled: boolean;
  health: string;
  id: string;
  last_seen_at: string | null;
  name: string;
  site_id: string;
  [key: string]: unknown;
};

export type WorkspaceDeviceSummary = {
  agent_version: string | null;
  enabled: boolean;
  id: string;
  last_seen_at: string | null;
  name: string;
};

export type WorkspaceDeviceUpdate = {
  enabled?: boolean | null;
  name?: string | null;
  site_id?: string | null;
};

export type WorkspaceDiscoveryPhases = {
  adapt: "off" | "active" | "testing" | "ready";
  learn: "off" | "active" | "testing" | "ready";
  listen: "off" | "active" | "testing" | "ready";
  watch: "off" | "active" | "testing" | "ready";
};

export type WorkspaceDiscoveryState = {
  day: number;
  duration_days: number;
  phases: WorkspaceDiscoveryPhases;
  status: "not_started" | "active" | "complete" | "integrated";
  workflow_counts: WorkspaceDiscoveryWorkflowCounts;
};

export type WorkspaceDiscoveryWorkflowCounts = {
  approved: number;
  identified: number;
  testing: number;
};

export type WorkspaceEdgeCapabilityDevice = {
  agent_version: string | null;
  capabilities: string[];
  id: string;
  last_seen_at: string | null;
  name: string;
  site_id: string;
};

export type WorkspaceEmailDetail = {
  attachments: Record<string, unknown>[];
  delivered_at?: string | null;
  delivery_status?: string;
  direction: string;
  from: string;
  html: string | null;
  id: string;
  mailbox: string;
  received_at: string;
  subject: string;
  text: string | null;
  to: string[];
  [key: string]: unknown;
};

export type WorkspaceEmailListResponse = {
  has_more?: boolean;
  messages: WorkspaceEmailSummary[];
  offset?: number;
};

export type WorkspaceEmailResult = {
  id: string;
  provider_email_id: string;
};

export type WorkspaceEmailSummary = {
  attachment_count: number;
  delivered_at?: string | null;
  delivery_status?: string;
  direction: string;
  from: string;
  id: string;
  mailbox: string;
  preview: string;
  read: boolean;
  received_at: string;
  reply_allowed: boolean;
  subject: string;
  to: string[];
};

export type WorkspaceEngineSummary = {
  model: string;
  provider: string;
};

export type WorkspaceFieldAssetResponse = {
  capabilities: string[];
  controller_edge_device_id: string | null;
  enabled: boolean;
  id: string;
  location: Record<string, unknown>;
  name: string;
  owner_user_id: string | null;
  policy: Record<string, unknown>;
  provider: string;
  site_id: string | null;
  state: string;
  team_id: string | null;
  type: string;
};

export type WorkspaceFileInfo = {
  byte_count: number;
  content_type: string;
  created_at: string;
  filename: string;
  id: string;
  sha256: string;
  site_id: string;
  transmission_id: string;
};

export type WorkspaceFleetResponse = {
  devices: WorkspaceDeviceResponse[];
  organization_id: string;
  summary: Record<string, number>;
};

export type WorkspaceIntegrationCatalogItem = {
  allowed: boolean;
  allowed_scopes: string[];
  auth: string;
  can_connect: boolean;
  capabilities: string[];
  capability_details: WorkspaceCapabilityResponse[];
  category: string;
  connect_status: "managed" | "available" | "external_setup_required" | "needs_configuration" | "partner_required" | "coming_soon";
  connected: boolean;
  connected_scopes: string[];
  description: string;
  key: string;
  name: string;
  requires_admin: boolean;
  runtime_ready: boolean;
  scopes: string[];
  setup_status: "managed" | "planned" | "available";
  support_status: "managed" | "supported" | "partner_required" | "coming_soon";
};

export type WorkspaceIntegrationsResponse = {
  catalog: WorkspaceIntegrationCatalogItem[];
  connections: Record<string, unknown>[];
  devices: WorkspaceDeviceSummary[];
  engine: WorkspaceEngineSummary;
};

export type WorkspaceInvitationCreate = {
  access_scope?: "organization" | "assigned";
  email: string;
  expires_in_days?: number;
  role?: "owner" | "admin" | "manager" | "operator" | "viewer";
  site_ids?: string[];
  team_ids?: string[];
};

export type WorkspaceInvitationOrganization = {
  id: string;
  name: string;
};

export type WorkspaceInvitationPreview = {
  invitation: WorkspaceInvitationResponse;
  organization: WorkspaceInvitationOrganization;
};

export type WorkspaceInvitationResponse = {
  accepted_at: string | null;
  access_scope: "organization" | "assigned";
  created_at: string;
  email: string;
  expires_at: string;
  id: string;
  issuer_user_id: string;
  revoked_at: string | null;
  role: "owner" | "admin" | "manager" | "operator" | "viewer";
  site_ids: string[];
  team_ids: string[];
};

export type WorkspaceInvitationToken = {
  token: string;
};

export type WorkspaceIssuedInvitation = {
  accepted_at: string | null;
  access_scope: "organization" | "assigned";
  created_at: string;
  email: string;
  expires_at: string;
  id: string;
  issuer_user_id: string;
  revoked_at: string | null;
  role: "owner" | "admin" | "manager" | "operator" | "viewer";
  site_ids: string[];
  team_ids: string[];
  token: string;
};

export type WorkspaceIssuedKey = {
  created_at: string;
  delegate_user_id: string | null;
  expires_at: string | null;
  id: string;
  issuer_user_id: string | null;
  key_prefix: string;
  last_used_at: string | null;
  name: string;
  revoked_at: string | null;
  scope?: "organization";
  scopes: string[];
  token: string;
};

export type WorkspaceKeyCreate = {
  delegate_user_id?: string | null;
  expires_in_days?: number;
  name: string;
  scopes: string[];
};

export type WorkspaceKeyResponse = {
  created_at: string;
  delegate_user_id: string | null;
  expires_at: string | null;
  id: string;
  issuer_user_id: string | null;
  key_prefix: string;
  last_used_at: string | null;
  name: string;
  revoked_at: string | null;
  scope?: "organization";
  scopes: string[];
};

export type WorkspaceLoginResponse = {
  csrf_token: string;
};

export type WorkspaceLogoutResponse = {
  signed_out: boolean;
};

export type WorkspaceMailbox = {
  address: string;
  can_manage: boolean;
  can_send: boolean;
  label: string;
};

export type WorkspaceMailboxDelegate = {
  can_send: boolean;
  email: string;
  user_id: string;
};

export type WorkspaceMailboxDelegations = {
  delegates: WorkspaceMailboxDelegate[];
  mailbox: string;
};

export type WorkspaceManagementCapabilities = {
  billing_manage: boolean;
  can_chat: boolean;
  can_review: boolean;
  devices_diagnose: boolean;
  devices_manage: boolean;
  devices_read: boolean;
  keys_create: boolean;
  keys_manage: boolean;
  members_manage: boolean;
  organization_manage: boolean;
  profile_manage: boolean;
};

export type WorkspaceMemberCreate = {
  access_scope?: "organization" | "assigned";
  email: string;
  name: string;
  password: string;
  role?: "owner" | "admin" | "manager" | "operator" | "viewer";
  site_ids?: string[];
  team_ids?: string[];
};

export type WorkspaceMemberResponse = {
  access_scope: "organization" | "assigned";
  email: string;
  enabled: boolean;
  id: string;
  name: string;
  role: "owner" | "admin" | "manager" | "operator" | "viewer";
  site_ids: string[];
  team_ids: string[];
  user_id: string;
};

export type WorkspaceMemberUpdate = {
  access_scope?: "organization" | "assigned" | null;
  enabled?: boolean | null;
  role?: "owner" | "admin" | "manager" | "operator" | "viewer" | null;
  site_ids?: string[] | null;
  team_ids?: string[] | null;
};

export type WorkspaceMessageResponse = {
  content: string;
  id: string;
  role: "user" | "assistant";
};

export type WorkspaceMessagingAccess = {
  available: boolean;
  configured: boolean;
  mailboxes: WorkspaceMailbox[];
  reason: string;
};

export type WorkspaceModuleCatalog = {
  fetched_at: string;
  fire_states?: string[];
  providers: WorkspaceModuleProvider[];
  regions: WorkspaceModuleRegion[];
  source: "avy_na" | "uac" | "caic" | "wfigs";
  truncated?: boolean;
  warnings?: string[];
};

export type WorkspaceModuleConfiguration = {
  enabled?: ("avyts" | "pyrots")[];
  fire_states?: string[];
  provider_id?: string | null;
  region_ids?: string[];
  source?: "avy_na" | "uac" | "caic" | "wfigs";
};

export type WorkspaceModuleEnvironment = {
  fetched_at: string;
  forecast?: WorkspaceWeatherForecast | null;
  provider: string;
  reference_point?: number[] | null;
  stations?: WorkspaceWeatherStation[];
  status: "available" | "unavailable" | "unsupported";
  warnings?: string[];
};

export type WorkspaceModuleProvider = {
  country: "US" | "CA";
  id: string;
  name: string;
  region_count: number;
};

export type WorkspaceModuleRegion = {
  avalanche_rating?: WorkspaceAvalancheRating | null;
  country: "US" | "CA";
  geometry: Record<string, unknown>;
  id: string;
  name: string;
  provider_id: string;
  source_updated_at?: string | null;
  source_url: string;
  state?: string | null;
};

export type WorkspaceModuleSavedSetting = {
  active?: boolean;
  configuration: WorkspaceModuleConfiguration;
  scope: "organization" | "site" | "team" | "personal";
  target_id?: string | null;
  updated_at?: string | null;
  version: number;
};

export type WorkspaceModuleSettingsResponse = {
  can_save_organization: boolean;
  can_save_personal?: boolean;
  can_save_site: boolean;
  can_save_team: boolean;
  effective: WorkspaceModuleConfiguration;
  inherited_from?: "organization" | "site" | "team" | "personal" | null;
  personal_version?: number;
  platform_support?: boolean;
  selected_team_id?: string | null;
  settings: WorkspaceModuleSavedSetting[];
  team_selection_required?: boolean;
};

export type WorkspaceModuleSettingsWrite = {
  configuration?: WorkspaceModuleConfiguration | null;
  confirmed: true;
  expected_version: number;
  operation?: "set" | "inherit" | "choose_team";
  scope: "organization" | "site" | "team" | "personal";
  site_id?: string | null;
  target_id?: string | null;
  team_id?: string | null;
};

export type WorkspaceObservationResponse = {
  id: string;
};

export type WorkspaceOrganizationResponse = {
  enabled: boolean;
  id: string;
  name: string;
  slug: string;
};

export type WorkspaceOrganizationSummary = {
  id: string;
  name: string;
  role: string;
};

export type WorkspaceOrganizationUpdate = {
  name: string;
};

export type WorkspacePairingApproval = {
  site_id: string;
  user_code: string;
};

export type WorkspaceProfileResponse = {
  discovery_state: WorkspaceDiscoveryState;
  operational_domain: string;
  preferred_map_layers: string[];
  recommended_modules: string[];
  runtime_mode: "legacy" | "shadow" | "agent_read" | "agent_propose";
  workflow_preferences: string[];
  workspace_template: string;
};

export type WorkspaceRecordInterpretation = {
  confidence: number;
  id: string;
  latitude: number | null;
  location: string | null;
  longitude: number | null;
  spatial_status: string | null;
  summary: string;
  type: string;
};

export type WorkspaceRecordResponse = {
  id: string;
  interpretations: WorkspaceRecordInterpretation[];
  location: unknown | null;
  original: string | null;
  site_id?: string | null;
  source: string;
  speaker: string | null;
  timestamp: string;
};

export type WorkspaceSessionResponse = {
  csrf_token: string;
  organizations: WorkspaceOrganizationSummary[];
  user: WorkspaceUserSummary | null;
};

export type WorkspaceSiteSummary = {
  id: string;
  name: string;
};

export type WorkspaceSnapshotResponse = {
  actions: WorkspaceActionResponse[];
  assets: WorkspaceFieldAssetResponse[];
  convergence: WorkspaceConvergenceResponse;
  integrations: WorkspaceIntegrationsResponse;
  messages: WorkspaceMessageResponse[];
  modules: string[];
  records: WorkspaceRecordResponse[];
  role: string;
  satchy_preferences: Record<string, unknown>;
  sites: WorkspaceSiteSummary[];
  subscription: SubscriptionResponse;
  teams: WorkspaceTeamSummary[];
};

export type WorkspaceTeamSummary = {
  id: string;
  name: string;
  site_id: string | null;
};

export type WorkspaceUserSummary = {
  email: string;
  id: string;
  is_superadmin?: boolean;
  name: string;
};

export type WorkspaceWeatherForecast = {
  endTime: string;
  relativeHumidity?: WorkspaceWeatherQuantity | null;
  shortForecast?: string | null;
  source_url: string;
  startTime: string;
  temperature?: number | null;
  temperatureUnit?: string | null;
  updated_at?: string | null;
  windDirection?: string | null;
  windSpeed?: string | null;
};

export type WorkspaceWeatherGeometry = {
  coordinates: number[];
  type: "Point";
};

export type WorkspaceWeatherQuantity = {
  unit?: string | null;
  value?: number | null;
};

export type WorkspaceWeatherStation = {
  geometry: WorkspaceWeatherGeometry;
  humidity?: WorkspaceWeatherQuantity | null;
  id: string;
  name: string;
  observed_at?: string | null;
  source_url: string;
  status: "available" | "unavailable";
  summary?: string | null;
  temperature?: WorkspaceWeatherQuantity | null;
  wind_direction?: WorkspaceWeatherQuantity | null;
  wind_gust?: WorkspaceWeatherQuantity | null;
  wind_speed?: WorkspaceWeatherQuantity | null;
};

export type WorkspaceIntegrationSetupField = {
  key: string;
  required: boolean;
  type?: "string" | "number" | "list";
};

export type WorkspaceIntegrationSetupGuidance = {
  detail: string;
  configuration_fields: WorkspaceIntegrationSetupField[];
  credential_fields: WorkspaceIntegrationSetupField[];
};

export type WorkspaceIntegrationConnection = {
  can_manage?: boolean;
  configuration: Record<string, unknown>;
  created_at: string;
  display_name: string;
  enabled: boolean;
  id: string;
  last_error: string | null;
  last_synced_at: string | null;
  last_tested_at?: string | null;
  last_test_status?: string;
  last_test_error?: string | null;
  owner_user_id: string | null;
  provider: string;
  provider_account_id: string | null;
  provider_account_label: string | null;
  provider_name: string;
  scope: string;
  status: string;
  team_id: string | null;
};

export type WorkspaceIntegrationSetupCatalogItem =
  WorkspaceIntegrationCatalogItem & {
    connections: WorkspaceIntegrationConnection[];
    setup: WorkspaceIntegrationSetupGuidance;
  };

export type WorkspaceIntegrationCreateRequest = {
  provider: string;
  scope: "user" | "team" | "organization";
  team_id?: string | null;
  display_name?: string | null;
  configuration?: Record<string, unknown>;
};

export type WorkspaceIntegrationAuthorizeResponse = {
  connection: WorkspaceIntegrationConnection;
  expires_at: string;
  url: string;
};

export type WorkspaceIntegrationQueryRequest = {
  capability:
    | "map.features.query"
    | "map.style.read"
    | "data.query"
    | "weather.forecast.read";
  connection_id?: string | null;
  workflow_key?: string | null;
  payload?: Record<string, unknown>;
};

export type RealtimeTopic = "events" | "transmissions" | "transcripts";

export type TerraSatchClientOptions = {
  baseUrl?: string;
  wsBaseUrl?: string;
  token?: string;
  credentials?: RequestCredentials;
  fetch?: typeof fetch;
  resolveUrl?: (path: string) => string;
  WebSocket?: typeof WebSocket;
};

export type TerraSatchRequestOptions = RequestInit & {
  csrfToken?: string;
};

export class TerraSatchApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, message: string, detail?: unknown);
}

export class TerraSatchClient {
  constructor(options?: TerraSatchClientOptions);
  request<T>(path: string, init?: TerraSatchRequestOptions): Promise<T>;
  workspaceSession(): Promise<WorkspaceSessionResponse>;
  loginWorkspace(
    email: string, password: string, csrfToken: string
  ): Promise<WorkspaceLoginResponse>;
  logoutWorkspace(csrfToken: string): Promise<WorkspaceLogoutResponse>;
  getWorkspace(organizationId: string): Promise<WorkspaceSnapshotResponse>;
  getWorkspaceDiscovery(
    organizationId: string
  ): Promise<DiscoveryEvidenceSummaryResponse>;
  listWorkspaceDiscoveryEvents(
    organizationId: string, workflowKey?: string, limit?: number
  ): Promise<DiscoveryEventResponse[]>;
  identifyWorkspaceDiscoveryWorkflow(
    organizationId: string, payload: DiscoveryEventCreate, csrfToken: string
  ): Promise<DiscoveryEventCreateResponse>;
  startWorkspaceDiscoveryTest(
    organizationId: string, workflowKey: string,
    payload: DiscoveryWorkflowTestStart, csrfToken: string
  ): Promise<DiscoveryEventCreateResponse>;
  measureWorkspaceDiscoveryTest(
    organizationId: string, workflowKey: string,
    payload: DiscoveryWorkflowMeasurementCreate, csrfToken: string
  ): Promise<DiscoveryEventCreateResponse>;
  reviewWorkspaceDiscoveryTest(
    organizationId: string, workflowKey: string,
    payload: DiscoveryWorkflowReviewCreate, csrfToken: string
  ): Promise<DiscoveryEventCreateResponse>;
  getWorkspaceConvergence(
    organizationId: string
  ): Promise<WorkspaceConvergenceResponse>;
  updateWorkspaceConvergence(
    organizationId: string,
    payload: WorkspaceConvergenceUpdate,
    csrfToken: string,
  ): Promise<WorkspaceConvergenceUpdateResponse>;
  chatWithSatchy(
    organizationId: string,
    payload: Chat,
    csrfToken: string,
  ): Promise<SatchyChatResponse>;
  listSatchyRuns(
    organizationId: string, limit?: number
  ): Promise<SatchyRunResponse[]>;
  getSatchyRun(organizationId: string, runId: string): Promise<SatchyRunResponse>;
  reviewSatchyAction(
    organizationId: string,
    actionId: string,
    decision: "approve" | "reject",
    csrfToken: string,
    notes?: string,
  ): Promise<WorkspaceActionReviewResponse>;
  createWorkspaceObservation(
    organizationId: string,
    payload: Observation,
    csrfToken: string,
  ): Promise<WorkspaceObservationResponse>;
  getWorkspaceIntegrationCatalog(
    organizationId: string,
  ): Promise<WorkspaceIntegrationSetupCatalogItem[]>;
  createWorkspaceIntegration(
    organizationId: string,
    payload: WorkspaceIntegrationCreateRequest,
    csrfToken: string,
  ): Promise<WorkspaceIntegrationConnection>;
  configureWorkspaceIntegrationCredentials(
    organizationId: string,
    connectionId: string,
    values: Record<string, string>,
    csrfToken: string,
  ): Promise<WorkspaceIntegrationConnection>;
  authorizeWorkspaceIntegration(
    organizationId: string,
    connectionId: string,
    csrfToken: string,
  ): Promise<WorkspaceIntegrationAuthorizeResponse>;
  testWorkspaceIntegration(
    organizationId: string,
    connectionId: string,
    csrfToken: string,
  ): Promise<WorkspaceIntegrationConnection>;
  revokeWorkspaceIntegration(
    organizationId: string,
    connectionId: string,
    csrfToken: string,
  ): Promise<WorkspaceIntegrationConnection>;
  queryWorkspaceIntegration(
    organizationId: string,
    payload: WorkspaceIntegrationQueryRequest,
    csrfToken: string,
  ): Promise<Record<string, unknown>>;

  getWorkspaceModuleSettings(
    organizationId: string, context?: {site_id?: string; team_id?: string}, support?: boolean,
  ): Promise<WorkspaceModuleSettingsResponse>;
  saveWorkspaceModuleSettings(
    organizationId: string, payload: WorkspaceModuleSettingsWrite,
    csrfToken: string, support?: boolean,
  ): Promise<WorkspaceModuleSettingsResponse>;
  getWorkspaceModuleCatalog(
    organizationId: string,
    query: {source: "avy_na" | "uac" | "caic" | "wfigs";
      fire_states?: string[]; region_ids?: string[]},
    support?: boolean,
  ): Promise<WorkspaceModuleCatalog>;
  getWorkspaceModuleEnvironment(
    organizationId: string,
    options: {source: "avy_na" | "uac" | "caic" | "wfigs";
      region_id: string; fire_states?: string[]},
    support?: boolean,
  ): Promise<WorkspaceModuleEnvironment>;
  getWorkspaceInvitations(organizationId: string): Promise<WorkspaceInvitationResponse[]>;
  createWorkspaceInvitation(
    organizationId: string, payload: WorkspaceInvitationCreate, csrfToken: string,
  ): Promise<WorkspaceIssuedInvitation>;
  revokeWorkspaceInvitation(
    organizationId: string, invitationId: string, csrfToken: string,
  ): Promise<WorkspaceInvitationResponse>;
  getWorkspaceInvitationPreview(
    token: string, csrfToken: string,
  ): Promise<WorkspaceInvitationPreview>;
  acceptWorkspaceInvitation(token: string, csrfToken: string): Promise<WorkspaceMemberResponse>;
  createWorkspaceBillingPortal(
    organizationId: string, csrfToken: string,
  ): Promise<WorkspaceBillingPortalResponse>;
  getWorkspaceAccess(organizationId: string): Promise<WorkspaceAccessResponse>;
  getWorkspaceAccount(): Promise<WorkspaceAccount>;
  updateWorkspaceAccount(
    payload: WorkspaceAccountUpdate,
    csrfToken: string,
  ): Promise<WorkspaceAccount>;
  getWorkspaceDevices(organizationId: string): Promise<WorkspaceFleetResponse>;
  getWorkspaceDevice(organizationId: string, deviceId: string): Promise<WorkspaceDeviceResponse>;
  updateWorkspaceDevice(
    organizationId: string,
    deviceId: string,
    payload: WorkspaceDeviceUpdate,
    csrfToken: string,
  ): Promise<WorkspaceDeviceResponse>;
  pairWorkspaceDevice(
    organizationId: string,
    payload: WorkspacePairingApproval,
    csrfToken: string,
  ): Promise<Record<string, unknown>>;
  getWorkspaceOrganization(organizationId: string): Promise<WorkspaceOrganizationResponse>;
  updateWorkspaceOrganization(
    organizationId: string,
    payload: WorkspaceOrganizationUpdate,
    csrfToken: string,
  ): Promise<WorkspaceOrganizationResponse>;
  getWorkspaceSites(organizationId: string): Promise<SiteResponse[]>;
  createWorkspaceSite(
    organizationId: string,
    payload: SiteCreateRequest,
    csrfToken: string,
  ): Promise<SiteResponse>;
  updateWorkspaceSite(
    organizationId: string,
    siteId: string,
    payload: SiteUpdateRequest,
    csrfToken: string,
  ): Promise<SiteResponse>;
  getWorkspaceTeams(organizationId: string): Promise<TeamResponse[]>;
  createWorkspaceTeam(
    organizationId: string,
    payload: TeamCreateRequest,
    csrfToken: string,
  ): Promise<TeamResponse>;
  updateWorkspaceTeam(
    organizationId: string,
    teamId: string,
    payload: TeamUpdateRequest,
    csrfToken: string,
  ): Promise<TeamResponse>;
  getWorkspaceMembers(organizationId: string): Promise<WorkspaceMemberResponse[]>;
  createWorkspaceMember(
    organizationId: string,
    payload: WorkspaceMemberCreate,
    csrfToken: string,
  ): Promise<WorkspaceMemberResponse>;
  updateWorkspaceMember(
    organizationId: string,
    memberId: string,
    payload: WorkspaceMemberUpdate,
    csrfToken: string,
  ): Promise<WorkspaceMemberResponse>;
  getWorkspaceApiKeys(organizationId: string): Promise<WorkspaceKeyResponse[]>;
  createWorkspaceApiKey(
    organizationId: string,
    payload: WorkspaceKeyCreate,
    csrfToken: string,
  ): Promise<WorkspaceIssuedKey>;
  revokeWorkspaceApiKey(
    organizationId: string,
    keyId: string,
    csrfToken: string,
  ): Promise<WorkspaceKeyResponse>;
  getWorkspaceAdminSession(): Promise<WorkspaceAdminSession>;
  getWorkspaceAdminOrganizations(): Promise<WorkspaceOrganizationResponse[]>;
  getWorkspaceAdminOverview(organizationId: string): Promise<WorkspaceAdminOverviewResponse>;
  chatWithAdminSatchy(
    organizationId: string, payload: Chat, csrfToken: string,
  ): Promise<SatchyChatResponse>;
  listAdminSatchyRuns(organizationId: string): Promise<SatchyRunResponse[]>;
  getWorkspaceContext(
    organizationId: string, options?: {q?: string; offset?: number; siteId?: string},
    platformSupport?: boolean,
  ): Promise<ContextPage>;
  updateWorkspaceContext(
    organizationId: string, sourceId: string, payload: ContextLifecycle, csrfToken: string,
  ): Promise<Record<string, unknown>>;
  getWorkspaceFiles(organizationId: string): Promise<WorkspaceFileInfo[]>;
  uploadWorkspaceFile(
    organizationId: string, payload: FormData, csrfToken: string,
  ): Promise<WorkspaceFileInfo>;
  downloadWorkspaceFile(organizationId: string, fileId: string): Promise<Blob>;
  updateWorkspaceAdminOrganization(
    organizationId: string,
    payload: WorkspaceOrganizationUpdate,
    csrfToken: string,
  ): Promise<WorkspaceOrganizationResponse>;
  getWorkspaceAdminDevice(
    organizationId: string,
    deviceId: string,
  ): Promise<WorkspaceDeviceResponse>;
  updateWorkspaceAdminDevice(
    organizationId: string,
    deviceId: string,
    payload: WorkspaceDeviceUpdate,
    csrfToken: string,
  ): Promise<WorkspaceDeviceResponse>;
  getWorkspaceEmails(
    organizationId: string, options?: {q?: string; mailbox?: string; offset?: number},
  ): Promise<WorkspaceEmailListResponse>;
  getWorkspaceEmailAttachment(
    organizationId: string,
    messageId: string,
    attachmentId: string,
  ): Promise<Record<string, string>>;
  getWorkspaceEmail(organizationId: string, messageId: string): Promise<WorkspaceEmailDetail>;
  sendWorkspaceEmail(
    organizationId: string,
    payload: ComposeEmail,
    csrfToken: string,
  ): Promise<WorkspaceEmailResult>;
  replyWorkspaceEmail(
    organizationId: string,
    messageId: string,
    payload: ReplyEmail,
    csrfToken: string,
  ): Promise<WorkspaceEmailResult>;
  markWorkspaceEmailRead(
    organizationId: string,
    messageId: string,
    csrfToken: string,
  ): Promise<Record<string, unknown>>;
  getWorkspaceMailboxDelegations(
    organizationId: string,
    mailbox: string,
  ): Promise<WorkspaceMailboxDelegations>;
  grantWorkspaceMailboxDelegation(
    organizationId: string,
    payload: MailboxDelegationRequest,
    csrfToken: string,
  ): Promise<Record<string, unknown>>;
  revokeWorkspaceMailboxDelegation(
    organizationId: string,
    payload: MailboxDelegationRevoke,
    csrfToken: string,
  ): Promise<Record<string, unknown>>;
  getWinterRecord(organizationId: string, recordId: string): Promise<RecordResponse>;
  listWinterRecords(organizationId: string, siteId: string, kind: string,
    offset?: number, limit?: number): Promise<RecordPage>;
  saveWinterRecord(organizationId: string, recordId: string,
    payload: RecordWrite, csrfToken: string): Promise<RecordResponse>;
  analyzeWinterRecord(organizationId: string, recordId: string,
    payload: AnalysisRequest, csrfToken: string): Promise<AnalysisResponse>;
  connectEvents(options?: {
    token?: string;
    topics?: RealtimeTopic[];
  }): WebSocket;
}
