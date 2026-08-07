import type { User } from '$lib/types';

const CRM_ADMIN_EMAIL = 'scotton@bytestreams.ai';
const PORTAL_ADMIN_EMAIL = 'scotton@bytestreams.ai';

export function canAccessCrmAdmin(user: User | null): boolean {
	return user?.email.trim().toLowerCase() === CRM_ADMIN_EMAIL;
}

export function canAccessPortalAdmin(user: User | null): boolean {
	return user?.email.trim().toLowerCase() === PORTAL_ADMIN_EMAIL;
}