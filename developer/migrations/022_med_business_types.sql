-- Sets DialTone.Med business types to General Practice, Specialty Practice, and
-- Specialty Pharmacy. Applied after 021_add_lead_product.sql, before any Med lead existed.
-- Safe to re-run: it replaces the constraint.
-- Run this in the hltmzafywzqajjzjpqva Supabase SQL Editor.

ALTER TABLE leads
  DROP CONSTRAINT IF EXISTS leads_business_type_check;

-- Business types depend on the product. Keep in sync with src/lib/products.ts.
ALTER TABLE leads
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
      'general_practice',
      'specialty_practice',
      'specialty_pharmacy'
    ))
  );
