-- Runs once on first container start. PostGIS is also ensured by Flyway V1 for non-Docker deployments.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- TimescaleDB is optional; enable when the extension is installed on the target cluster.
-- CREATE EXTENSION IF NOT EXISTS timescaledb;
