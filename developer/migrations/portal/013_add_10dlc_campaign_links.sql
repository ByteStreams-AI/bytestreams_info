-- What a campaign was submitted WITH: the menu host and the evidence folder the
-- reviewer is pointed at. Recorded because the live tenant is the prod clone,
-- so these are confirmed by the admin at submit time rather than derived from
-- the row the portal created.

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS tcr_menu_host          TEXT,
  ADD COLUMN IF NOT EXISTS tcr_evidence_base_url  TEXT;

COMMENT ON COLUMN businesses.tcr_menu_host         IS 'The branded menu host the campaign message flow points at, as submitted';
COMMENT ON COLUMN businesses.tcr_evidence_base_url IS 'The public compliance-evidence folder (…/compliance-evidence/<restaurant_id>) the campaign screenshots were taken from, as submitted';
