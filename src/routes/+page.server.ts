import { redirect } from '@sveltejs/kit';
import { canAccessCrmAdmin } from '$lib/server/authorization';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}
	return {
		user: locals.user,
		canAccessCrmAdmin: canAccessCrmAdmin(locals.user)
	};
};
