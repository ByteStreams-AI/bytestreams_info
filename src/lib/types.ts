/**
 * Authenticated user profile extracted from Cloudflare Access JWT.
 */
export interface User {
	/** Primary email from Google Workspace (nameID). */
	email: string;
	/** First name from SAML attribute mapping. */
	firstName: string;
	/** Last name from SAML attribute mapping. */
	lastName: string;
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
