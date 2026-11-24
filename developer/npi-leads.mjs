/**
 * Pure helpers for importing DialTone.Med leads from the NPPES NPI Registry.
 * The CLI is developer/import-npi-leads.mjs; tests are tests/unit/npi-leads.test.ts.
 *
 * API: https://npiregistry.cms.hhs.gov/api-page (free, no key, 200 results per call,
 * `skip` up to 1000 — so at most 1,200 results per query; narrow by city or ZIP beyond that).
 */

export const NPI_API = 'https://npiregistry.cms.hhs.gov/api/';
export const PAGE_SIZE = 200;
export const MAX_SKIP = 1000;

/**
 * Registry searches per business type, and the PRIMARY taxonomies we accept.
 * The registry matches a search against any of an organization's taxonomies, so an
 * emergency group that lists one nurse practitioner comes back for "Nurse Practitioner";
 * filtering on the primary taxonomy keeps only practices whose main business it is.
 */
export const NPI_TYPES = {
	general_practice: {
		searches: ['Primary Care', 'Family Medicine', 'General Practice', 'Internal Medicine', 'Nurse Practitioner'],
		accept: /^(Clinic\/Center, Primary Care|Family Medicine(, Adult Medicine)?|General Practice|Internal Medicine|Nurse Practitioner(, (Family|Primary Care|Adult Health))?)$/i
	},
	specialty_pharmacy: {
		searches: ['Specialty Pharmacy'],
		accept: /Pharmacy/i
	},
	specialty_practice: {
		// Too broad to enumerate: the caller names the specialty with --taxonomy.
		searches: [],
		accept: null
	}
};

const UPPER_TOKENS = new Set([
	'LLC', 'PLLC', 'PA', 'P.A.', 'PC', 'P.C.', 'INC', 'INC.', 'LLP', 'LTD', 'MD', 'M.D.', 'DO', 'DDS', 'DMD',
	'APRN', 'NP', 'FNP', 'II', 'III', 'IV', 'USA', 'US', 'FL', 'TX', 'GA', 'TN', 'AL', 'MS', 'SC', 'NC', 'AR', 'KY', 'VA', 'NY', 'NJ', 'PC', 'ENT', 'MSO', 'RX', 'DPC'
]);
const LOWER_TOKENS = new Set(['of', 'and', 'the', 'at', 'for', 'in', 'on', 'to']);

/** Groups that staff hospitals rather than run a practice with a front desk. */
const NON_PRACTICE_NAME = /hospitalist|inpatient|hospital physicians/i;

/** Legal-entity suffixes ignored when comparing names for duplicates. */
const ENTITY_SUFFIX = /\b(llc|pllc|pa|p a|inc|pc|p c|llp|ltd|corp|co|md|m d)\b/g;

