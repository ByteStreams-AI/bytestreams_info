-- Cleanup test data for ONE portal customer, identified by email.
--
-- PREFER developer/remove-portal-customer.mjs (pnpm portal:remove-customer
-- --email <email>). It does the same work with the email as an argument, so
-- there is no literal to edit before running, and it also clears the auth user
-- left behind by a create that failed before the portal_accounts insert.
-- This file remains as the SQL-editor fallback.
-- Run in the Portal Supabase SQL Editor (project mxhyvvgjtqllohpvrwon).
--
-- Covers both New Customer flows:
--
--   DialTone.Menu  restaurants -> locations -> staff -> businesses
--                  -> portal_accounts -> billing_schedule
--   Other          businesses -> portal_accounts -> billing_schedule
--
-- The email is the only thing both flows share and it is unique per portal
-- account, so it is the parameter. The previous version hardcoded
-- slug='hi-sandwich' and name ILIKE '%bytestreams llc%', which matched nothing
-- once the test data changed and deleted by a name pattern broad enough to hit
-- a real customer.
--
-- SAFE BY DEFAULT: v_dry_run is TRUE, so the first run only reports what it
-- would delete. Read the NOTICEs, then set it to FALSE and run again.

DO $$
DECLARE
    -- ── configure ────────────────────────────────────────────────────────
    v_email            TEXT    := 'steveandmici@gmail.com';
    v_dry_run          BOOLEAN := TRUE;   -- FALSE actually deletes
    v_delete_auth_user BOOLEAN := TRUE;   -- also remove the Supabase auth user
    -- ─────────────────────────────────────────────────────────────────────

    v_business_id   UUID;
    v_auth_user_id  UUID;
    v_location_id   UUID;
    v_restaurant_id UUID;
    v_biz_name      TEXT;
    v_biz_type      TEXT;
    v_product       TEXT;
    n               INTEGER;
BEGIN
    SELECT pa.business_id, pa.auth_user_id, pa.product
      INTO v_business_id, v_auth_user_id, v_product
      FROM portal_accounts pa
     WHERE lower(pa.email) = lower(v_email)
     LIMIT 1;

    IF v_business_id IS NULL AND v_auth_user_id IS NULL THEN
        RAISE NOTICE 'No portal account found for %. Nothing to do.', v_email;
        RETURN;
    END IF;

    SELECT b.name, b.business_type, b.dialtone_location_id
      INTO v_biz_name, v_biz_type, v_location_id
      FROM businesses b
     WHERE b.id = v_business_id;

    -- DialTone.Menu links business -> location -> restaurant. Other has none.
    IF v_location_id IS NOT NULL THEN
        SELECT l.restaurant_id INTO v_restaurant_id
          FROM locations l WHERE l.id = v_location_id;
    END IF;

    RAISE NOTICE '─────────────────────────────────────────────';
    RAISE NOTICE 'email          : %', v_email;
    RAISE NOTICE 'product        : %', COALESCE(v_product, '(none)');
    RAISE NOTICE 'business       : % (%)  id=%', COALESCE(v_biz_name,'(none)'), COALESCE(v_biz_type,'-'), v_business_id;
    RAISE NOTICE 'location       : %', COALESCE(v_location_id::TEXT, '(none - Other flow)');
    RAISE NOTICE 'restaurant     : %', COALESCE(v_restaurant_id::TEXT, '(none - Other flow)');
    RAISE NOTICE 'auth user      : %', COALESCE(v_auth_user_id::TEXT, '(none)');
    RAISE NOTICE '─────────────────────────────────────────────';

    IF v_dry_run THEN
        SELECT count(*) INTO n FROM billing_schedule WHERE business_id = v_business_id;
        RAISE NOTICE 'would delete % billing_schedule row(s)', n;
        SELECT count(*) INTO n FROM billing_notifications WHERE business_id = v_business_id;
        RAISE NOTICE 'would delete % billing_notifications row(s)', n;
        SELECT count(*) INTO n FROM portal_messages WHERE business_id = v_business_id;
        RAISE NOTICE 'would delete % portal_messages row(s)', n;
        SELECT count(*) INTO n FROM portal_accounts WHERE business_id = v_business_id
                                                       OR lower(email) = lower(v_email);
        RAISE NOTICE 'would delete % portal_accounts row(s)', n;
        RAISE NOTICE 'would delete % businesses row(s)', CASE WHEN v_business_id IS NULL THEN 0 ELSE 1 END;
        IF v_restaurant_id IS NOT NULL THEN
            SELECT count(*) INTO n FROM staff WHERE restaurant_id = v_restaurant_id;
            RAISE NOTICE 'would delete % staff row(s)', n;
            SELECT count(*) INTO n FROM locations WHERE restaurant_id = v_restaurant_id;
            RAISE NOTICE 'would delete % locations row(s)', n;
            RAISE NOTICE 'would delete 1 restaurants row';
        END IF;
        IF v_delete_auth_user AND v_auth_user_id IS NOT NULL THEN
            RAISE NOTICE 'would delete auth.users row %', v_auth_user_id;
        END IF;
        RAISE NOTICE '─────────────────────────────────────────────';
        RAISE NOTICE 'DRY RUN - nothing deleted. Set v_dry_run := FALSE to apply.';
        RETURN;
    END IF;

    -- Children first. billing_notifications references both billing_schedule
    -- and businesses, so it goes before either.
    DELETE FROM billing_notifications WHERE business_id = v_business_id;
    GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'deleted % billing_notifications', n;

    DELETE FROM billing_schedule WHERE business_id = v_business_id;
    GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'deleted % billing_schedule', n;

    DELETE FROM portal_messages WHERE business_id = v_business_id;
    GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'deleted % portal_messages', n;

    -- Match on email too: a failed create can leave an account with no business.
    DELETE FROM portal_accounts
     WHERE business_id = v_business_id OR lower(email) = lower(v_email);
    GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'deleted % portal_accounts', n;

    -- businesses references locations, so it clears before the location does.
    DELETE FROM businesses WHERE id = v_business_id;
    GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'deleted % businesses', n;

    -- DialTone.Menu only.
    IF v_restaurant_id IS NOT NULL THEN
        DELETE FROM staff WHERE restaurant_id = v_restaurant_id;
        GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'deleted % staff', n;

        DELETE FROM locations WHERE restaurant_id = v_restaurant_id;
        GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'deleted % locations', n;

        DELETE FROM restaurants WHERE id = v_restaurant_id;
        GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'deleted % restaurants', n;
    END IF;

    -- Without this the auth.users row is orphaned. ensureSupabaseAuthUser
    -- reuses an existing user for the same email, so leaving it does not block
    -- re-creating the customer -- it just accumulates.
    IF v_delete_auth_user AND v_auth_user_id IS NOT NULL THEN
        DELETE FROM auth.users WHERE id = v_auth_user_id;
        GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'deleted % auth.users', n;
    END IF;

    RAISE NOTICE 'Cleanup complete for %.', v_email;
END $$;


-- Verify afterwards. Anything returned here was missed.
SELECT 'businesses'       AS table_name, count(*) FROM businesses      WHERE name = 'Steve&Mici'
UNION ALL
SELECT 'portal_accounts',  count(*) FROM portal_accounts WHERE lower(email) = lower('steveandmici@gmail.com')
UNION ALL
SELECT 'billing_schedule', count(*) FROM billing_schedule
UNION ALL
SELECT 'orphan accounts',  count(*) FROM portal_accounts pa
  LEFT JOIN businesses b ON b.id = pa.business_id
  WHERE pa.business_id IS NOT NULL AND b.id IS NULL;
