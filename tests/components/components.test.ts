import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Nav from '$lib/components/Nav.svelte';
import ProductCard from '$lib/components/ProductCard.svelte';

const mockUser = {
	email: 'scott@bytestreams.ai',
	sub: 'cf-user-123',
	displayName: 'Scott',
	iat: 1700000000,
	exp: 1700086400
};

describe('Nav', () => {
	it('renders user display name', () => {
		render(Nav, { props: { user: mockUser } });
		expect(screen.getByText(/Scott/)).toBeInTheDocument();
	});

	it('renders user email', () => {
		render(Nav, { props: { user: mockUser } });
		expect(screen.getByText('scott@bytestreams.ai')).toBeInTheDocument();
	});

	it('renders Sign Out link pointing to /auth/logout', () => {
		render(Nav, { props: { user: mockUser } });
		const signOut = screen.getByText('Sign Out');
		expect(signOut).toBeInTheDocument();
		expect(signOut.closest('a')).toHaveAttribute('href', '/auth/logout');
	});

	it('renders the Intranet label', () => {
		render(Nav, { props: { user: mockUser } });
		expect(screen.getByText('Intranet')).toBeInTheDocument();
	});

	it('renders logo image', () => {
		render(Nav, { props: { user: mockUser } });
		const logo = screen.getByAltText('ByteStreams');
		expect(logo).toBeInTheDocument();
		expect(logo).toHaveAttribute('src', '/assets/blue-side-slim-logo.png');
	});

	it('has navigation landmark', () => {
		render(Nav, { props: { user: mockUser } });
		const navs = screen.getAllByRole('navigation');
		expect(navs.length).toBeGreaterThanOrEqual(1);
	});
});

describe('ProductCard', () => {
	it('renders product name and description', () => {
		render(ProductCard, {
			props: {
				product: {
					name: 'DialTone.Menu',
					description: 'Voice AI for restaurants',
					status: 'Active' as const
				}
			}
		});
		expect(screen.getByText('DialTone.Menu')).toBeInTheDocument();
		expect(screen.getByText('Voice AI for restaurants')).toBeInTheDocument();
	});

	it('renders status badge', () => {
		render(ProductCard, {
			props: {
				product: {
					name: 'DialTone.Med',
					description: 'AI phone assistant',
					status: 'In Development' as const
				}
			}
		});
		expect(screen.getByText('In Development')).toBeInTheDocument();
	});

	it('renders link when href is provided', () => {
		render(ProductCard, {
			props: {
				product: {
					name: 'DialTone.Menu',
					description: 'Voice AI',
					status: 'Active' as const,
					href: 'https://dialtone.menu'
				}
			}
		});
		const link = screen.getByRole('link');
		expect(link).toHaveAttribute('href', 'https://dialtone.menu');
	});

	it('renders without link when href is not provided', () => {
		render(ProductCard, {
			props: {
				product: {
					name: 'Docs',
					description: 'Internal documentation',
					status: 'Internal' as const
				}
			}
		});
		expect(screen.queryByRole('link')).not.toBeInTheDocument();
	});

	it('renders all status badge variants', () => {
		const statuses = ['Active', 'In Development', 'Internal', 'Coming Soon'] as const;
		for (const status of statuses) {
			const { unmount } = render(ProductCard, {
				props: {
					product: { name: 'Test', description: 'Test', status }
				}
			});
			expect(screen.getByText(status)).toBeInTheDocument();
			unmount();
		}
	});
});
