import { describe, it, expect } from 'vitest';
import type { User, Product } from '$lib/types';

describe('User type', () => {
	it('accepts a valid user object', () => {
		const user: User = {
			email: 'scott@bytestreams.ai',
			firstName: 'Scott',
			lastName: 'Thornton'
		};
		expect(user.email).toBe('scott@bytestreams.ai');
		expect(user.firstName).toBe('Scott');
		expect(user.lastName).toBe('Thornton');
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
