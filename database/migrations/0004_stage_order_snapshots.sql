-- Keep stable neighbors, because rebalancing makes historical numeric ranks stale.
BEGIN;
ALTER TABLE application_stage_events ADD COLUMN old_neighbors jsonb;
ALTER TABLE application_stage_events ADD CONSTRAINT stage_event_neighbors_shape CHECK (
  old_neighbors IS NULL OR (
    jsonb_typeof(old_neighbors)='object' AND old_neighbors ? 'beforeId' AND old_neighbors ? 'afterId'
  )
);
COMMIT;
