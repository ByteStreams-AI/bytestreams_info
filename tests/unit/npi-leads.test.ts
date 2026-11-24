import { describe, expect, it } from 'vitest';
import {
	accepts,
	dbaName,
	dedupeRows,
	displayName,
	identityKey,
	inArea,
	leadRow,
	telUri
} from '../../developer/npi-leads.mjs';

function registryResult(overrides: Record<string, unknown> = {}, basic: Record<string, unknown> = {}) {
	return {
		number: 1033971064,
		enumeration_type: 'NPI-2',
		basic: {
			organization_name: 'B-LEEVE PRIMARY CARE',
			status: 'A',
			authorized_official_first_name: 'QUAWENDELLA',
			authorized_official_last_name: 'SKINNER',
			authorized_official_title_or_position: 'President',
			authorized_official_telephone_number: '9046766062',
			...basic
		},
		addresses: [
			{ address_purpose: 'MAILING', address_1: '6295 SANDS POINTE DR', city: 'MACCLENNY', state: 'FL', postal_code: '320630000' },
			{
				address_purpose: 'LOCATION',
				address_1: '1734 KINGSLEY AVE',
				address_2: 'STE 7',
				city: 'ORANGE PARK',
				state: 'FL',
				postal_code: '320734405',
				telephone_number: '904-474-9766'
			}
		],
		taxonomies: [
			{ desc: 'Nurse Practitioner', primary: false },
			{ desc: 'Nurse Practitioner, Family', primary: true }
		],
		other_names: [],
		...overrides
	};
}

describe('displayName', () => {
	it('title-cases registry names and keeps entity suffixes', () => {
		expect(displayName('FAMILY PRACTICE ASSOCIATES OF ORANGE PARK,PA')).toBe('Family Practice Associates of Orange Park, PA');
		expect(displayName('B-LEEVE PRIMARY CARE')).toBe('B-Leeve Primary Care');
		expect(displayName('GAINES C MARTIN MD PHD PA')).toBe('Gaines C Martin MD PhD PA');
		expect(displayName('THE 904 HEALTH CLINIC 2ND FLOOR')).toBe('The 904 Health Clinic 2nd Floor');
		expect(displayName('R K VISHEN MD P A')).toBe('R K Vishen MD P A');
		expect(displayName('GUIDESTAR ELDERCARE - TN, P.C.')).toBe('Guidestar Eldercare - TN, P.C.');
		expect(displayName(null)).toBe('');
	});
});

describe('telUri', () => {
	it('formats US numbers as tel URIs', () => {
		expect(telUri('904-474-9766')).toBe('tel:+19044749766');
		expect(telUri('19044749766')).toBe('tel:+19044749766');
		expect(telUri('4749766')).toBeNull();
		expect(telUri(undefined)).toBeNull();
	});
});

describe('filters', () => {
	it('keeps the practice location in the area, not the mailing address', () => {
		expect(inArea(registryResult(), { state: 'fl', city: 'Orange Park' })).toBe(true);
		expect(inArea(registryResult(), { state: 'FL', city: 'Macclenny' })).toBe(false);
		expect(inArea(registryResult(), { state: 'GA' })).toBe(false);
		expect(inArea(registryResult(), { state: 'FL', postalCode: '32073' })).toBe(true);
		expect(inArea(registryResult(), { state: 'FL', postalCode: '32099' })).toBe(false);
		expect(inArea(registryResult({ addresses: [] }), { state: 'FL' })).toBe(false);
	});

	it('accepts by primary taxonomy only', () => {
		expect(accepts(registryResult(), 'general_practice')).toBe(true);
		const emergencyGroup = registryResult({
			taxonomies: [{ desc: 'Nurse Practitioner', primary: false }, { desc: 'Emergency Medicine', primary: true }]
		});
		expect(accepts(emergencyGroup, 'general_practice')).toBe(false);
		expect(accepts(registryResult({ taxonomies: [{ desc: 'Pharmacy, Specialty Pharmacy' }] }), 'specialty_pharmacy')).toBe(true);
		expect(accepts(registryResult({ taxonomies: [] }), 'general_practice')).toBe(false);
	});

	it('matches a --taxonomy override against the primary taxonomy', () => {
		const oralSurgery = registryResult({ taxonomies: [{ desc: 'Dentist, Oral and Maxillofacial Surgery', primary: true }] });
		expect(accepts(oralSurgery, 'specialty_practice', 'oral and maxillofacial')).toBe(true);
		expect(accepts(registryResult(), 'specialty_practice', 'Oral and Maxillofacial')).toBe(false);
	});

	it('rejects individuals, deactivated NPIs and hospitalist groups', () => {
		expect(accepts(registryResult({ enumeration_type: 'NPI-1' }), 'general_practice')).toBe(false);
		expect(accepts(registryResult({}, { status: 'D' }), 'general_practice')).toBe(false);
		expect(accepts(registryResult({}, { organization_name: 'ORANGE PARK HOSPITALISTS LLC' }), 'general_practice')).toBe(false);
	});
});

