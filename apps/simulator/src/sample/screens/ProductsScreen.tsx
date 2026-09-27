import type { Layout } from '@hinge/core/engine/layout';
import { asset } from '../assets';
import { DealCard, RuleGrid } from '../components';

const PRODUCTS = ['Classic burger', 'Double burger', 'Chicken burger', 'Veggie burger', 'Fish burger', 'Cheeseburger', 'Bacon burger', 'Kids burger'];

/** An adaptive product grid: the column count follows the window width, not the device. */
export function ProductsScreen({ layout }: { layout: Layout }) {
  return (
    <div className="content-stack content-stack--white" data-name=".Content/Products">
      <RuleGrid layout={layout} component="product_card" className="page-pad section-pad">
        {PRODUCTS.map((name) => (
          <DealCard name={name} image={asset('deal_muffin_meal.png')} expiresSoon={false} key={name} />
        ))}
      </RuleGrid>
    </div>
  );
}
