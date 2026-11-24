import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	completeLeadResearchRun: vi.fn(),
	createLeadResearchRun: vi.fn(),
	failLeadResearchRun: vi.fn(),
	fetchApprovedLeadResearchFindings: vi.fn(),
	fetchLead: vi.fn(),
	fetchLeadResearchFindings: vi.fn(),
	fetchLeads: vi.fn(),
	insertLead: vi.fn(),
	reviewLeadResearchFinding: vi.fn(),
	updateLeadSalesFields: vi.fn(),
	generateCallScript: vi.fn(),
	researchRestaurantWebsite: vi.fn(),
	findLeadContact: vi.fn(),
	env: {} as Record<string, string | undefined>
}));

vi.mock('$env/dynamic/private', () => ({ env: mocks.env }));

vi.mock('$lib/server/apollo', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/apollo')>()),
	findLeadContact: mocks.findLeadContact
}));

vi.mock('@sveltejs/kit', () => ({
	redirect: vi.fn((status: number, location: string) => {
		throw { status, location };
	}),
	error: vi.fn((status: number, message: string) => {
		throw { status, message };
	}),
	fail: vi.fn((status: number, data: unknown) => ({ status, data }))
}));

vi.mock('$lib/server/supabase', () => ({
	completeLeadResearchRun: mocks.completeLeadResearchRun,
	createLeadResearchRun: mocks.createLeadResearchRun,
	failLeadResearchRun: mocks.failLeadResearchRun,
	fetchApprovedLeadResearchFindings: mocks.fetchApprovedLeadResearchFindings,
	fetchLead: mocks.fetchLead,
	fetchLeadResearchFindings: mocks.fetchLeadResearchFindings,
	fetchLeads: mocks.fetchLeads,
	insertLead: mocks.insertLead,
	reviewLeadResearchFinding: mocks.reviewLeadResearchFinding,
	updateLeadSalesFields: mocks.updateLeadSalesFields
}));

vi.mock('$lib/server/call-script', () => ({
	generateCallScript: mocks.generateCallScript
}));

vi.mock('$lib/server/restaurant-research', () => ({
	researchRestaurantWebsite: mocks.researchRestaurantWebsite
}));

const user = {
	email: 'sales@bytestreams.ai',
	sub: 'user-1',
	displayName: 'Sales',
	iat: 1,
	exp: 2
};

const lead = {
	lead_id: 'lead-1',
	business_name: 'Sample Kitchen',
	website_url: 'https://sample.example',
	status: 'researched'
};

const finding = {
	finding_id: 'finding-1',
	run_id: 'run-1',
	lead_id: 'lead-1',
	category: 'social_instagram',
	value: 'https://instagram.com/samplekitchen',
	source_url: 'https://sample.example/',
	retrieved_at: '2026-07-27T00:00:00Z',
	confidence: 0.95,
	review_status: 'pending',
	reviewed_by_email: null,
	reviewed_at: null
};

function request(fields: Record<string, string>) {
	const form = new FormData();
	for (const [key, value] of Object.entries(fields)) form.set(key, value);
	return { formData: vi.fn().mockResolvedValue(form) };
}

