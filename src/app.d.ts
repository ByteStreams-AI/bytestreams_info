/// <reference types="@sveltejs/kit" />

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
				CF_ACCESS_AUD: string;
				CF_ACCESS_TEAM_DOMAIN: string;
			};
		}
	}
}

export {};
