import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	resolve: process.env.VITEST
		? {
				conditions: ['browser']
			}
		: undefined,
	test: {
		include: ['tests/**/*.{test,spec}.{js,ts}'],
		environment: 'jsdom',
		setupFiles: ['tests/setup.ts'],
		coverage: {
			provider: 'v8',
			include: ['src/**/*.{ts,svelte}'],
			exclude: [
				'src/app.d.ts',
				'src/app.html',
				'src/lib/types.ts',
				'src/routes/+layout.svelte',
				'src/**/*.test.ts',
				'src/routes/crm/**',
				'src/lib/server/supabase.ts',
				'src/routes/+page.server.ts'
			],
			thresholds: {
				lines: 85,
				functions: 85,
				branches: 85,
				statements: 85
			}
		}
	}
});
