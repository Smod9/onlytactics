-- Drop foreign key constraints on race_conditions and race_results
-- so stats can be saved independently of the races table.

ALTER TABLE race_conditions DROP CONSTRAINT IF EXISTS race_conditions_race_id_fkey;
ALTER TABLE race_results DROP CONSTRAINT IF EXISTS race_results_race_id_fkey;
