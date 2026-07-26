import type { User } from '$lib/types';

const CRM_ADMIN_EMAIL = 'scotton@bytestreams.ai';

export function canAccessCrmAdmin(user: User | null): boolean {
	return user?.email.trim().toLowerCase() === CRM_ADMIN_EMAIL;
}