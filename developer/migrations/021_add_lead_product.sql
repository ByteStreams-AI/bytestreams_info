-- Adds DialTone.Med prospects to the CRM alongside DialTone.Menu leads.
-- Every existing lead becomes a DialTone.Menu lead through the column default.
-- Med leads hold organization-level qualification data only: no patient data,
-- Tax IDs, or credential evidence.
-- Run this in the hltmzafywzqajjzjpqva Supabase SQL Editor.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS product TEXT NOT NULL DEFAULT 'dialtone_menu',
  ADD COLUMN IF NOT EXISTS clinical_specialty VARCHAR(120),
  ADD COLUMN IF NOT EXISTS npi CHAR(10),
  ADD COLUMN IF NOT EXISTS npi_entity_type TEXT;

ALTER TABLE leads
  DROP CONSTRAINT IF EXISTS leads_product_check,
  DROP CONSTRAINT IF EXISTS leads_npi_check,
  DROP CONSTRAINT IF EXISTS leads_npi_entity_type_check,
  DROP CONSTRAINT IF EXISTS leads_med_fields_check,
  DROP CONSTRAINT IF EXISTS leads_business_type_check;

ALTER TABLE leads
  ADD CONSTRAINT leads_product_check CHECK (product IN ('dialtone_menu', 'dialtone_med')),
  ADD CONSTRAINT leads_npi_check CHECK (npi ~ '^[0-9]{10}$'),
  ADD CONSTRAINT leads_npi_entity_type_check CHECK (npi_entity_type IN ('organization', 'individual')),
  -- Med-only columns stay empty on Menu leads.
  ADD CONSTRAINT leads_med_fields_check CHECK (
    product = 'dialtone_med'
    OR (clinical_specialty IS NULL AND npi IS NULL AND npi_entity_type IS NULL)
  ),
  -- Business types depend on the product. Keep in sync with src/lib/products.ts.
  ADD CONSTRAINT leads_business_type_check CHECK (
    business_type IS NULL
    OR (product = 'dialtone_menu' AND business_type IN (
      'food_truck',
      'single_location',
      'multi_configuration',
      'multi_location',
      'enterprise'
    ))
    OR (product = 'dialtone_med' AND business_type IN (
      'medical_practice',
      'dental_practice',
      'specialty_clinic',
      'specialty_pharmacy',
      'health_system'
    ))
  );

CREATE INDEX IF NOT EXISTS leads_product_idx ON leads (product);
