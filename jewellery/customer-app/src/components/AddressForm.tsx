import type { Address } from '../lib/types';
import { Field } from './ui';

export const EMPTY_ADDRESS: Address = { name: '', mobile: '', house: '', street: '', area: '', city: '', state: '', pincode: '', landmark: '' };

// Controlled address fields shared by checkout and saved addresses.
export function AddressFields({ value, onChange, withContact = true }: { value: Address; onChange: (a: Address) => void; withContact?: boolean }) {
  const set = (k: keyof Address) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-5">
      {withContact && (
        <>
          <div className="col-span-2"><Field label="Full name"><input required autoComplete="name" value={value.name} onChange={set('name')} minLength={2} maxLength={80} /></Field></div>
          <div className="col-span-2"><Field label="Mobile number"><input required type="tel" inputMode="numeric" autoComplete="tel-national" pattern="[6-9][0-9]{9}" title="10-digit mobile number" maxLength={10} value={value.mobile} onChange={set('mobile')} /></Field></div>
        </>
      )}
      <Field label="House / Flat no."><input required autoComplete="address-line1" value={value.house} onChange={set('house')} maxLength={120} /></Field>
      <Field label="Street"><input autoComplete="address-line2" value={value.street} onChange={set('street')} maxLength={160} /></Field>
      <div className="col-span-2"><Field label="Area / Locality"><input required value={value.area} onChange={set('area')} maxLength={160} /></Field></div>
      <Field label="City"><input required autoComplete="address-level2" value={value.city} onChange={set('city')} maxLength={80} /></Field>
      <Field label="State"><input required autoComplete="address-level1" value={value.state} onChange={set('state')} maxLength={80} /></Field>
      <Field label="PIN code"><input required inputMode="numeric" autoComplete="postal-code" pattern="[0-9]{6}" title="6-digit PIN code" maxLength={6} value={value.pincode} onChange={set('pincode')} /></Field>
      <Field label="Landmark"><input value={value.landmark} onChange={set('landmark')} maxLength={160} /></Field>
    </div>
  );
}
