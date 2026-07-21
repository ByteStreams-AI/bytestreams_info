/**
 * Authenticated user profile extracted from Cloudflare Access JWT.
 */
export interface User {
	/** Primary email from Google Workspace. */
	email: string;
	/** Cloudflare Access user ID (stable per user). */
	sub: string;
	/** Display name derived from email prefix. */
	displayName: string;
	/** JWT issued-at timestamp (epoch seconds). */
	iat: number;
	/** JWT expiration timestamp (epoch seconds). */
	exp: number;
}

/**
 * Product card data for the intranet dashboard.
 */
export interface Product {
	name: string;
	description: string;
	status: 'Active' | 'In Development' | 'Internal' | 'Coming Soon';
	href?: string;
}

/**
 * A CRM lead row from Supabase (read-only scraper fields + editable sales fields).
 */
export interface Lead {
	lead_id: string;
	business_name: string;
	phone: string | null;
	address: string | null;
	city: string | null;
	status: string;
	business_type: string | null;
	offers_delivery: boolean | null;
	offers_pickup: boolean | null;
	uses_doordash_mktg: boolean | null;
	uses_chownow: boolean | null;
	price_range: string | null;
	yelp_rating: number | null;
	yelp_review_count: number | null;
	// Sales-editable fields
	contact_name: string | null;
	email: string | null;
	website_url: string | null;
	notes: string | null;
	num_locations: number | null;
	michelin_rating: string | null;
	has_website: boolean | null;
	has_app: boolean | null;
	uses_pos: string | null;
	uses_kds: boolean | null;
	uses_sms: boolean | null;
	created_at: string;
}

/**
 * A calendar event row from Supabase.
 */
export interface CalendarEvent {
	id: string;
	title: string;
	description: string | null;
	start_at: string; // ISO 8601 UTC
	end_at: string;   // ISO 8601 UTC
	all_day: boolean;
	color: string | null;
	created_by: string;
	created_at: string;
	updated_at: string;
}

