-- AACT `ctgov` tables used by Enigma, with AACT column names.
-- Only used by `pnpm aact:subset`, which fills these tables from the public
-- ClinicalTrials.gov API when no CTTI dump is available. A real pg_restore of
-- an AACT dump creates the full schema and this file is not needed.
CREATE SCHEMA IF NOT EXISTS ctgov;
SET search_path = ctgov;

CREATE TABLE IF NOT EXISTS studies (
  nct_id text PRIMARY KEY, brief_title text, official_title text, acronym text,
  overall_status text, study_type text, phase text, enrollment integer, enrollment_type text,
  start_date date, primary_completion_date date, completion_date date,
  results_first_submitted_date date, results_first_posted_date date,
  last_update_submitted_date date, why_stopped text, source text, source_class text
);
CREATE TABLE IF NOT EXISTS designs (
  id bigserial PRIMARY KEY, nct_id text, allocation text, intervention_model text,
  primary_purpose text, masking text
);
CREATE TABLE IF NOT EXISTS eligibilities (
  id bigserial PRIMARY KEY, nct_id text, gender text, minimum_age text, maximum_age text,
  healthy_volunteers text, criteria text, adult boolean, child boolean, older_adult boolean
);
CREATE TABLE IF NOT EXISTS conditions (
  id bigserial PRIMARY KEY, nct_id text, name text, downcase_name text
);
CREATE TABLE IF NOT EXISTS browse_conditions (
  id bigserial PRIMARY KEY, nct_id text, mesh_term text, downcase_mesh_term text, mesh_type text
);
CREATE TABLE IF NOT EXISTS interventions (
  id bigserial PRIMARY KEY, nct_id text, intervention_type text, name text, description text
);
CREATE TABLE IF NOT EXISTS intervention_other_names (
  id bigserial PRIMARY KEY, nct_id text, intervention_id bigint, name text
);
CREATE TABLE IF NOT EXISTS browse_interventions (
  id bigserial PRIMARY KEY, nct_id text, mesh_term text, downcase_mesh_term text, mesh_type text
);
CREATE TABLE IF NOT EXISTS design_groups (
  id bigserial PRIMARY KEY, nct_id text, group_type text, title text, description text
);
CREATE TABLE IF NOT EXISTS design_group_interventions (
  id bigserial PRIMARY KEY, nct_id text, design_group_id bigint, intervention_id bigint
);
CREATE TABLE IF NOT EXISTS sponsors (
  id bigserial PRIMARY KEY, nct_id text, agency_class text, lead_or_collaborator text, name text
);
CREATE TABLE IF NOT EXISTS result_groups (
  id bigserial PRIMARY KEY, nct_id text, ctgov_group_code text, result_type text,
  title text, description text
);
CREATE TABLE IF NOT EXISTS baseline_counts (
  id bigserial PRIMARY KEY, nct_id text, result_group_id bigint, ctgov_group_code text,
  units text, scope text, count integer
);
CREATE TABLE IF NOT EXISTS baseline_measurements (
  id bigserial PRIMARY KEY, nct_id text, result_group_id bigint, ctgov_group_code text,
  classification text, category text, title text, description text, units text,
  param_type text, param_value text, param_value_num numeric,
  dispersion_type text, dispersion_value text, dispersion_value_num numeric,
  dispersion_lower_limit numeric, dispersion_upper_limit numeric, explanation_of_na text
);
CREATE TABLE IF NOT EXISTS outcomes (
  id bigserial PRIMARY KEY, nct_id text, outcome_type text, title text, description text,
  time_frame text, population text, units text, units_analyzed text,
  dispersion_type text, param_type text
);
CREATE TABLE IF NOT EXISTS outcome_counts (
  id bigserial PRIMARY KEY, nct_id text, outcome_id bigint, result_group_id bigint,
  ctgov_group_code text, scope text, units text, count integer
);
CREATE TABLE IF NOT EXISTS outcome_measurements (
  id bigserial PRIMARY KEY, nct_id text, outcome_id bigint, result_group_id bigint,
  ctgov_group_code text, classification text, category text, title text, description text,
  units text, param_type text, param_value text, param_value_num numeric,
  dispersion_type text, dispersion_value text, dispersion_value_num numeric,
  dispersion_lower_limit numeric, dispersion_upper_limit numeric, explanation_of_na text
);
CREATE TABLE IF NOT EXISTS outcome_analyses (
  id bigserial PRIMARY KEY, nct_id text, outcome_id bigint,
  non_inferiority_type text, non_inferiority_description text,
  param_type text, param_value numeric, dispersion_type text, dispersion_value numeric,
  p_value_modifier text, p_value numeric, p_value_description text,
  ci_n_sides text, ci_percent numeric, ci_lower_limit numeric, ci_upper_limit numeric,
  ci_upper_limit_na_comment text, method text, method_description text,
  estimate_description text, groups_description text, other_analysis_description text
);
CREATE TABLE IF NOT EXISTS outcome_analysis_groups (
  id bigserial PRIMARY KEY, nct_id text, outcome_analysis_id bigint, result_group_id bigint,
  ctgov_group_code text
);
CREATE TABLE IF NOT EXISTS enigma_subset_meta (
  key text PRIMARY KEY, value text
);

CREATE INDEX IF NOT EXISTS outcomes_nct ON outcomes (nct_id);
CREATE INDEX IF NOT EXISTS outcome_measurements_outcome ON outcome_measurements (outcome_id);
CREATE INDEX IF NOT EXISTS outcome_counts_outcome ON outcome_counts (outcome_id);
CREATE INDEX IF NOT EXISTS outcome_analyses_outcome ON outcome_analyses (outcome_id);
CREATE INDEX IF NOT EXISTS outcome_analysis_groups_analysis ON outcome_analysis_groups (outcome_analysis_id);
CREATE INDEX IF NOT EXISTS result_groups_nct ON result_groups (nct_id);
CREATE INDEX IF NOT EXISTS baseline_measurements_nct ON baseline_measurements (nct_id);
