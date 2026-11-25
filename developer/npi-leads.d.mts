// Types for developer/npi-leads.mjs, so tests import it with real types instead of checkJs inference.

export interface RegistryAddress {
	address_purpose?: string;
	address_1?: string | null;
	address_2?: string | null;
	city?: string | null;
	state?: string | null;
	postal_code?: string | null;
	telephone_number?: string | null;
}

export interface RegistryResult {
	number: number | string;
	enumeration_type?: string;
	basic?: Record<string, string | null | undefined>;
	addresses?: RegistryAddress[];
	taxonomies?: { desc?: string | null; primary?: boolean }[];
	other_names?: { code?: string | number; organization_name?: string | null }[];
}

export type NpiBusinessType = 'general_practice' | 'specialty_pharmacy' | 'specialty_practice';

export interface NpiLeadRow {
	business_name: string;
	phone: string | null;
	address: string | null;
	city: string | null;
	state: string | null;
	product: 'dialtone_med';
	business_type: NpiBusinessType;
	clinical_specialty: string | null;
	npi: string;
	npi_entity_type: 'organization';
	contact_name: string | null;
	contact_phone: string | null;
	notes: string | null;
	source_url: string;
	scrape_source: 'npi_registry';
}

export interface ExistingLead {
	npi: string | null;
	business_name: string;
	city: string | null;
	phone: string | null;
}

export const NPI_API: string;
export const PAGE_SIZE: number;
export const MAX_SKIP: number;
export const NPI_TYPES: Record<NpiBusinessType, { searches: string[]; accept: RegExp | null }>;

export function displayName(value: string | null | undefined): string;
export function telUri(phone: string | null | undefined): string | null;
export function primaryTaxonomy(result: RegistryResult): string | null;
export function locationAddress(result: RegistryResult): RegistryAddress | null;
export function inArea(result: RegistryResult, area: { state: string; city?: string; postalCode?: string }): boolean;
export function accepts(result: RegistryResult, businessType: NpiBusinessType, taxonomy?: string): boolean;
export function dbaName(result: RegistryResult): string | null;
export function identityKey(businessName: string | null | undefined, city: string | null | undefined): string;
export function leadRow(result: RegistryResult, businessType: NpiBusinessType): NpiLeadRow;
export function dedupeRows(
	rows: NpiLeadRow[],
	existing: ExistingLead[]
): { kept: NpiLeadRow[]; skipped: { row: NpiLeadRow; reason: string }[] };
