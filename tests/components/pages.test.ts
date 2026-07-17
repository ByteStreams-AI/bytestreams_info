import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import LoginPage from '$lib/../routes/login/+page.svelte';
import DashboardPage from '$lib/../routes/+page.svelte';

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

	it('renders welcome message with user name', () => {
		render(DashboardPage, { props: { data: { user: mockUser } } });
		expect(screen.getByText(/Welcome back, Scott/)).toBeInTheDocument();
	});

	it('renders dashboard subtitle', () => {
		render(DashboardPage, { props: { data: { user: mockUser } } });
		expect(
			screen.getByText('ByteStreams LLC — Internal Dashboard')
		).toBeInTheDocument();
	});

	it('renders all three product cards', () => {
		render(DashboardPage, { props: { data: { user: mockUser } } });
		expect(screen.getByText('DialTone.Menu')).toBeInTheDocument();
		expect(screen.getByText('DialTone.Med')).toBeInTheDocument();
		expect(screen.getByText('Documentation')).toBeInTheDocument();
	});

	it('renders product status badges', () => {
		render(DashboardPage, { props: { data: { user: mockUser } } });
		expect(screen.getByText('Active')).toBeInTheDocument();
		expect(screen.getByText('In Development')).toBeInTheDocument();
		expect(screen.getAllByText('Internal')[0]).toBeInTheDocument();
	});

	it('renders nav with user info', () => {
		render(DashboardPage, { props: { data: { user: mockUser } } });
		expect(screen.getByText('scott@bytestreams.ai')).toBeInTheDocument();
		expect(screen.getByText('Sign Out')).toBeInTheDocument();
	});

	it('does not render when user is null', () => {
		const { container } = render(DashboardPage, { props: { data: { user: null } } });
		expect(container.querySelector('.dashboard')).not.toBeInTheDocument();
	});

	it('renders greeting with displayName', () => {
		const customUser = { ...mockUser, displayName: 'Jane' };
		render(DashboardPage, { props: { data: { user: customUser } } });
		expect(screen.getByText(/Welcome back, Jane/)).toBeInTheDocument();
	});
});
