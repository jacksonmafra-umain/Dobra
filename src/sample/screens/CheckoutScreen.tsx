import type { Layout } from '../../engine/layout';
import { FloatingJustifiedLarge, OrderSummary, PaymentOption, PickupOptionItem, SectionHeader } from '../components';

export function CheckoutScreen({ layout }: { layout: Layout }) {
  return (
    <div className="content-stack content-stack--white" data-name=".Content/Checkout" data-panes={layout.panes}>
      <section className="page-pad section-pad">
        <SectionHeader title="How do you want your order?" />
        <div className="stack-12">
          <PickupOptionItem title="Drive-thru" detail="Pick up in your car" selected />
          <PickupOptionItem title="Take away" detail="Collect at the counter" />
          <PickupOptionItem title="Eat in" detail="We bring it to your table" />
        </div>
      </section>
      <section className="page-pad section-pad">
        <SectionHeader title="Payment" />
        <div className="stack-12">
          <PaymentOption title="Visa •••• 6411" detail="Expires 08/28" selected />
          <PaymentOption title="Apple Pay" detail="Default wallet" />
        </div>
      </section>
      <section className="page-pad section-pad">
        <SectionHeader title="Order summary" />
        <OrderSummary
          rows={[
            ['4 items', '221 kr'],
            ['Deal: Classic Burger Meal', '−20 kr'],
            ['Points earned', '+201 pts'],
            ['Total', '201 kr', true],
          ]}
        />
      </section>
      <FloatingJustifiedLarge label="Pay" value="201 kr" />
    </div>
  );
}
