-- 0003_projects_access_mode.sql
-- Add access_mode column to projects table, defaulting to 'read-only'

ALTER TABLE projects ADD COLUMN access_mode TEXT NOT NULL DEFAULT 'read-only';
