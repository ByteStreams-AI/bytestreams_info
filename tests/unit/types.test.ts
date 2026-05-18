import { describe, it, expect } from 'vitest';
import type { User, Product } from '$lib/types';

describe('User type', () => {
	it('accepts a valid user object', () => {
		const user: User = {
			email: 'scott@bytestreams.ai',
			sub: 'cf-user-123',
			displayName: 'Scott',
			iat: 1700000000,
			exp: 1700086400
		};
		expect(user.email).toBe('scott@bytestreams.ai');
		expect(user.sub).toBe('cf-user-123');
		expect(user.displayName).toBe('Scott');
		expect(user.iat).toBe(1700000000);
		expect(user.exp).toBe(1700086400);
	});
});

describe('Product type', () => {
	it('accepts a product with all fields', () => {
		const product: Product = {
			name: 'DialTone.Menu',
			description: 'Voice AI for restaurants',
			status: 'Active',
			href: 'https://dialtone.menu'
		};
		expect(product.name).toBe('DialTone.Menu');
		expect(product.status).toBe('Active');
		expect(product.href).toBe('https://dialtone.menu');
	});

	it('accepts a product without optional href', () => {
		const product: Product = {
			name: 'DialTone.Med',
			description: 'AI phone assistant for medical practices',
			status: 'In Development'
		};
		expect(product.href).toBeUndefined();
	});

	it('accepts all valid status values', () => {
		const statuses: Product['status'][] = ['Active', 'In Development', 'Internal', 'Coming Soon'];
		statuses.forEach((status) => {
			const product: Product = { name: 'Test', description: 'Test', status };
			expect(product.status).toBe(status);
		});
	});
});
