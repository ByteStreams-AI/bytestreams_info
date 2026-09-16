-- A DialTone.Menu tenant's LEGAL (business) address can differ from the restaurant's.
-- The restaurant address lives on the DialTone `locations` row (geocoding, delivery,
-- tax); the legal address is what the EIN record, TCR brand registration and any
-- correspondence use. Until now the two were one field.

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS business_address_same        BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS restaurant_address_verified  BOOLEAN NOT NULL DEFAULT FALSE;

-- Existing DialTone.Menu rows verified one address, the restaurant's, and stored the
-- result in address_verified. That is the "same" case by definition.
UPDATE businesses
   SET restaurant_address_verified = address_verified
 WHERE dialtone_location_id IS NOT NULL;

COMMENT ON COLUMN businesses.address                     IS 'Legal (business) street address. For DialTone.Menu it is the restaurant address when business_address_same, else the separately entered legal address.';
COMMENT ON COLUMN businesses.address_city                IS 'Legal (business) city';
COMMENT ON COLUMN businesses.address_state               IS 'Legal (business) two-character US state';
COMMENT ON COLUMN businesses.address_postal_code         IS 'Legal (business) ZIP';
COMMENT ON COLUMN businesses.address_verified            IS 'PostGrid result for the LEGAL address — what onboarding and TCR brand registration require';
COMMENT ON COLUMN businesses.business_address_same       IS 'DialTone.Menu: the legal address is the restaurant address (locations row)';
COMMENT ON COLUMN businesses.restaurant_address_verified IS 'DialTone.Menu: PostGrid result for the restaurant address on the locations row';
