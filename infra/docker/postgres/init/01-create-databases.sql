CREATE USER sokrai_app WITH PASSWORD 'localpass';
CREATE USER sokrai_n8n WITH PASSWORD 'localpass';

CREATE DATABASE sokrai_app OWNER sokrai_app;
CREATE DATABASE sokrai_n8n OWNER sokrai_n8n;

GRANT ALL PRIVILEGES ON DATABASE sokrai_app TO sokrai_app;
GRANT ALL PRIVILEGES ON DATABASE sokrai_n8n TO sokrai_n8n;

-- Install the pgvector extension as a superuser inside the application
-- database so that subsequent migrations (which run as `sokrai_app`) can
-- create columns and indexes that depend on the `vector` type.
\connect sokrai_app
CREATE EXTENSION IF NOT EXISTS vector;
