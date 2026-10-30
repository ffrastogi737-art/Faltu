import { Link } from 'react-router-dom';
import { Empty, PageHeader } from '../components/ui';
import { useStore } from '../lib/store';

export default function Policy({ notFound = false }: { notFound?: boolean }) {
  const { settings } = useStore();
  if (notFound) return (<><PageHeader title="" /><Empty icon="search" title="Page not found" action={<Link to="/" className="btn-dark">Go home</Link>} /></>);
  const h = settings?.replacementWindowHours ?? 3;
  return (
    <div>
      <PageHeader title="Replacement Policy" />
      <article className="space-y-6 px-5 py-6 text-[15px] leading-relaxed">
        <p className="font-display text-2xl">No return. No refund. Only eligible replacement.</p>
        {settings?.replacementPolicy && <p className="whitespace-pre-line text-ink/80">{settings.replacementPolicy}</p>}
        <section>
          <h2 className="text-xl">Eligible for replacement</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-ink/80">
            <li>Wrong product delivered</li>
            <li>Product received damaged</li>
            <li>Verified manufacturing defect</li>
          </ul>
        </section>
        <section>
          <h2 className="text-xl">Not eligible</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-ink/80">
            <li>Change of mind or not liking the product</li>
            <li>Used products</li>
            <li>Damage caused by the customer or mishandling after delivery</li>
          </ul>
        </section>
        <section>
          <h2 className="text-xl">How to request</h2>
          <p className="mt-2 text-ink/80">
            Report the issue within <b>{h} hours of delivery</b>: open <Link to="/orders" className="underline">My Orders</Link>, choose the delivered order,
            select the product and the issue, upload photographs and submit. The shop reviews each request and updates its status
            (Requested → Under Review → Approved/Rejected → Replacement Preparing → Replacement Delivered → Completed).
          </p>
        </section>
        <p className="text-sm text-muted">This policy does not limit any rights you have under applicable consumer protection law.</p>
      </article>
    </div>
  );
}
