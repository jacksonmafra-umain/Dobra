import type { Layout } from '../../engine/layout';
import { asset } from '../assets';
import {
  ActionCard,
  BonusCampaignBanner,
  Carousel,
  DealCard,
  InfoBanner,
  LoyaltyCard,
  NotUsedRewardsBlock,
  Pills,
  RewardCard,
  RuleGrid,
  SectionHeader,
} from '../components';
import { BONUSES, DEALS, REWARDS } from '../content';
import { ImLocalDeals } from '../illustrations';

const DEAL_FILTERS = ['Available now', 'Vegetarian', 'Drinks', 'Hamburgers', 'Breakfast', 'Desserts', 'Café'];

export function DealsScreen({ layout }: { layout: Layout }) {
  return (
    <div className="content-stack" data-name=".Content/Deals&Rewards">
      <InfoBanner>Scan the QR code on your first purchase and get 100 bonus points.</InfoBanner>
      <div className="page-pad" style={{ paddingTop: 'var(--xxlarge)' }}>
        <LoyaltyCard code="M 122 112" copy="Scan code to collect points." />
      </div>
      <RuleGrid layout={layout} component="action_card" className="page-pad section-pad">
        <ActionCard
          title="Deals on the go"
          body="Get notified when you are near a great deal."
          cta="Let’s go"
          illustration={<ImLocalDeals size={133} />}
        />
      </RuleGrid>
      <section>
        <div className="page-pad">
          <SectionHeader title="Rewards" link="View all" />
        </div>
        <Carousel label="Rewards">
          {REWARDS.map((reward) => (
            <div className="carousel__item" style={{ width: 156 }} key={reward.name}>
              <RewardCard reward={reward} />
            </div>
          ))}
        </Carousel>
      </section>
      <NotUsedRewardsBlock />
      <section className="page-pad section-pad">
        <SectionHeader title="Bonuses made for you" />
        <p className="t-Paragraph-Medium-Regular section-copy">
          Bonus points matching your order are applied automatically after purchase.
        </p>
        <RuleGrid layout={layout} component="bonus_campaign_banner">
          {BONUSES.map((title) => (
            <BonusCampaignBanner title={title} image={asset('bonus_meal.png')} key={title} />
          ))}
        </RuleGrid>
      </section>
      <section>
        <div className="page-pad">
          <SectionHeader title="Treat yourself" />
          <p className="t-Paragraph-Medium-Regular section-copy">
            Enjoy even more ways to earn points and the items you love.
          </p>
        </div>
        <Carousel label="Treat yourself">
          {BONUSES.slice(0, 3).map((title) => (
            <div className="carousel__item" style={{ width: 290 }} key={title}>
              <BonusCampaignBanner title={title} image={asset('bonus_meal.png')} expiry="Until 01 Dec 2026" />
            </div>
          ))}
        </Carousel>
      </section>
      <section className="section-pad">
        <div className="page-pad">
          <SectionHeader title="Deals" />
        </div>
        <Pills labels={DEAL_FILTERS} selected="Available now" />
        <RuleGrid layout={layout} component="deal_card" className="page-pad">
          {DEALS.map((deal) => (
            <DealCard name={deal.name} image={asset('deal_muffin_meal.png')} expiresSoon={deal.expiresSoon} key={deal.name} />
          ))}
        </RuleGrid>
      </section>
    </div>
  );
}
