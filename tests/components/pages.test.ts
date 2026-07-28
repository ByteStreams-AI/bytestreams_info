import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import LoginPage from '$lib/../routes/login/+page.svelte';
import DashboardPage from '$lib/../routes/+page.svelte';
import CrmAdminPage from '$lib/../routes/crm-admin/+page.svelte';

describe('Login Page', () => {
	const loginData = { user: null, loginUrl: '/' };

	it('renders sign-in heading', () => {
		render(LoginPage, { props: { data: loginData } });
		expect(screen.getByText('ByteStreams Intranet')).toBeInTheDocument();
	});

	it('renders sign-in subtitle', () => {
		render(LoginPage, { props: { data: loginData } });
		expect(
			screen.getByText('Sign in with your ByteStreams Google Workspace account to continue.')
		).toBeInTheDocument();
	});

	it('renders Google SSO button linking to /', () => {
		render(LoginPage, { props: { data: loginData } });
		const ssoLink = screen.getByText('Sign in with Google');
		expect(ssoLink).toBeInTheDocument();
		expect(ssoLink.closest('a')).toHaveAttribute('href', '/');
	});

	it('renders logo image', () => {
		render(LoginPage, { props: { data: loginData } });
		const logo = screen.getByAltText('ByteStreams');
		expect(logo).toBeInTheDocument();
		expect(logo).toHaveAttribute('src', '/assets/blue-side-slim-logo.png');
	});

	it('renders authorized personnel footer', () => {
		render(LoginPage, { props: { data: loginData } });
		expect(
			screen.getByText('ByteStreams LLC — Authorized personnel only')
		).toBeInTheDocument();
	});
});

describe('Dashboard Page', () => {
	const mockUser = {
		email: 'scott@bytestreams.ai',
		sub: 'cf-user-123',
		displayName: 'Scott',
		iat: 1700000000,
		exp: 1700086400
	};
	const dashboardData = { user: mockUser, canAccessCrmAdmin: false };

	it('renders welcome message with user name', () => {
		render(DashboardPage, { props: { data: dashboardData } });
		expect(screen.getByText(/Welcome back, Scott/)).toBeInTheDocument();
	});

	it('renders dashboard subtitle', () => {
		render(DashboardPage, { props: { data: dashboardData } });
		expect(
			screen.getByText('ByteStreams LLC — Internal Dashboard')
		).toBeInTheDocument();
	});

	it('renders product cards with Documentation linked to Files', () => {
		render(DashboardPage, { props: { data: dashboardData } });
		expect(screen.getByText('DialTone.Menu')).toBeInTheDocument();
		expect(screen.getByText('DialTone.Med')).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Documentation' })).toHaveAttribute('href', '/files');
	});

	it('renders product status badges', () => {
		render(DashboardPage, { props: { data: dashboardData } });
		expect(screen.getByText('Active')).toBeInTheDocument();
		expect(screen.getByText('In Development')).toBeInTheDocument();
		expect(screen.getAllByText('Internal')[0]).toBeInTheDocument();
	});

	it('renders nav with user info', () => {
		render(DashboardPage, { props: { data: dashboardData } });
		expect(screen.getByText('scott@bytestreams.ai')).toBeInTheDocument();
		expect(screen.getByText('Sign Out')).toBeInTheDocument();
	});

	it('renders dashboard when user is provided', () => {
		const { container } = render(DashboardPage, { props: { data: dashboardData } });
		expect(container.querySelector('.dashboard')).toBeInTheDocument();
	});

	it('renders greeting with displayName', () => {
		const customUser = { ...mockUser, displayName: 'Jane' };
		render(DashboardPage, { props: { data: { user: customUser, canAccessCrmAdmin: false } } });
		expect(screen.getByText(/Welcome back, Jane/)).toBeInTheDocument();
	});

	it('renders CRM Admin only when access is granted', () => {
		const { unmount } = render(DashboardPage, {
			props: { data: { user: mockUser, canAccessCrmAdmin: true } }
		});
		expect(screen.getByRole('link', { name: 'CRM Admin' })).toHaveAttribute('href', '/crm-admin');
		unmount();

		render(DashboardPage, { props: { data: dashboardData } });
		expect(screen.queryByText('CRM Admin')).not.toBeInTheDocument();
	});
});

