import { env } from '$env/dynamic/private';
import { canAccessPortalAdmin } from '$lib/server/authorization';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const AI_ADMIN = 'https://bytestreams.ai/api/admin';

function adminHeaders(): Record<string, string> {
	return {
		Authorization: `Bearer ${env.ADMIN_SECRET}`,
		'Content-Type': 'application/json',
	};
}

function guard(locals: App.Locals): void {
	if (!locals.user || !canAccessPortalAdmin(locals.user)) throw redirect(302, '/login');
}

export const GET: RequestHandler = async ({ params, locals }) => {
	guard(locals);
	const res = await fetch(`${AI_ADMIN}/${params.path}`, { headers: adminHeaders() });
	const body = await res.text();
	return new Response(body, { status: res.status, headers: { 'Content-Type': 'application/json' } });
};

export const POST: RequestHandler = async ({ params, locals, request }) => {
	guard(locals);
	const body = await request.text();
	const res = await fetch(`${AI_ADMIN}/${params.path}`, {
		method: 'POST',
		headers: adminHeaders(),
		body,
	});
	const resBody = await res.text();
	return new Response(resBody, { status: res.status, headers: { 'Content-Type': 'application/json' } });
};
