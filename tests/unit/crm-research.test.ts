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
	researchRestaurantWebsite: vi.fn()
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
				contact_phone: 'tel:+17135550102'
			},
			'sales@bytestreams.ai'
		);
		expect(result).toEqual({ success: true });
	});
});