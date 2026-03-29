CREATE TABLE IF NOT EXISTS sources (
  source_id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_instance_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  credentials_ref TEXT,
  enabled BOOLEAN NOT NULL,
  poll_mode TEXT NOT NULL,
  last_success_at TEXT,
  last_cursor TEXT,
  config_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collector_runs (
  collector_run_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  status TEXT NOT NULL,
  message TEXT,
  FOREIGN KEY (source_id) REFERENCES sources(source_id)
);

CREATE TABLE IF NOT EXISTS entities (
  entity_id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  canonical_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  labels_json TEXT NOT NULL,
  properties_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS relations (
  relation_id TEXT PRIMARY KEY,
  relation_type TEXT NOT NULL,
  from_entity_id TEXT NOT NULL,
  to_entity_id TEXT NOT NULL,
  properties_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (from_entity_id) REFERENCES entities(entity_id),
  FOREIGN KEY (to_entity_id) REFERENCES entities(entity_id)
);

CREATE TABLE IF NOT EXISTS observations (
  observation_id TEXT PRIMARY KEY,
  subject_kind TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_instance_id TEXT NOT NULL,
  source_ref_json TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  collector_run_id TEXT NOT NULL,
  confidence REAL NOT NULL,
  raw_evidence_ref TEXT NOT NULL,
  FOREIGN KEY (collector_run_id) REFERENCES collector_runs(collector_run_id)
);

CREATE TABLE IF NOT EXISTS snapshots (
  snapshot_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  scope TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  graph_version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS snapshot_entities (
  snapshot_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, entity_id),
  FOREIGN KEY (snapshot_id) REFERENCES snapshots(snapshot_id),
  FOREIGN KEY (entity_id) REFERENCES entities(entity_id)
);

CREATE TABLE IF NOT EXISTS snapshot_relations (
  snapshot_id TEXT NOT NULL,
  relation_id TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, relation_id),
  FOREIGN KEY (snapshot_id) REFERENCES snapshots(snapshot_id),
  FOREIGN KEY (relation_id) REFERENCES relations(relation_id)
);

CREATE TABLE IF NOT EXISTS topology_projections (
  topology_id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL,
  view_type TEXT NOT NULL,
  format TEXT NOT NULL,
  rendered_at TEXT NOT NULL,
  payload TEXT NOT NULL,
  FOREIGN KEY (snapshot_id) REFERENCES snapshots(snapshot_id)
);

CREATE TABLE IF NOT EXISTS drift_findings (
  finding_id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL,
  drift_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  details_json TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  FOREIGN KEY (snapshot_id) REFERENCES snapshots(snapshot_id)
);
