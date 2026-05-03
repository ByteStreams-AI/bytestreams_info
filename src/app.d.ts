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
		// interface Platform {}
	}
}

export {};
