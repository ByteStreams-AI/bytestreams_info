export type Address = { line1: string; city: string; state: string; postalCode: string };

/**
 * Which address is a tenant's LEGAL one (#13 follow-up).
 *
 * A DialTone.Menu tenant has a restaurant address (the `locations` row: geocoding,
 * delivery, tax) and a legal address (the EIN record, TCR brand registration).
 * They are the same for most single-site restaurants and different for a
 * business that trades from one place and is registered at another — an
 * accountant's office, a home, a holding company. When the legal address was
 * never entered separately, the restaurant's is the legal one.
 */
export function legalAddressFor(input: {
	businessAddressSame: boolean;
	business: Partial<Address> | null;
	restaurant: Partial<Address> | null;
}): Address | null {
	const pick = input.businessAddressSame ? input.restaurant : (input.business ?? input.restaurant);
	if (!pick?.line1 || !pick.city || !pick.state || !pick.postalCode) return null;
	return { line1: pick.line1, city: pick.city, state: pick.state, postalCode: pick.postalCode };
}

/** One line for a table cell; null when there is nothing to show. */
export function formatAddressLine(a: Partial<Address> | null | undefined): string | null {
	if (!a) return null;
	const line = [a.line1, a.city, a.state, a.postalCode].filter(Boolean).join(', ');
	return line || null;
}