/** Registry names are upper case; make them readable without mangling suffixes like LLC. */
export function displayName(value) {
	if (!value) return '';
	return value
		.trim()
		.replace(/,(?=\S)/g, ', ')
		.replace(/\s+/g, ' ')
		.split(' ')
		.map((word, index) => {
			const bare = word.replace(/[,;]+$/, '');
			const trailing = word.slice(bare.length);
			if (UPPER_TOKENS.has(bare.toUpperCase())) return bare.toUpperCase() + trailing;
			if (/^ph\.?d\.?$/i.test(bare)) return 'PhD' + trailing;
			if (/\d/.test(bare) && !/^\d+(st|nd|rd|th)$/i.test(bare)) return bare.toUpperCase() + trailing;
			const lower = bare.toLowerCase();
			if (index > 0 && LOWER_TOKENS.has(lower)) return lower + trailing;
			return lower.replace(/(^|[-/&('.])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase()) + trailing;
		})
		.join(' ');
}

/** A registry phone ("904-474-9766") as the CRM's tel URI, or null. */
export function telUri(phone) {
	const digits = (phone ?? '').replace(/\D/g, '');
	if (digits.length === 10) return `tel:+1${digits}`;
	if (digits.length === 11 && digits.startsWith('1')) return `tel:+${digits}`;
	return null;
}

export function primaryTaxonomy(result) {
	const taxonomies = result.taxonomies ?? [];
	return (taxonomies.find((taxonomy) => taxonomy.primary) ?? taxonomies[0])?.desc ?? null;
}

export function locationAddress(result) {
	return (result.addresses ?? []).find((address) => address.address_purpose === 'LOCATION') ?? null;
}

/** True when the result's practice location (not its mailing address) is in the requested area. */
export function inArea(result, { state, city, postalCode }) {
	const location = locationAddress(result);
	if (!location) return false;
	if (state && location.state?.toUpperCase() !== state.toUpperCase()) return false;
	if (city && location.city?.toUpperCase() !== city.toUpperCase()) return false;
	if (postalCode && !location.postal_code?.startsWith(postalCode)) return false;
	return true;
}

/** Whether a registry organization belongs in this import. */
export function accepts(result, businessType, taxonomy) {
	if (result.enumeration_type !== 'NPI-2') return false;
	if (result.basic?.status && result.basic.status !== 'A') return false;
	if (NON_PRACTICE_NAME.test(result.basic?.organization_name ?? '')) return false;
	const primary = primaryTaxonomy(result);
	if (!primary) return false;
	if (taxonomy) return primary.toLowerCase().includes(taxonomy.toLowerCase());
	return NPI_TYPES[businessType].accept.test(primary);
}

/**
 * The "doing business as" name patients know: a registry DBA entry, or the part after
 * "DBA" when the legal name carries it ("CARES CONSULTING LLC DBA PINNACLE NP").
 */
export function dbaName(result) {
	const recorded = (result.other_names ?? []).find((name) => String(name.code) === '3' && name.organization_name);
	if (recorded) return recorded.organization_name;
	const inline = (result.basic?.organization_name ?? '').match(/[\s,]+D\/?B\/?A:?\s+(.+)$/i);
	return inline?.[1]?.trim() || null;
}

/** Name + city key for duplicate checks: case, punctuation and entity suffixes ignored. */
export function identityKey(businessName, city) {
	const name = (businessName ?? '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.replace(ENTITY_SUFFIX, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	return `${name}\0${(city ?? '').toLowerCase().trim()}`;
}

/** Maps a registry organization to a leads row. */
export function leadRow(result, businessType) {
	const basic = result.basic ?? {};
	const location = locationAddress(result);
	const legal = displayName((basic.organization_name ?? '').replace(/[\s,]+D\/?B\/?A:?\s+.+$/i, ''));
	const dba = dbaName(result);
	const businessName = dba ? displayName(dba) : legal;
	const official = [basic.authorized_official_first_name, basic.authorized_official_last_name]
		.filter(Boolean)
		.map(displayName)
		.join(' ');
	const officialTitle = basic.authorized_official_title_or_position?.trim();

	const notes = [];
	if (official) {
		notes.push(`Authorized official (NPI registry): ${official}${officialTitle ? `, ${displayName(officialTitle)}` : ''}.`);
	}
	if (dba && legal !== businessName) notes.push(`Legal name: ${legal}.`);

	const street = [location?.address_1, location?.address_2].filter((part) => part?.trim()).map(displayName).join(', ');
	return {
		business_name: businessName,
		phone: telUri(location?.telephone_number),
		address: street || null,
		city: location?.city ? displayName(location.city) : null,
		state: location?.state ?? null,
		product: 'dialtone_med',
		business_type: businessType,
		clinical_specialty: primaryTaxonomy(result)?.slice(0, 120) ?? null,
		npi: String(result.number),
		npi_entity_type: 'organization',
		contact_name: official || null,
		contact_phone: telUri(basic.authorized_official_telephone_number),
		notes: notes.join(' ') || null,
		source_url: `https://npiregistry.cms.hhs.gov/provider-view/${result.number}`,
		scrape_source: 'npi_registry'
	};
}

/**
 * Removes rows the leads table would reject or that duplicate an existing lead:
 * an NPI already imported, a (business_name, city) already present, or a phone
 * already owned by another lead (both are UNIQUE). Returns kept rows plus a reason per skip.
 */
export function dedupeRows(rows, existing) {
	const npis = new Set(existing.map((lead) => lead.npi).filter(Boolean));
	const identities = new Set(existing.map((lead) => identityKey(lead.business_name, lead.city)));
	const phones = new Set(existing.map((lead) => lead.phone).filter(Boolean));
	const batchNpis = new Set();
	const batchIdentities = new Set();
	const batchPhones = new Set();
	const kept = [];
	const skipped = [];

	for (const row of rows) {
		const identity = identityKey(row.business_name, row.city);
		let reason = null;
		if (!row.business_name || !row.city) reason = 'missing name or city';
		else if (npis.has(row.npi)) reason = 'NPI already in the CRM';
		else if (identities.has(identity)) reason = 'same name and city already in the CRM';
		else if (row.phone && phones.has(row.phone)) reason = 'phone already belongs to a CRM lead';
		else if (batchNpis.has(row.npi) || batchIdentities.has(identity)) reason = 'duplicate of another registry result';
		else if (row.phone && batchPhones.has(row.phone)) reason = 'shares a phone with another registry result';

		if (reason) {
			skipped.push({ row, reason });
			continue;
		}
		kept.push(row);
		batchNpis.add(row.npi);
		batchIdentities.add(identity);
		if (row.phone) batchPhones.add(row.phone);
	}
	return { kept, skipped };
}
