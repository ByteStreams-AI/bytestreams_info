-- Check valid values for restaurant_tier enum
-- Run this in Portal Supabase SQL Editor

SELECT
    t.typname AS enum_name,
    e.enumlabel AS enum_value,
    e.enumsortorder AS sort_order
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
WHERE t.typname = 'restaurant_tier'
ORDER BY e.enumsortorder;

-- Alternative query if the above doesn't work:
-- SELECT unnest(enum_range(NULL::restaurant_tier));
