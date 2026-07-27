-- Store auditable restaurant research runs and human-reviewed findings.

CREATE TABLE IF NOT EXISTS lead_research_runs (
    run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(lead_id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
    source_url TEXT NOT NULL,
    requested_by_email TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    error_summary TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS lead_research_runs_one_running_per_lead_idx
    ON lead_research_runs (lead_id)
    WHERE status = 'running';

CREATE INDEX IF NOT EXISTS lead_research_runs_lead_started_idx
    ON lead_research_runs (lead_id, started_at DESC);

CREATE TABLE IF NOT EXISTS lead_research_findings (
    finding_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES lead_research_runs(run_id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES leads(lead_id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    value TEXT NOT NULL,
    source_url TEXT NOT NULL,
    retrieved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    confidence NUMERIC(4, 3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    review_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (review_status IN ('pending', 'approved', 'rejected')),
    reviewed_by_email TEXT,
    reviewed_at TIMESTAMPTZ,
    UNIQUE (run_id, category, value)
);

CREATE INDEX IF NOT EXISTS lead_research_findings_lead_retrieved_idx
    ON lead_research_findings (lead_id, retrieved_at DESC);

CREATE INDEX IF NOT EXISTS lead_research_findings_approved_idx
    ON lead_research_findings (lead_id, review_status)
    WHERE review_status = 'approved';