describe('CRM restaurant research actions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.fetchLead.mockResolvedValue(lead);
		mocks.createLeadResearchRun.mockResolvedValue('run-1');
		mocks.researchRestaurantWebsite.mockResolvedValue({
			sourceUrl: 'https://sample.example/',
			pageTitle: 'Sample Kitchen',
			findings: [{
				category: finding.category,
				value: finding.value,
				sourceUrl: finding.source_url,
				confidence: finding.confidence
			}]
		});
		mocks.completeLeadResearchRun.mockResolvedValue([finding]);
		mocks.fetchApprovedLeadResearchFindings.mockResolvedValue([{ ...finding, review_status: 'approved' }]);
		mocks.generateCallScript.mockResolvedValue('## First 30 Seconds');
		mocks.reviewLeadResearchFinding.mockResolvedValue(finding);
		mocks.env.APOLLO_API_KEY = 'apollo-key';
	});

	it('persists cited findings from the official website', async () => {
		const { actions } = await import('$lib/../routes/crm/+page.server');
		const result = await actions.researchRestaurant({
			request: request({ lead_id: 'lead-1' }),
			locals: { user }
		} as never);

		expect(mocks.createLeadResearchRun).toHaveBeenCalledWith(
			'lead-1',
			'https://sample.example',
			'sales@bytestreams.ai'
		);
		expect(mocks.completeLeadResearchRun).toHaveBeenCalledWith(
			'run-1',
			'lead-1',
			expect.arrayContaining([expect.objectContaining({ category: 'social_instagram' })]),
			'sales@bytestreams.ai'
		);
		expect(result).toEqual({ success: true, findings: [finding] });
	});

	it('requires a saved official website', async () => {
		mocks.fetchLead.mockResolvedValue({ ...lead, website_url: null });
		const { actions } = await import('$lib/../routes/crm/+page.server');
		const result = await actions.researchRestaurant({
			request: request({ lead_id: 'lead-1' }),
			locals: { user }
		} as never);

		expect(result).toMatchObject({ status: 400 });
		expect(mocks.createLeadResearchRun).not.toHaveBeenCalled();
	});

	it('records an attributed review decision', async () => {
		const { actions } = await import('$lib/../routes/crm/+page.server');
		const result = await actions.reviewResearchFinding({
			request: request({ finding_id: 'finding-1', review_status: 'approved' }),
			locals: { user }
		} as never);

		expect(mocks.reviewLeadResearchFinding).toHaveBeenCalledWith(
			'finding-1',
			'approved',
			'sales@bytestreams.ai'
		);
		expect(result).toMatchObject({ success: true, review_status: 'approved' });
	});

	it('stores Apollo decision-maker findings for review', async () => {
		const contactFinding = { ...finding, category: 'contact_email', value: 'owner@sample.example' };
		mocks.fetchLead.mockResolvedValue({ ...lead, product: 'dialtone_med', contact_name: null });
		mocks.findLeadContact.mockResolvedValue({
			sourceUrl: 'https://app.apollo.io/#/people/p-1',
			findings: [{ category: 'contact_email', value: 'owner@sample.example', sourceUrl: 'https://app.apollo.io/#/people/p-1', confidence: 0.95 }]
		});
		mocks.completeLeadResearchRun.mockResolvedValue([contactFinding]);
		const { actions } = await import('$lib/../routes/crm/+page.server');
		const result = await actions.findContact({ request: request({ lead_id: 'lead-1' }), locals: { user } } as never);

		expect(mocks.findLeadContact).toHaveBeenCalledWith(
			{ business_name: 'Sample Kitchen', contact_name: null, linkedin_url: undefined, website_url: 'https://sample.example', product: 'dialtone_med' },
			'apollo-key'
		);
		expect(mocks.createLeadResearchRun).toHaveBeenCalledWith('lead-1', 'https://api.apollo.io/api/v1/people/match', 'sales@bytestreams.ai');
		expect(result).toEqual({ success: true, findings: [contactFinding] });
	});

	it('refuses an Apollo lookup without an API key', async () => {
		mocks.env.APOLLO_API_KEY = ' ';
		const { actions } = await import('$lib/../routes/crm/+page.server');
		const result = await actions.findContact({ request: request({ lead_id: 'lead-1' }), locals: { user } } as never);

		expect(result).toMatchObject({ status: 503 });
		expect(mocks.findLeadContact).not.toHaveBeenCalled();
	});

	it('validates the Apollo lookup request', async () => {
		const { actions } = await import('$lib/../routes/crm/+page.server');
		await expect(actions.findContact({ request: request({}), locals: { user: null } } as never)).rejects.toMatchObject({ status: 401 });
		expect(await actions.findContact({ request: request({}), locals: { user } } as never)).toMatchObject({ status: 400 });
		mocks.fetchLead.mockResolvedValue(null);
		expect(await actions.findContact({ request: request({ lead_id: 'x' }), locals: { user } } as never)).toMatchObject({ status: 404 });
	});

	it('records a failed Apollo lookup on the run', async () => {
		mocks.findLeadContact.mockRejectedValue(new Error('Apollo rejected the API key (401).'));
		const { actions } = await import('$lib/../routes/crm/+page.server');
		const result = await actions.findContact({ request: request({ lead_id: 'lead-1' }), locals: { user } } as never);

		expect(mocks.failLeadResearchRun).toHaveBeenCalledWith('run-1', 'Apollo rejected the API key (401).', 'sales@bytestreams.ai');
		expect(result).toMatchObject({ status: 502, data: { message: expect.stringContaining('401') } });
	});

	it('still reports the Apollo failure when recording it fails', async () => {
		mocks.findLeadContact.mockRejectedValue('offline');
		mocks.failLeadResearchRun.mockRejectedValue(new Error('db down'));
		const { actions } = await import('$lib/../routes/crm/+page.server');
		const result = await actions.findContact({ request: request({ lead_id: 'lead-1' }), locals: { user } } as never);

		expect(result).toMatchObject({ status: 502, data: { message: 'Unable to find a contact: offline' } });
	});

	it('writes an approved Apollo email to the lead', async () => {
		mocks.reviewLeadResearchFinding.mockResolvedValue({ lead_id: 'lead-1', category: 'contact_email', value: 'owner@sample.example' });
		const { actions } = await import('$lib/../routes/crm/+page.server');
		const result = await actions.reviewResearchFinding({
			request: request({ finding_id: 'finding-1', review_status: 'approved' }),
			locals: { user }
		} as never);

		expect(mocks.updateLeadSalesFields).toHaveBeenCalledWith('lead-1', 'sales@bytestreams.ai', { email: 'owner@sample.example' });
		expect(result).toMatchObject({ success: true, applied: { field: 'email', value: 'owner@sample.example' } });
	});

	it('normalizes an approved Apollo LinkedIn URL and refuses a bad one', async () => {
		mocks.reviewLeadResearchFinding.mockResolvedValue({ lead_id: 'lead-1', category: 'contact_linkedin', value: 'http://www.linkedin.com/in/owner' });
		const { actions } = await import('$lib/../routes/crm/+page.server');
		const approve = () => actions.reviewResearchFinding({
			request: request({ finding_id: 'finding-1', review_status: 'approved' }),
			locals: { user }
		} as never);

		await approve();
		expect(mocks.updateLeadSalesFields).toHaveBeenCalledWith('lead-1', 'sales@bytestreams.ai', { linkedin_url: 'https://www.linkedin.com/in/owner' });

		mocks.reviewLeadResearchFinding.mockResolvedValue({ lead_id: 'lead-1', category: 'contact_linkedin', value: 'https://evil.example/in/owner' });
		expect(await approve()).toMatchObject({ status: 400 });
	});

	it('does not write a rejected Apollo finding or a title to the lead', async () => {
		const { actions } = await import('$lib/../routes/crm/+page.server');
		mocks.reviewLeadResearchFinding.mockResolvedValue({ lead_id: 'lead-1', category: 'contact_email', value: 'a@b.example' });
		await actions.reviewResearchFinding({
			request: request({ finding_id: 'finding-1', review_status: 'rejected' }),
			locals: { user }
		} as never);
		mocks.reviewLeadResearchFinding.mockResolvedValue({ lead_id: 'lead-1', category: 'contact_title', value: 'Owner' });
		await actions.reviewResearchFinding({
			request: request({ finding_id: 'finding-1', review_status: 'approved' }),
			locals: { user }
		} as never);

		expect(mocks.updateLeadSalesFields).not.toHaveBeenCalled();
	});

	it('passes approved findings to script generation', async () => {
		const ai = { run: vi.fn() };
		const { actions } = await import('$lib/../routes/crm/+page.server');
		await actions.generateScript({
			request: request({ lead_id: 'lead-1' }),
			locals: { user },
			platform: { env: { AI: ai, CALLER_NAME: 'Alex' } }
		} as never);

		expect(mocks.fetchApprovedLeadResearchFindings).toHaveBeenCalledWith('lead-1');
		expect(mocks.generateCallScript).toHaveBeenCalledWith(
			ai,
			lead,
			'Alex',
			[expect.objectContaining({ review_status: 'approved' })]
		);
	});

	it('returns and persists the complete generated follow-up email', async () => {
		const ai = { run: vi.fn() };
		const callScript = `## Follow-Up Email

### Food Truck Using Square

**Subject:** A better ordering flow for Empanadas de Mendoza

Steve  
DialTone.Menu`;
		mocks.generateCallScript.mockResolvedValue(callScript);
		const { actions } = await import('$lib/../routes/crm/+page.server');
		const result = await actions.generateScript({
			request: request({ lead_id: 'lead-1' }),
			locals: { user },
			platform: { env: { AI: ai, CALLER_NAME: 'Steve' } }
		} as never);

		expect(mocks.updateLeadSalesFields).toHaveBeenCalledWith(
			'lead-1',
			'sales@bytestreams.ai',
			{ call_script: callScript }
		);
		expect(result).toEqual({ success: true, call_script: callScript });
	});

	it('rejects script generation when the caller name is not configured', async () => {
		const { actions } = await import('$lib/../routes/crm/+page.server');
		const result = await actions.generateScript({
			request: request({ lead_id: 'lead-1' }),
			locals: { user },
			platform: { env: { AI: { run: vi.fn() } } }
		} as never);

		expect(result).toMatchObject({
			status: 503,
			data: { message: 'Call-script caller name is not configured in this environment.' }
		});
		expect(mocks.generateCallScript).not.toHaveBeenCalled();
	});

	it('normalizes contact phone when updating a lead', async () => {
		const { actions } = await import('$lib/../routes/crm/+page.server');
		const result = await actions.update({
			request: request({ lead_id: 'lead-1', contact_phone: '(713) 555-0102' }),
			locals: { user }
		} as never);

		expect(mocks.updateLeadSalesFields).toHaveBeenCalledWith(
			'lead-1',
			'sales@bytestreams.ai',
			{ contact_phone: 'tel:+17135550102' }
		);
		expect(result).toEqual({ success: true });
	});

	it('normalizes contact phone when creating a lead', async () => {
		const { actions } = await import('$lib/../routes/crm/+page.server');
		const result = await actions.create({
			request: request({
				business_name: 'New Cafe',
				city: 'Houston',
				state: 'TX',
				contact_phone: '(713) 555-0102'
			}),
			locals: { user }
		} as never);

		expect(mocks.insertLead).toHaveBeenCalledWith(
			{
				business_name: 'New Cafe',
				city: 'Houston',
				state: 'TX',
				product: 'dialtone_menu',
				contact_phone: 'tel:+17135550102'
			},
			'sales@bytestreams.ai'
		);
		expect(result).toEqual({ success: true });
	});

	it('creates a DialTone.Med specialty-pharmacy prospect with organization-only data', async () => {
		const { actions } = await import('$lib/../routes/crm/+page.server');
		const result = await actions.create({
			request: request({
				business_name: 'North Star Specialty Pharmacy',
				city: 'Houston',
				state: 'TX',
				product: 'dialtone_med',
				business_type: 'specialty_pharmacy',
				clinical_specialty: 'Oncology',
				npi: '1234567893',
				npi_entity_type: 'organization'
			}),
			locals: { user }
		} as never);

		expect(mocks.insertLead).toHaveBeenCalledWith(
			{
				business_name: 'North Star Specialty Pharmacy',
				city: 'Houston',
				state: 'TX',
				product: 'dialtone_med',
				business_type: 'specialty_pharmacy',
				clinical_specialty: 'Oncology',
				npi: '1234567893',
				npi_entity_type: 'organization'
			},
			'sales@bytestreams.ai'
		);
		expect(result).toEqual({ success: true });
	});

	it('rejects an invalid Med NPI before writing a prospect', async () => {
		const { actions } = await import('$lib/../routes/crm/+page.server');
		const result = await actions.create({
			request: request({
				business_name: 'Example Practice',
				city: 'Houston',
				state: 'TX',
				product: 'dialtone_med',
				npi: '1234567890'
			}),
			locals: { user }
		} as never);

		expect(result).toMatchObject({ status: 400, data: { message: expect.stringContaining('NPI') } });
		expect(mocks.insertLead).not.toHaveBeenCalled();
	});

	it('does not apply the Menu call template to a Med lead', async () => {
		mocks.fetchLead.mockResolvedValue({ ...lead, product: 'dialtone_med' });
		const { actions } = await import('$lib/../routes/crm/+page.server');
		const result = await actions.generateScript({
			request: request({ lead_id: 'lead-1' }),
			locals: { user },
			platform: { env: { AI: { run: vi.fn() }, CALLER_NAME: 'Alex' } }
		} as never);

		expect(result).toMatchObject({ status: 400, data: { message: expect.stringContaining('DialTone.Menu') } });
		expect(mocks.generateCallScript).not.toHaveBeenCalled();
	});

	it('does not research a Med lead as a restaurant', async () => {
		mocks.fetchLead.mockResolvedValue({ ...lead, product: 'dialtone_med' });
		const { actions } = await import('$lib/../routes/crm/+page.server');
		const result = await actions.researchRestaurant({
			request: request({ lead_id: 'lead-1' }),
			locals: { user }
		} as never);

		expect(result).toMatchObject({ status: 400, data: { message: expect.stringContaining('DialTone.Menu') } });
		expect(mocks.createLeadResearchRun).not.toHaveBeenCalled();
	});

	it('rejects a business type from the other product', async () => {
		const { actions } = await import('$lib/../routes/crm/+page.server');
		const result = await actions.create({
			request: request({
				business_name: 'Sample Clinic',
				city: 'Houston',
				state: 'TX',
				product: 'dialtone_med',
				business_type: 'food_truck'
			}),
			locals: { user }
		} as never);

		expect(result).toMatchObject({ status: 400, data: { message: expect.stringContaining('business type') } });
		expect(mocks.insertLead).not.toHaveBeenCalled();
	});

	it('rejects an unknown product', async () => {
		const { actions } = await import('$lib/../routes/crm/+page.server');
		const result = await actions.create({
			request: request({ business_name: 'X', city: 'Houston', state: 'TX', product: 'dialtone_vet' }),
			locals: { user }
		} as never);

		expect(result).toMatchObject({ status: 400 });
		expect(mocks.insertLead).not.toHaveBeenCalled();
	});

	it('ignores Med fields on a Menu lead', async () => {
		const { actions } = await import('$lib/../routes/crm/+page.server');
		await actions.create({
			request: request({ business_name: 'New Cafe', city: 'Houston', state: 'TX', npi: '1234567893' }),
			locals: { user }
		} as never);

		expect(mocks.insertLead).toHaveBeenCalledWith(
			{ business_name: 'New Cafe', city: 'Houston', state: 'TX', product: 'dialtone_menu' },
			'sales@bytestreams.ai'
		);
	});

	it('updates Med fields, ignores product changes and Menu-only fields', async () => {
		mocks.fetchLead.mockResolvedValue({ ...lead, product: 'dialtone_med' });
		const { actions } = await import('$lib/../routes/crm/+page.server');
		const result = await actions.update({
			request: request({
				lead_id: 'lead-1',
				product: 'dialtone_menu',
				business_type: 'general_practice',
				clinical_specialty: ' Pediatric dentistry ',
				npi: '1234567893',
				npi_entity_type: '',
				call_script: 'Menu script',
				uses_kds: 'true'
			}),
			locals: { user }
		} as never);

		expect(mocks.updateLeadSalesFields).toHaveBeenCalledWith('lead-1', 'sales@bytestreams.ai', {
			business_type: 'general_practice',
			clinical_specialty: 'Pediatric dentistry',
			npi: '1234567893',
			npi_entity_type: null
		});
		expect(result).toEqual({ success: true });
	});

	it('rejects an invalid Med field on update', async () => {
		mocks.fetchLead.mockResolvedValue({ ...lead, product: 'dialtone_med' });
		const { actions } = await import('$lib/../routes/crm/+page.server');
		const result = await actions.update({
			request: request({ lead_id: 'lead-1', npi_entity_type: 'group' }),
			locals: { user }
		} as never);

		expect(result).toMatchObject({ status: 400 });
		expect(mocks.updateLeadSalesFields).not.toHaveBeenCalled();
	});

	it('returns 404 when updating a missing lead', async () => {
		mocks.fetchLead.mockResolvedValue(null);
		const { actions } = await import('$lib/../routes/crm/+page.server');
		const result = await actions.update({
			request: request({ lead_id: 'missing' }),
			locals: { user }
		} as never);

		expect(result).toMatchObject({ status: 404 });
	});

	it('normalizes a LinkedIn URL when creating a lead', async () => {
		const { actions } = await import('$lib/../routes/crm/+page.server');
		const result = await actions.create({
			request: request({
				business_name: 'New Cafe',
				city: 'Houston',
				state: 'TX',
				linkedin_url: 'linkedin.com/company/new-cafe'
			}),
			locals: { user }
		} as never);

		expect(mocks.insertLead).toHaveBeenCalledWith(
			{
				business_name: 'New Cafe',
				city: 'Houston',
				state: 'TX',
				product: 'dialtone_menu',
				linkedin_url: 'https://linkedin.com/company/new-cafe'
			},
			'sales@bytestreams.ai'
		);
		expect(result).toEqual({ success: true });
	});

	it('rejects a non-LinkedIn URL', async () => {
		const { actions } = await import('$lib/../routes/crm/+page.server');
		const created = await actions.create({
			request: request({ business_name: 'X', city: 'Houston', state: 'TX', linkedin_url: 'https://evil.example/linkedin.com' }),
			locals: { user }
		} as never);
		const updated = await actions.update({
			request: request({ lead_id: 'lead-1', linkedin_url: 'javascript:alert(1)' }),
			locals: { user }
		} as never);

		expect(created).toMatchObject({ status: 400, data: { message: expect.stringContaining('LinkedIn') } });
		expect(updated).toMatchObject({ status: 400, data: { message: expect.stringContaining('LinkedIn') } });
		expect(mocks.insertLead).not.toHaveBeenCalled();
		expect(mocks.updateLeadSalesFields).not.toHaveBeenCalled();
	});

	it('updates and clears a LinkedIn URL', async () => {
		const { actions } = await import('$lib/../routes/crm/+page.server');
		await actions.update({
			request: request({ lead_id: 'lead-1', linkedin_url: 'http://www.linkedin.com/in/someone' }),
			locals: { user }
		} as never);
		await actions.update({
			request: request({ lead_id: 'lead-1', linkedin_url: ' ' }),
			locals: { user }
		} as never);

		expect(mocks.updateLeadSalesFields).toHaveBeenNthCalledWith(1, 'lead-1', 'sales@bytestreams.ai', {
			linkedin_url: 'https://www.linkedin.com/in/someone'
		});
		expect(mocks.updateLeadSalesFields).toHaveBeenNthCalledWith(2, 'lead-1', 'sales@bytestreams.ai', {
			linkedin_url: null
		});
	});
});
