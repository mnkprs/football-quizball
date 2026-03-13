-- Update all questions in question_pool to generation_version 1.0.5.
-- Use when you want to normalize all existing questions to the current version.

UPDATE question_pool
SET generation_version = '1.0.6';
