-- Enable pgvector extension
-- Run this script in your PostgreSQL database before running migrations
-- You can run it using: psql -d chatbot_db -f enablePgvector.sql
-- Or through any PostgreSQL client (pgAdmin, DBeaver, etc.)

CREATE EXTENSION IF NOT EXISTS vector;