describe('leadRow', () => {
	it('maps the organization and its authorized official to a Med lead', () => {
		expect(leadRow(registryResult(), 'general_practice')).toEqual({
			business_name: 'B-Leeve Primary Care',
			phone: 'tel:+19044749766',
			address: '1734 Kingsley Ave, Ste 7',
			city: 'Orange Park',
			state: 'FL',
			product: 'dialtone_med',
			business_type: 'general_practice',
			clinical_specialty: 'Nurse Practitioner, Family',
			npi: '1033971064',
			npi_entity_type: 'organization',
			contact_name: 'Quawendella Skinner',
			contact_phone: 'tel:+19046766062',
			notes: 'Authorized official (NPI registry): Quawendella Skinner, President.',
			source_url: 'https://npiregistry.cms.hhs.gov/provider-view/1033971064',
			scrape_source: 'npi_registry'
		});
	});

	it('uses the DBA name and records the legal name', () => {
		const row = leadRow(
			registryResult({ other_names: [{ code: '3', organization_name: 'SMILE DENTAL OF ORANGE PARK' }] }, { organization_name: 'XYZ HOLDINGS LLC' }),
			'specialty_practice'
		);
		expect(row.business_name).toBe('Smile Dental of Orange Park');
		expect(row.notes).toContain('Legal name: Xyz Holdings LLC.');
	});

	it('splits an inline DBA out of the legal name', () => {
		const result = registryResult({}, { organization_name: 'CARES CONSULTING SERVICES LLC, DBA PINNACLE NP MOBILE HEALTH' });
		expect(dbaName(result)).toBe('PINNACLE NP MOBILE HEALTH');
		const row = leadRow(result, 'general_practice');
		expect(row.business_name).toBe('Pinnacle NP Mobile Health');
		expect(row.notes).toContain('Legal name: Cares Consulting Services LLC.');
	});

	it('tolerates a missing official and location', () => {
		const row = leadRow(
			registryResult({ addresses: [], taxonomies: [] }, {
				authorized_official_first_name: null,
				authorized_official_last_name: null,
				authorized_official_title_or_position: null,
				authorized_official_telephone_number: null
			}),
			'general_practice'
		);
		expect(row).toMatchObject({ contact_name: null, contact_phone: null, notes: null, address: null, city: null, phone: null });
	});
});

describe('dedupeRows', () => {
	const row = leadRow(registryResult(), 'general_practice');

	it('skips leads already in the CRM by NPI, normalized name and city, or phone', () => {
		expect(identityKey('B-Leeve Primary Care, LLC', 'Orange Park')).toBe(identityKey('B LEEVE PRIMARY CARE', 'ORANGE PARK '));
		const cases = [
			[{ npi: '1033971064' }, 'NPI already in the CRM'],
			[{ business_name: 'B-LEEVE PRIMARY CARE LLC', city: 'Orange Park' }, 'same name and city already in the CRM'],
			[{ phone: 'tel:+19044749766' }, 'phone already belongs to a CRM lead']
		] as const;
		for (const [existing, reason] of cases) {
			const { kept, skipped } = dedupeRows([row], [{ npi: null, business_name: 'Other', city: 'Elsewhere', phone: null, ...existing }]);
			expect(kept).toEqual([]);
			expect(skipped).toEqual([{ row, reason }]);
		}
	});

	it('keeps the first of several registry results for one practice', () => {
		const sameName = { ...row, npi: '2', phone: null };
		const samePhone = { ...row, npi: '3', business_name: 'Another Name' };
		const nameless = { ...row, npi: '4', business_name: '' };
		const { kept, skipped } = dedupeRows([row, sameName, samePhone, nameless], []);
		expect(kept).toEqual([row]);
		expect(skipped.map((skip) => skip.reason)).toEqual([
			'duplicate of another registry result',
			'shares a phone with another registry result',
			'missing name or city'
		]);
	});
});
