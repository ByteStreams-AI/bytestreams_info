export type StripeTaxAddress = {
	line1: string;
	city: string;
	state: string;
	postalCode: string;
	country: string;
};

export type StripeTaxAssessment = {
	calculationId: string;
	subtotalCents: number;
	taxCents: number;
	totalCents: number;
	taxBreakdown: unknown[];
};

type StripeTaxCalculationResponse = {
	id?: string;
	amount_total?: number;
	tax_amount_exclusive?: number;
	tax_breakdown?: unknown[];
	error?: { message?: string };
};

export async function assessStripeTax({
	secretKey,
	amountCents,
	address,
	reference,
	taxCode,
	fetcher = fetch
}: {
	secretKey: string;
	amountCents: number;
	address: StripeTaxAddress;
	reference: string;
	taxCode: string;
	fetcher?: typeof fetch;
}): Promise<StripeTaxAssessment> {
	if (!secretKey.trim()) throw new Error('STRIPE_SECRET_KEY is not configured');
	if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error('Taxable amount must be a positive integer');
	if (!address.line1 || !address.city || !address.state || !address.postalCode || !address.country) {
		throw new Error('A complete verified address is required for Stripe Tax assessment');
	}

	const form = new URLSearchParams({
		currency: 'usd',
		'customer_details[address][line1]': address.line1,
		'customer_details[address][city]': address.city,
		'customer_details[address][state]': address.state,
		'customer_details[address][postal_code]': address.postalCode,
		'customer_details[address][country]': address.country,
		'customer_details[address_source]': 'billing',
		'line_items[0][amount]': String(amountCents),
		'line_items[0][reference]': reference,
		'line_items[0][tax_behavior]': 'exclusive',
		'line_items[0][tax_code]': taxCode,
		'expand[0]': 'line_items.data.tax_breakdown'
	});

	const response = await fetcher('https://api.stripe.com/v1/tax/calculations', {
		method: 'POST',
		headers: {
			authorization: `Basic ${btoa(`${secretKey}:`)}`,
			'content-type': 'application/x-www-form-urlencoded'
		},
		body: form
	});
	const result = await response.json() as StripeTaxCalculationResponse;

	if (!response.ok) {
		throw new Error(result.error?.message ?? `Stripe Tax assessment failed (${response.status})`);
	}
	if (!result.id || !Number.isInteger(result.amount_total) || !Number.isInteger(result.tax_amount_exclusive)) {
		throw new Error('Stripe Tax returned an incomplete calculation');
	}

	return {
		calculationId: result.id,
		subtotalCents: amountCents,
		taxCents: result.tax_amount_exclusive!,
		totalCents: result.amount_total!,
		taxBreakdown: result.tax_breakdown ?? []
	};
}