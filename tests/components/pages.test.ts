import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import LoginPage from '$lib/../routes/login/+page.svelte';
import DashboardPage from '$lib/../routes/+page.svelte';
import CrmPage from '$lib/../routes/crm/+page.svelte';
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
	const dashboardData = { user: mockUser, canAccessCrmAdmin: false, canAccessPortalAdmin: false };

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
		render(DashboardPage, { props: { data: { user: customUser, canAccessCrmAdmin: false, canAccessPortalAdmin: false } } });
		expect(screen.getByText(/Welcome back, Jane/)).toBeInTheDocument();
	});

	it('renders CRM Admin only when access is granted', () => {
		const { unmount } = render(DashboardPage, {
			props: { data: { user: mockUser, canAccessCrmAdmin: true, canAccessPortalAdmin: false } }
		});
		expect(screen.getByRole('link', { name: 'CRM Admin' })).toHaveAttribute('href', '/crm-admin');
		unmount();

		render(DashboardPage, { props: { data: dashboardData } });
		expect(screen.queryByText('CRM Admin')).not.toBeInTheDocument();
	});
});

describe('CRM Page', () => {
	const user = {
		email: 'sales@bytestreams.ai',
		sub: 'cf-sales',
		displayName: 'Sales',
		iat: 1700000000,
		exp: 1700086400
	};
	const lead = {
		lead_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
		business_name: 'Dialable Cafe',
		phone: 'tel:+17135550101',
		contact_phone: 'tel:+17135550102',
		address: null,
		city: 'Houston',
		status: 'new',
		business_type: null,
		offers_delivery: null,
		offers_pickup: null,
		marketplace_providers: null,
		first_party_ordering: null,
		price_range: null,
		yelp_rating: null,
		yelp_review_count: null,
		state: 'TX',
		contact_name: null,
		email: null,
		website_url: null,
		notes: null,
		call_script: null,
		num_locations: null,
		michelin_rating: null,
		has_website: null,
		has_app: null,
		uses_pos: null,
		uses_kds: null,
		uses_sms: null,
		created_at: '2026-07-28T00:00:00.000Z'
	};

	it('renders a dialable phone link in the leads table', () => {
		render(CrmPage, { props: { data: { user, leads: [lead], researchFindings: [] } } });

		expect(screen.getByRole('link', { name: 'tel:+17135550101' })).toHaveAttribute(
			'href',
			'tel:+17135550101'
		);
		expect(screen.getByRole('link', { name: 'tel:+17135550102' })).toHaveAttribute(
			'href',
			'tel:+17135550102'
		);
	});

	it('resets all restaurant table filters', async () => {
		const secondLead = {
			...lead,
			lead_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
			business_name: 'Austin Smokehouse',
			city: 'Austin',
			status: 'researched',
			offers_delivery: true,
			offers_pickup: true
		};
		render(CrmPage, {
			props: { data: { user, leads: [lead, secondLead], researchFindings: [] } }
		});

		const resetButton = screen.getByRole('button', { name: 'Reset' });
		expect(resetButton).toBeDisabled();

		await fireEvent.input(screen.getByLabelText('Search by business name'), {
			target: { value: 'Austin' }
		});
		await fireEvent.change(screen.getByLabelText('Filter by city'), { target: { value: 'austin' } });
		await fireEvent.change(screen.getByLabelText('Filter by status'), { target: { value: 'researched' } });
		await fireEvent.change(screen.getByLabelText('Filter by delivery'), { target: { value: 'yes' } });
		await fireEvent.change(screen.getByLabelText('Filter by pickup'), { target: { value: 'yes' } });

		expect(screen.getByText('Austin Smokehouse')).toBeInTheDocument();
		expect(screen.queryByText('Dialable Cafe')).not.toBeInTheDocument();
		expect(resetButton).toBeEnabled();

		await fireEvent.click(resetButton);

		expect(screen.getByLabelText('Search by business name')).toHaveValue('');
		expect(screen.getByLabelText('Filter by city')).toHaveValue('');
		expect(screen.getByLabelText('Filter by status')).toHaveValue('');
		expect(screen.getByLabelText('Filter by delivery')).toHaveValue('');
		expect(screen.getByLabelText('Filter by pickup')).toHaveValue('');
		expect(screen.getByText('Dialable Cafe')).toBeInTheDocument();
		expect(screen.getByText('Austin Smokehouse')).toBeInTheDocument();
		expect(resetButton).toBeDisabled();
	});

	it('edits contact phone between contact name and email', async () => {
		render(CrmPage, { props: { data: { user, leads: [lead], researchFindings: [] } } });
		await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

		const contactName = screen.getByLabelText('Contact name');
		const contactPhone = screen.getByLabelText('Contact phone');
		const email = screen.getByLabelText('Email');
		expect(contactPhone).toHaveAttribute('type', 'tel');
		expect(contactPhone).toHaveValue('tel:+17135550102');
		expect(screen.getByRole('link', { name: 'Call contact' })).toHaveAttribute(
			'href',
			'tel:+17135550102'
		);
		expect(contactName.compareDocumentPosition(contactPhone) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(contactPhone.compareDocumentPosition(email) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});

	it('keeps the detail pane open until the explicit close button is used', async () => {
		const confirmMock = vi.spyOn(window, 'confirm');
		render(CrmPage, { props: { data: { user, leads: [lead], researchFindings: [] } } });
		await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

		const panel = screen.getByRole('complementary', { name: 'Edit lead' });
		expect(panel).toBeInTheDocument();
		const closeButton = within(panel).getByText('Close', { selector: 'button' });
		expect(closeButton).toHaveClass('btn-panel-close');

		await fireEvent.click(closeButton);
		expect(screen.queryByRole('complementary', { name: 'Edit lead' })).not.toBeInTheDocument();
		expect(confirmMock).not.toHaveBeenCalled();
		confirmMock.mockRestore();
	});

	it('keeps unsaved edits when discard confirmation is cancelled', async () => {
		const confirmMock = vi.spyOn(window, 'confirm').mockReturnValue(false);
		try {
			render(CrmPage, { props: { data: { user, leads: [lead], researchFindings: [] } } });
			await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
			await fireEvent.input(screen.getByLabelText('Contact name'), { target: { value: 'Diana' } });
			await fireEvent.click(within(screen.getByRole('complementary', { name: 'Edit lead' })).getByText('Close', { selector: 'button' }));

			expect(confirmMock).toHaveBeenCalledWith('Discard unsaved changes?');
			expect(screen.getByRole('complementary', { name: 'Edit lead' })).toBeInTheDocument();
			expect(screen.getByLabelText('Contact name')).toHaveValue('Diana');
		} finally {
			confirmMock.mockRestore();
		}
	});

	it('discards unsaved edits when discard confirmation is accepted', async () => {
		const confirmMock = vi.spyOn(window, 'confirm').mockReturnValue(true);
		try {
			render(CrmPage, { props: { data: { user, leads: [lead], researchFindings: [] } } });
			await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
			await fireEvent.input(screen.getByLabelText('Contact name'), { target: { value: 'Diana' } });
			await fireEvent.click(within(screen.getByRole('complementary', { name: 'Edit lead' })).getByText('Close', { selector: 'button' }));

			expect(confirmMock).toHaveBeenCalledWith('Discard unsaved changes?');
			expect(screen.queryByRole('complementary', { name: 'Edit lead' })).not.toBeInTheDocument();
		} finally {
			confirmMock.mockRestore();
		}
	});

	it('keeps the detail pane open after a successful save', async () => {
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
			JSON.stringify({ type: 'success', status: 200 }),
			{ status: 200 }
		));
		try {
			render(CrmPage, { props: { data: { user, leads: [lead], researchFindings: [] } } });
			await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
			await fireEvent.input(screen.getByLabelText('Contact name'), { target: { value: 'Diana' } });
			await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

			await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument());
			expect(screen.getByRole('complementary', { name: 'Edit lead' })).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
		} finally {
			fetchMock.mockRestore();
		}
	});

	it('makes a legacy formatted phone dialable before migration', () => {
		render(CrmPage, {
			props: {
				data: { user, leads: [{ ...lead, phone: '(713) 555-0101' }], researchFindings: [] }
			}
		});

		expect(screen.getByRole('link', { name: '(713) 555-0101' })).toHaveAttribute(
			'href',
			'tel:+17135550101'
		);
	});

	it('renders malformed legacy phone text without crashing', () => {
		render(CrmPage, {
			props: {
				data: { user, leads: [{ ...lead, phone: 'unknown' }], researchFindings: [] }
			}
		});

		expect(screen.getByText('unknown')).toBeInTheDocument();
		expect(screen.queryByRole('link', { name: 'unknown' })).not.toBeInTheDocument();
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
