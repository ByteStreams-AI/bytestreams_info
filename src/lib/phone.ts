export function normalizePhoneUri(phone: string): string {
	let value = phone.trim();
	if (value.toLowerCase().startsWith('tel:')) value = value.slice(4).trim();

	const international = value.startsWith('+') || value.startsWith('00');
	let digits = value.replace(/\D/g, '');
	if (value.startsWith('00')) digits = digits.slice(2);

	if (digits.length < 3 || digits.length > 15) {
		throw new Error('Phone number must contain between 3 and 15 digits.');
	}
	if (international) {
		if (digits.startsWith('0')) throw new Error('International phone number is invalid.');
		return `tel:+${digits}`;
	}
	if (digits.length === 10) return `tel:+1${digits}`;
	if (digits.length === 11 && digits.startsWith('1')) return `tel:+${digits}`;
	return `tel:${digits}`;
}

export function phoneHref(phone: string): string | null {
	try {
		return normalizePhoneUri(phone);
	} catch {
		return null;
	}
}

/** Readable form of a stored tel URI: "(574) 546-1900" for US numbers, otherwise without the "tel:" prefix. */
export function formatPhone(phone: string): string {
	const href = phoneHref(phone);
	if (!href) return phone;
	const us = href.match(/^tel:\+1(\d{3})(\d{3})(\d{4})$/);
	return us ? `(${us[1]}) ${us[2]}-${us[3]}` : href.slice(4);
}
