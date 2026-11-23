/**
 * CRM products and the business types each one allows.
 * Keep in sync with the leads CHECK constraints in developer/migrations/022_med_business_types.sql.
 */

export const PRODUCTS = ['dialtone_menu', 'dialtone_med'] as const;
export type Product = (typeof PRODUCTS)[number];

export const PRODUCT_LABELS: Record<Product, string> = {
	dialtone_menu: 'DialTone.Menu',
	dialtone_med: 'DialTone.Med'
};

export const MENU_BUSINESS_TYPES = [
	'food_truck',
	'single_location',
	'multi_configuration',
	'multi_location',
	'enterprise'
] as const;

export const MED_BUSINESS_TYPES = ['general_practice', 'specialty_practice', 'specialty_pharmacy'] as const;

export const BUSINESS_TYPE_LABELS: Record<string, string> = {
	food_truck: 'Food Truck',
	single_location: 'Single Location',
	multi_configuration: 'Multi-Configuration',
	multi_location: 'Multi-Location',
	enterprise: 'Enterprise',
	general_practice: 'General Practice',
	specialty_practice: 'Specialty Practice',
	specialty_pharmacy: 'Specialty Pharmacy'
};

export const NPI_ENTITY_TYPES = ['organization', 'individual'] as const;

export function isProduct(value: unknown): value is Product {
	return typeof value === 'string' && (PRODUCTS as readonly string[]).includes(value);
}

/** Leads created before products existed have no product and are Menu leads. */
export function leadProduct(lead: { product?: string | null }): Product {
	return lead.product === 'dialtone_med' ? 'dialtone_med' : 'dialtone_menu';
}

export function productLabel(product: string | null | undefined): string {
	return isProduct(product) ? PRODUCT_LABELS[product] : PRODUCT_LABELS.dialtone_menu;
}

export function businessTypesFor(product: Product): readonly string[] {
	return product === 'dialtone_med' ? MED_BUSINESS_TYPES : MENU_BUSINESS_TYPES;
}

export function businessTypeLabel(value: string | null): string {
	if (!value) return '—';
	return BUSINESS_TYPE_LABELS[value] ?? value.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Validates a 10-digit NPI with the CMS check digit: Luhn over the first nine
 * digits with the 80840 prefix, which adds a constant 24 to the sum.
 */
export function isValidNpi(npi: string): boolean {
	if (!/^[0-9]{10}$/.test(npi)) return false;
	let sum = 24;
	for (let i = 0; i < 9; i++) {
		let digit = Number(npi[8 - i]);
		if (i % 2 === 0) {
			digit *= 2;
			if (digit > 9) digit -= 9;
		}
		sum += digit;
	}
	return (10 - (sum % 10)) % 10 === Number(npi[9]);
}
