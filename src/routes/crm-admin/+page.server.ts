import { error, fail, redirect } from '@sveltejs/kit';
import { canAccessCrmAdmin } from '$lib/server/authorization';
import { fetchLeadChanges, restoreLeadChange } from '$lib/server/supabase';
import type { Actions, PageServerLoad } from './$types';

function requireCrmAdmin(locals: App.Locals): void {
	if (!locals.user) throw redirect(302, '/login');
	if (!canAccessCrmAdmin(locals.user)) throw error(403, 'CRM Admin access is restricted.');
}

export const load: PageServerLoad = async ({ locals }) => {
	requireCrmAdmin(locals);
	return {
		user: locals.user!,
		changes: await fetchLeadChanges()
	};
};

export const actions: Actions = {
	restore: async ({ request, locals }) => {
		requireCrmAdmin(locals);
		const form = await request.formData();
		const changeId = form.get('change_id');
		if (typeof changeId !== 'string' || !/^[0-9a-f-]{36}$/i.test(changeId)) {
			return fail(400, { message: 'A valid audit event ID is required.' });
		}

		try {
			await restoreLeadChange(changeId, locals.user!.email);
			return { success: true, message: 'The prior lead state was restored.' };
		} catch (restoreError) {
			return fail(409, {
				message: restoreError instanceof Error ? restoreError.message : 'Unable to restore this event.'
			});
		}
	}
};