-- 0013_tokens_purpose.sql
-- Add purpose column to tokens table for dedicated AI client purpose binding
ALTER TABLE tokens ADD COLUMN purpose TEXT;
