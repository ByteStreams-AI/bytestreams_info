import { redirect } from '@sveltejs/kit';
import { canAccessPortalAdmin } from '$lib/server/authorization';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/login');
	if (!canAccessPortalAdmin(locals.user)) throw redirect(302, '/');
	return { user: locals.user };
};
