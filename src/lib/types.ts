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
	/** Display name. */
	name: string;
	/** Short description. */
	description: string;
	/** Status badge label. */
	status: 'Active' | 'In Development' | 'Internal' | 'Coming Soon';
	/** Optional external URL. */
	href?: string;
}
