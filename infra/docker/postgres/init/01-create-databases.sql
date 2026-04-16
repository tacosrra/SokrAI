CREATE USER sokrai_app WITH PASSWORD 'localpass';
CREATE USER sokrai_n8n WITH PASSWORD 'localpass';

CREATE DATABASE sokrai_app OWNER sokrai_app;
CREATE DATABASE sokrai_n8n OWNER sokrai_n8n;

GRANT ALL PRIVILEGES ON DATABASE sokrai_app TO sokrai_app;
GRANT ALL PRIVILEGES ON DATABASE sokrai_n8n TO sokrai_n8n;
