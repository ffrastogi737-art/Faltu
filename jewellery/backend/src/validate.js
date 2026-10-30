import { httpError } from './pricing.js';

export function str(value, field, { max = 200, min = 0, optional = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional || min === 0) return '';
    throw httpError(400, `${field} is required`);
  }
  if (typeof value !== 'string') throw httpError(400, `${field} must be text`);
  const v = value.trim();
  if (v.length < min) throw httpError(400, min > 1 ? `${field} must be at least ${min} characters` : `${field} is required`);
  if (v.length > max) throw httpError(400, `${field} is too long`);
  return v;
}

export function mobile(value, field = 'Mobile number') {
  const v = String(value ?? '').replace(/[\s-]/g, '').replace(/^(\+91|91)(?=\d{10}$)/, '');
  if (!/^[6-9]\d{9}$/.test(v)) throw httpError(400, `${field} must be a valid 10-digit Indian mobile number`);
  return v;
}

export function email(value) {
  const v = str(value, 'Email', { max: 120, optional: true });
  if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw httpError(400, 'Email is not valid');
  return v || null;
}

export function address(a = {}) {
  const pincode = String(a.pincode ?? '').trim();
  if (!/^\d{6}$/.test(pincode)) throw httpError(400, 'PIN code must be 6 digits');
  return {
    house: str(a.house, 'House number', { min: 1, max: 120 }),
    street: str(a.street, 'Street', { max: 160 }),
    area: str(a.area, 'Area', { min: 1, max: 160 }),
    city: str(a.city, 'City', { min: 1, max: 80 }),
    state: str(a.state, 'State', { min: 1, max: 80 }),
    pincode,
    landmark: str(a.landmark, 'Landmark', { max: 160 }),
  };
}
