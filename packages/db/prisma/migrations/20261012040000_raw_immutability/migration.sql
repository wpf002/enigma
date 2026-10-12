-- Raw layer is verbatim and immutable (ENIGMA_ROADMAP.md §3).
-- INSERT is the only write the raw tables accept. Rebuilds add a new snapshot.
CREATE OR REPLACE FUNCTION enigma_raw_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'raw layer is immutable: % on % is not allowed', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER raw_study_immutable BEFORE UPDATE OR DELETE ON "raw_study"
  FOR EACH ROW EXECUTE FUNCTION enigma_raw_immutable();
CREATE TRIGGER raw_study_no_truncate BEFORE TRUNCATE ON "raw_study"
  FOR EACH STATEMENT EXECUTE FUNCTION enigma_raw_immutable();

CREATE TRIGGER raw_outcome_measure_immutable BEFORE UPDATE OR DELETE ON "raw_outcome_measure"
  FOR EACH ROW EXECUTE FUNCTION enigma_raw_immutable();
CREATE TRIGGER raw_outcome_measure_no_truncate BEFORE TRUNCATE ON "raw_outcome_measure"
  FOR EACH STATEMENT EXECUTE FUNCTION enigma_raw_immutable();

CREATE TRIGGER raw_outcome_analysis_immutable BEFORE UPDATE OR DELETE ON "raw_outcome_analysis"
  FOR EACH ROW EXECUTE FUNCTION enigma_raw_immutable();
CREATE TRIGGER raw_outcome_analysis_no_truncate BEFORE TRUNCATE ON "raw_outcome_analysis"
  FOR EACH STATEMENT EXECUTE FUNCTION enigma_raw_immutable();
