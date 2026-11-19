-- Initial schema for Supabase Postgres. Run in Supabase SQL editor (or the app auto-creates tables on first start).

CREATE TABLE IF NOT EXISTS campaigns (
	id SERIAL NOT NULL, 
	name VARCHAR(200), 
	platform VARCHAR(50), 
	url VARCHAR(500), 
	rate_per_1k FLOAT, 
	rules TEXT, 
	content_rights_confirmed BOOLEAN, 
	rules_verified BOOLEAN, 
	payout_verified BOOLEAN, 
	deadline TIMESTAMP WITHOUT TIME ZONE, 
	min_views INTEGER, 
	allowed_sources JSON, 
	status VARCHAR(20), 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS engine_state (
	engine VARCHAR(20) NOT NULL, 
	state VARCHAR(20), 
	PRIMARY KEY (engine)
);

CREATE TABLE IF NOT EXISTS jobs (
	id SERIAL NOT NULL, 
	engine VARCHAR(20), 
	kind VARCHAR(40), 
	payload JSON, 
	status VARCHAR(20), 
	attempts INTEGER, 
	last_error TEXT, 
	result JSON, 
	run_after TIMESTAMP WITHOUT TIME ZONE, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	updated_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS ix_jobs_status ON jobs (status);
CREATE INDEX IF NOT EXISTS ix_jobs_engine ON jobs (engine);

CREATE TABLE IF NOT EXISTS logs (
	id SERIAL NOT NULL, 
	level VARCHAR(10), 
	engine VARCHAR(20), 
	message TEXT, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS spend (
	id SERIAL NOT NULL, 
	service VARCHAR(50), 
	usd FLOAT, 
	note VARCHAR(200), 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS topics (
	id SERIAL NOT NULL, 
	title VARCHAR(300) NOT NULL, 
	fingerprint VARCHAR(64), 
	source VARCHAR(100), 
	source_urls JSON, 
	signals JSON, 
	scores JSON, 
	total_score FLOAT, 
	verified BOOLEAN, 
	verification_note TEXT, 
	kind VARCHAR(20), 
	status VARCHAR(20), 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_topics_fingerprint ON topics (fingerprint);

CREATE TABLE IF NOT EXISTS calendar (
	id SERIAL NOT NULL, 
	date VARCHAR(10), 
	engine VARCHAR(20), 
	topic_id INTEGER, 
	status VARCHAR(20), 
	PRIMARY KEY (id), 
	FOREIGN KEY(topic_id) REFERENCES topics (id)
);
CREATE INDEX IF NOT EXISTS ix_calendar_date ON calendar (date);

CREATE TABLE IF NOT EXISTS videos (
	id SERIAL NOT NULL, 
	engine VARCHAR(20), 
	topic_id INTEGER, 
	title VARCHAR(200), 
	description TEXT, 
	tags JSON, 
	script TEXT, 
	file_path VARCHAR(500), 
	thumbnail_path VARCHAR(500), 
	duration FLOAT, 
	content_hash VARCHAR(64), 
	qc JSON, 
	approval VARCHAR(20), 
	upload_status VARCHAR(20), 
	youtube_id VARCHAR(40), 
	publish_at TIMESTAMP WITHOUT TIME ZONE, 
	playlist_id VARCHAR(64), 
	stats JSON, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(topic_id) REFERENCES topics (id)
);
CREATE INDEX IF NOT EXISTS ix_videos_content_hash ON videos (content_hash);

CREATE TABLE IF NOT EXISTS submissions (
	id SERIAL NOT NULL, 
	campaign_id INTEGER, 
	video_id INTEGER, 
	post_url VARCHAR(500), 
	views INTEGER, 
	payout_usd FLOAT, 
	status VARCHAR(20), 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(campaign_id) REFERENCES campaigns (id), 
	FOREIGN KEY(video_id) REFERENCES videos (id)
);

INSERT INTO engine_state (engine, state) VALUES ('shorts','running'), ('longform','running'), ('clipping','running'), ('publish','running') ON CONFLICT DO NOTHING;
-- Lock down: app connects with the service connection string; no anon access.
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE engine_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE spend ENABLE ROW LEVEL SECURITY;
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
