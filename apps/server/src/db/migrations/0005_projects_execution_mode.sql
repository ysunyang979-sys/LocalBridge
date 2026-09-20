-- 0005_projects_execution_mode.sql
-- Add execution_mode column to projects table, defaulting to 'disabled'

ALTER TABLE projects ADD COLUMN execution_mode TEXT NOT NULL DEFAULT 'disabled';
