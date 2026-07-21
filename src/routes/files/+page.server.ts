import { redirect, error, fail } from '@sveltejs/kit';
import { listFiles, uploadFile, getSignedUrl, deleteFile } from '$lib/server/supabase';
import type { PageServerLoad, Actions } from './$types';

// 25 MB upload limit
const MAX_BYTES = 25 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
	'application/pdf',
	'application/msword',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'application/vnd.ms-excel',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	'application/vnd.ms-powerpoint',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	'text/plain',
	'text/csv',
	'text/markdown',
	'image/png',
	'image/jpeg',
	'image/gif',
	'image/webp',
	'video/mp4',
	'video/quicktime'
]);

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/login');

	const files = await listFiles();
	return { files, user: locals.user };
};

export const actions: Actions = {
	upload: async ({ request, locals }) => {
		if (!locals.user) throw error(401, 'Unauthorized');

		const form = await request.formData();
		const file = form.get('file');

		if (!file || !(file instanceof File) || file.size === 0) {
			return fail(400, { uploadError: 'No file selected.' });
		}
		if (file.size > MAX_BYTES) {
			return fail(400, { uploadError: 'File exceeds the 25 MB limit.' });
		}
		if (!ALLOWED_TYPES.has(file.type)) {
			return fail(400, { uploadError: 'File type not allowed.' });
		}

		// Sanitize filename — strip path traversal, keep extension
		const safeName = file.name.replace(/[^a-zA-Z0-9.\-_() ]/g, '_');
		const path = `${Date.now()}_${safeName}`;

		await uploadFile(path, file);
		return { success: true };
	},

	download: async ({ request, locals }) => {
		if (!locals.user) throw error(401, 'Unauthorized');

		const form = await request.formData();
		const path = form.get('path');
		if (!path || typeof path !== 'string') throw error(400, 'Missing path');

		const url = await getSignedUrl(path);
		return { signedUrl: url };
	},

	delete: async ({ request, locals }) => {
		if (!locals.user) throw error(401, 'Unauthorized');

		const form = await request.formData();
		const path = form.get('path');
		if (!path || typeof path !== 'string') throw error(400, 'Missing path');

		await deleteFile(path);
		return { success: true };
	}
};
