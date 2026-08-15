/// <reference types="@sveltejs/kit" />
/// <reference types="@cloudflare/workers-types" />

declare global {
	namespace App {
		interface Locals {
			user: import('$lib/types').User | null;
		}
		interface PageData {
			user: import('$lib/types').User | null;
		}
		// interface Error {}
		interface Platform {
			env: {
				AI: Ai;
				CALLER_NAME: string;
				CF_ACCESS_AUD: string;
				CF_ACCESS_TEAM_DOMAIN: string;
				SUPABASE_URL: string;
				SUPABASE_SERVICE_ROLE_KEY: string;
				STRIPE_SECRET_KEY: string;
				STRIPE_TAX_CODE: string;
				ENABLE_TAX_ASSESSMENT: string;
				GOOGLE_OAUTH_CLIENT_ID: string;
				GOOGLE_OAUTH_CLIENT_SECRET: string;
				GOOGLE_OAUTH_REDIRECT_URI: string;
			};
		}
	}
}

export {};