describe('CRM Admin Page', () => {
	const user = {
		email: 'scotton@bytestreams.ai',
		sub: 'cf-admin',
		displayName: 'Scotton',
		iat: 1700000000,
		exp: 1700086400
	};
	const changes = [
		{
			change_id: '11111111-1111-1111-1111-111111111111',
			lead_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			operation: 'INSERT' as const,
			old_record: null,
			new_record: {
				business_name: 'ChopnBlok',
				city: 'Houston',
				state: 'TX',
				phone: '(832) 555-0100'
			},
			changed_at: '2026-07-26T15:00:00.000Z',
			changed_by: null,
			changed_by_email: 'scotton@bytestreams.ai',
			transaction_id: 101
		},
		{
			change_id: '22222222-2222-2222-2222-222222222222',
			lead_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
			operation: 'UPDATE' as const,
			old_record: { business_name: 'Prior Cafe', city: 'Austin', phone: null },
			new_record: { business_name: 'Updated Cafe', city: 'Austin', phone: null },
			changed_at: '2026-07-26T15:05:00.000Z',
			changed_by: null,
			changed_by_email: null,
			transaction_id: 102
		}
	];

	it('renders audit details, attribution, and operation-specific restore controls', () => {
		render(CrmAdminPage, { props: { data: { user, changes }, form: null } });

		expect(screen.getByRole('heading', { name: 'Lead Change Log' })).toBeInTheDocument();
		expect(screen.getByText('ChopnBlok')).toBeInTheDocument();
		expect(screen.getAllByText('scotton@bytestreams.ai')).toHaveLength(2);
		expect(screen.getByText('Service role')).toBeInTheDocument();
		expect(screen.getByText('No prior state')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument();
	});

	it('searches snapshots and filters by operation', async () => {
		render(CrmAdminPage, { props: { data: { user, changes }, form: null } });

		await fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'ChopnBlok' } });
		expect(screen.getByText('ChopnBlok')).toBeInTheDocument();
		expect(screen.queryByText('Updated Cafe')).not.toBeInTheDocument();

		await fireEvent.input(screen.getByRole('searchbox'), { target: { value: '' } });
		await fireEvent.change(screen.getByRole('combobox'), { target: { value: 'UPDATE' } });
		expect(screen.getByText('Updated Cafe')).toBeInTheDocument();
		expect(screen.queryByText('ChopnBlok')).not.toBeInTheDocument();
	});

	it('cancels restore when confirmation is declined and renders action feedback', async () => {
		vi.spyOn(window, 'confirm').mockReturnValue(false);
		render(CrmAdminPage, {
			props: {
				data: { user, changes: [changes[1]] },
				form: { success: false, message: 'Unable to restore this event.' }
			}
		});

		const form = screen.getByRole('button', { name: 'Restore' }).closest('form');
		expect(form).not.toBeNull();
		const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
		form!.dispatchEvent(submitEvent);

		expect(window.confirm).toHaveBeenCalledWith(
			'Restore Updated Cafe to its state before this update?'
		);
		expect(submitEvent.defaultPrevented).toBe(true);
		expect(screen.getByRole('status')).toHaveTextContent('Unable to restore this event.');
	});

	it('allows a confirmed restore and renders success and empty states', () => {
		vi.spyOn(window, 'confirm').mockReturnValue(true);
		const { unmount } = render(CrmAdminPage, {
			props: {
				data: { user, changes: [changes[1]] },
				form: { success: true, message: 'The prior lead state was restored.' }
			}
		});

		const form = screen.getByRole('button', { name: 'Restore' }).closest('form');
		const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
		form!.dispatchEvent(submitEvent);
		expect(submitEvent.defaultPrevented).toBe(false);
		expect(screen.getByRole('status')).toHaveTextContent('The prior lead state was restored.');
		unmount();

		render(CrmAdminPage, { props: { data: { user, changes: [] }, form: null } });
		expect(screen.getByText('No audit events match these filters.')).toBeInTheDocument();
		expect(screen.getByText('0 of 0 events')).toBeInTheDocument();
	});
});
