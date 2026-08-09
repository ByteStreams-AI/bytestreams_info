-- Migration 008: Add restaurant tier enum values
-- Run in Portal Supabase SQL Editor (mxhyvvgjtqllohpvrwon)
--
-- Adds tier values to match the Portal Admin UI:
-- - food_truck
-- - single_location
-- - multi_configuration
-- - multi_location
--
-- Existing values (pilot, starter, pro, enterprise) are preserved.

-- Add new enum values in order
-- Note: ALTER TYPE ADD VALUE cannot run inside a transaction block in some versions,
-- so each statement is separate and idempotent.

DO $$
BEGIN
    -- Add food_truck after pilot
    IF NOT EXISTS (SELECT 1 FROM pg_enum e
                   JOIN pg_type t ON e.enumtypid = t.oid
                   WHERE t.typname = 'restaurant_tier'
                   AND e.enumlabel = 'food_truck') THEN
        ALTER TYPE restaurant_tier ADD VALUE 'food_truck' AFTER 'pilot';
    END IF;
END $$;

DO $$
BEGIN
    -- Add single_location after starter (or after food_truck if starter doesn't exist)
    IF NOT EXISTS (SELECT 1 FROM pg_enum e
                   JOIN pg_type t ON e.enumtypid = t.oid
                   WHERE t.typname = 'restaurant_tier'
                   AND e.enumlabel = 'single_location') THEN
        -- Try to add after starter, fall back to after food_truck
        BEGIN
            ALTER TYPE restaurant_tier ADD VALUE 'single_location' AFTER 'starter';
        EXCEPTION WHEN undefined_object THEN
            ALTER TYPE restaurant_tier ADD VALUE 'single_location' AFTER 'food_truck';
        END;
    END IF;
END $$;

DO $$
BEGIN
    -- Add multi_configuration after single_location
    IF NOT EXISTS (SELECT 1 FROM pg_enum e
                   JOIN pg_type t ON e.enumtypid = t.oid
                   WHERE t.typname = 'restaurant_tier'
                   AND e.enumlabel = 'multi_configuration') THEN
        ALTER TYPE restaurant_tier ADD VALUE 'multi_configuration' AFTER 'single_location';
    END IF;
END $$;

DO $$
BEGIN
    -- Add multi_location after pro (or after multi_configuration if pro doesn't exist)
    IF NOT EXISTS (SELECT 1 FROM pg_enum e
                   JOIN pg_type t ON e.enumtypid = t.oid
                   WHERE t.typname = 'restaurant_tier'
                   AND e.enumlabel = 'multi_location') THEN
        -- Try to add after pro, fall back to after multi_configuration
        BEGIN
            ALTER TYPE restaurant_tier ADD VALUE 'multi_location' AFTER 'pro';
        EXCEPTION WHEN undefined_object THEN
            ALTER TYPE restaurant_tier ADD VALUE 'multi_location' AFTER 'multi_configuration';
        END;
    END IF;
END $$;

-- Verify final enum values
SELECT
    e.enumlabel AS tier_value,
    e.enumsortorder AS sort_order
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
WHERE t.typname = 'restaurant_tier'
ORDER BY e.enumsortorder;
