import type { Layout } from '@hinge/core/engine/layout';
import { OrderBottomButtonBar, OrderItem, OrderSummary, SectionHeader } from '../components';
import { BAG_LINES } from '../content';

export function BagScreen({ layout }: { layout: Layout }) {
  return (
    <div className="content-stack content-stack--white" data-name=".Content/Bag" data-panes={layout.panes}>
      <section className="page-pad section-pad">
        <p className="t-Paragraph-Medium-Regular section-copy">
          Pickup at <strong className="t-Paragraph-Medium-Bold">Hötorget</strong> · Kungsgatan 50
        </p>
        <div className="order_list">
          {BAG_LINES.map((line) => (
            <OrderItem line={line} key={line.name} />
          ))}
        </div>
      </section>
      <section className="page-pad section-pad">
        <SectionHeader title="Summary" />
        <OrderSummary
          rows={[
            ['Subtotal', '221 kr'],
            ['Deal: Classic Burger Meal', '−20 kr'],
            ['Total', '201 kr', true],
          ]}
        />
      </section>
      <OrderBottomButtonBar label="Total (4 items)" total="201 kr" cta="Checkout" />
    </div>
  );
}
