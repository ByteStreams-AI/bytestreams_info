-- Cleanup test data for "bytestreams LLC" and "Hi Sandwich" restaurant
-- Run this in the Portal Supabase SQL Editor
--
-- This script deletes in the correct order to respect foreign key constraints:
-- 1. billing_schedule (references businesses)
-- 2. portal_accounts (references businesses)
-- 3. businesses (references locations)
-- 4. locations (references restaurants)
-- 5. restaurants (root)

-- Find IDs first (for verification)
DO $$
DECLARE
    v_restaurant_id UUID;
    v_location_id UUID;
    v_business_id UUID;
BEGIN
    -- Get restaurant ID
    SELECT id INTO v_restaurant_id
    FROM restaurants
    WHERE slug = 'hi-sandwich' OR name = 'Hi Sandwich';

    IF v_restaurant_id IS NOT NULL THEN
        RAISE NOTICE 'Found restaurant ID: %', v_restaurant_id;

        -- Get location ID
        SELECT id INTO v_location_id
        FROM locations
        WHERE restaurant_id = v_restaurant_id;

        IF v_location_id IS NOT NULL THEN
            RAISE NOTICE 'Found location ID: %', v_location_id;

            -- Get business ID
            SELECT id INTO v_business_id
            FROM businesses
            WHERE dialtone_location_id = v_location_id
               OR name ILIKE '%bytestreams llc%';

            IF v_business_id IS NOT NULL THEN
                RAISE NOTICE 'Found business ID: %', v_business_id;

                -- Delete billing_schedule
                DELETE FROM billing_schedule WHERE business_id = v_business_id;
                RAISE NOTICE 'Deleted billing_schedule records';

                -- Delete portal_accounts
                DELETE FROM portal_accounts WHERE business_id = v_business_id;
                RAISE NOTICE 'Deleted portal_accounts records';

                -- Delete businesses
                DELETE FROM businesses WHERE id = v_business_id;
                RAISE NOTICE 'Deleted business record';
            END IF;

            -- Delete locations
            DELETE FROM locations WHERE id = v_location_id;
            RAISE NOTICE 'Deleted location record';
        END IF;

        -- Delete restaurants
        DELETE FROM restaurants WHERE id = v_restaurant_id;
        RAISE NOTICE 'Deleted restaurant record';

        RAISE NOTICE 'Cleanup complete!';
    ELSE
        RAISE NOTICE 'No restaurant found with slug "hi-sandwich" or name "Hi Sandwich"';
    END IF;

    -- Also check for standalone bytestreams LLC business (not linked to restaurant)
    DELETE FROM billing_schedule
    WHERE business_id IN (SELECT id FROM businesses WHERE name ILIKE '%bytestreams llc%');

    DELETE FROM portal_accounts
    WHERE business_id IN (SELECT id FROM businesses WHERE name ILIKE '%bytestreams llc%');

    DELETE FROM businesses WHERE name ILIKE '%bytestreams llc%';

    RAISE NOTICE 'Cleanup of standalone bytestreams LLC businesses complete';
END $$;
