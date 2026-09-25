// Sample design system components, named after their Figma components (data-name).
import { Children, useState, type CSSProperties, type ReactNode } from 'react';
import type { GridComponentId } from '../config/types';
import type { Layout } from '../engine/layout';
import { asset } from './assets';
import type { NewsStory, OrderLine, Restaurant, Reward } from './content';
import { FallbackIcon, Icon } from './icons';
import { ImReward } from './illustrations';

export function NewsStoryHero({
  hero,
  title,
  body,
  image,
}: {
  hero: Layout['hero'];
  title: string;
  body: string;
  image: string;
}) {
  return (
    <section className={`news_story_hero news_story_hero--${hero.variant}`} data-name="news_story_hero" data-bleed={hero.bleed}>
      <div className="news_story_hero__image" data-name="Card_image/15:10">
        <img src={image} alt="" />
      </div>
      <div className="news_story_hero__meta">
        <div className="news_story_hero__copy">
          <h2 className="t-H1">{title}</h2>
          <p className="t-Paragraph-Medium-Regular">{body}</p>
        </div>
        <BadgeIcon />
      </div>
    </section>
  );
}

export function BadgeIcon() {
  return (
    <span className="badge_icon" data-name="BadgeIcon">
      <img src={asset('ic_arrow_right_default_32.svg')} alt="" />
    </span>
  );
}

export function ActionCard({
  title,
  body,
  cta,
  illustration,
}: {
  title: string;
  body: string;
  cta: string;
  illustration: ReactNode;
}) {
  return (
    <article className="action_card" data-name="action_card">
      <div className="action_card__container">
        <div className="action_card__content">
          <h3 className="t-H2">{title}</h3>
          <p className="t-Paragraph-Medium-Regular">{body}</p>
        </div>
        {illustration}
      </div>
      <div className="action_card__button">
        <button className="floating_extrasmall t-Button" data-name="FloatingExtraSmall">
          {cta}
        </button>
      </div>
      <button className="round_icon_button" aria-label="Dismiss" data-name="round_icon_button">
        <FallbackIcon name="ic_close_default_32" />
      </button>
    </article>
  );
}

export function SectionHeader({ title, link }: { title: string; link?: string }) {
  return (
    <div className="section_header" data-name="section_header">
      <h2 className="section_header__title t-H2">{title}</h2>
      {link && (
        <button className="text_link t-Paragraph-Medium-Regular" data-name="TextLink">
          {link}
          <img src={asset('IcLinkArrow.svg')} alt="" />
        </button>
      )}
    </div>
  );
}

export function ShortcutCardItem({ label, illustration }: { label: string; illustration: ReactNode }) {
  return (
    <button className="shortcut_card_item" data-name="shortcut_card_item">
      {illustration}
      <span className="t-Paragraph-XSmall-Regular">{label}</span>
    </button>
  );
}

export function NewsStoryCard({ story }: { story: NewsStory }) {
  const tone = story.tone;
  return (
    <article className="news_story_card" data-name="NewsStoryCard">
      <div className="news_story_card__card">
        <div className="news_story_card__image" data-name="CardImage">
          <img src={story.image} alt="" />
          {tone && (
            <div
              className="news_story_card__gradient"
              style={{ background: `linear-gradient(to bottom, transparent, ${tone.bg})` }}
            />
          )}
        </div>
        <div className="news_story_card__meta" style={tone ? { background: tone.bg, color: tone.fg } : undefined}>
          <h3 className="t-H2">{story.title}</h3>
          {story.body && <p className="t-Paragraph-Medium-Regular">{story.body}</p>}
        </div>
      </div>
    </article>
  );
}

export function MapCard({ restaurants }: { restaurants: Restaurant[] }) {
  return (
    <div className="map_card" data-name="map_card">
      <div className="map_card__map">
        <img src={asset('CityLevel.png')} alt="" />
      </div>
      <img className="map_card__pin" style={{ left: '46%', top: '20%' }} src={asset('Pin2.svg')} alt="" />
      <img className="map_card__pin" style={{ left: '62%', top: '44%' }} src={asset('Pin3.svg')} alt="" />
      <img
        className="map_card__pin"
        style={{ left: '64%', top: '8%', width: 40, height: 40 }}
        src={asset('UserLocation.svg')}
        alt=""
      />
      <div className="restaurant_card_small_carousel">
        {restaurants.map((r) => (
          <RestaurantCardSmall restaurant={r} key={r.name} />
        ))}
      </div>
    </div>
  );
}

export function RestaurantCardSmall({ restaurant }: { restaurant: Restaurant }) {
  return (
    <div className="restaurant-card-small" data-name="restaurant-card-small">
      <div className="restaurant-card-small__top">
        <h3 className="restaurant-card-small__name t-H3">{restaurant.name}</h3>
        <span className="generic_label t-Paragraph-Medium-Regular tnum">{restaurant.distance}</span>
      </div>
      <div className="restaurant-card-small__meta t-Paragraph-Medium-Regular">
        <span>{restaurant.address}</span>
        <span className="tnum">{restaurant.hours}</span>
      </div>
      <button className="floating_small t-Button" data-name="FloatingSmall">
        <span>Order here</span>
      </button>
    </div>
  );
}

export function Pagination({ pages, selected }: { pages: number; selected: number }) {
  return (
    <div className="pagination" data-name="Pagination">
      {Array.from({ length: pages }, (_, i) =>
        i === selected ? (
          <img src={asset('SelectedDot.svg')} width={12} height={12} alt="" key={i} />
        ) : (
          <img src={asset('BuildingBlockPaginatorItem.svg')} width={8} height={8} alt="" key={i} />
        ),
      )}
    </div>
  );
}

const SOCIAL_LINKS: [string, string | null][] = [
  ['Youtube', null],
  ['Snapchat', null],
  ['Instagram', 'IcSocialMediaInstagram32.svg'],
  ['TikTok', null],
  ['Facebook', 'IcSocialMediaFacebook32.svg'],
  ['LinkedIn', 'IcSocialMediaLinkedin32.svg'],
  ['X', 'IcSocialMediaX32.svg'],
  ["Sample Store", 'ic_logo_default_32.svg'],
];

export function SocialMediaSection() {
  return (
    <section className="social_media_section" data-name=".Social_Media_Section">
      <SectionHeader title="Follow us in social media" />
      <div className="social_media_section__list">
        {SOCIAL_LINKS.map(([name, icon]) => (
          <button className="social_media_card" data-name="SocialMediaCard" key={name}>
            <span className="round_icon_button" data-name="RoundIconButton">
              {icon ? (
                <img src={asset(icon)} alt="" />
              ) : (
                <span className="t-H4" data-missing-icon>
                  {name[0]}
                </span>
              )}
            </span>
            <span className="t-Paragraph-Small-Regular">{name}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function ContentFooter() {
  return (
    <footer className="content_footer" data-name="content_footer">
      <div>
        <p className="t-H4">That's all for now.</p>
        <p className="t-Paragraph-Medium-Regular" style={{ color: 'var(--fg-secondary)' }}>
          Check in again soon for more!
        </p>
      </div>
      <button className="round_icon_button" aria-label="Refresh" data-name="RoundIconButton">
        <FallbackIcon name="ic_refresh_default_32" />
      </button>
    </footer>
  );
}

export function OrderItem({ line }: { line: OrderLine }) {
  return (
    <article className="order_item" data-name="order_item">
      <img className="order_item__image" src={line.image} alt="" />
      <div className="order_item__copy">
        <h3 className="t-H4">{line.name}</h3>
        <p className="t-Paragraph-Small-Regular" style={{ color: 'var(--fg-secondary)' }}>
          {line.detail}
        </p>
        <span className="t-Paragraph-Medium-Bold tnum">{line.price}</span>
      </div>
      <Stepper value={line.qty} />
    </article>
  );
}

export function Stepper({ value }: { value: number }) {
  const [qty, setQty] = useState(value);
  return (
    <div className="stepper_v2" data-name="stepper_v2" data-state={qty <= 1 ? 'Min' : 'Default'}>
      <button aria-label="Decrease" onClick={() => setQty((q) => Math.max(1, q - 1))}>
        <Icon name="ic_minus_default_32" size={20} />
      </button>
      <span className="t-Paragraph-Medium-Bold tnum">{qty}</span>
      <button aria-label="Increase" onClick={() => setQty((q) => Math.min(9, q + 1))}>
        <Icon name="ic_plus_default_32" size={20} />
      </button>
    </div>
  );
}

export function OrderSummary({ rows }: { rows: [string, string, boolean?][] }) {
  return (
    <dl className="order_summary" data-name="order_item_detail">
      {rows.map(([label, value, total]) => (
        <div className={total ? 't-H4' : 't-Paragraph-Medium-Regular'} key={label}>
          <dt>{label}</dt>
          <dd className="tnum">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function OrderBottomButtonBar({ label, total, cta }: { label: string; total: string; cta: string }) {
  return (
    <div className="order_bottom_button_bar" data-name="order_bottom_button_bar/Default">
      <div>
        <span className="t-Paragraph-Small-Regular" style={{ color: 'var(--fg-secondary)' }}>
          {label}
        </span>
        <strong className="t-H3 tnum">{total}</strong>
      </div>
      <button className="flat flat--primary t-Button" data-name="flat">
        {cta}
      </button>
    </div>
  );
}

export function PickupOptionItem({ title, detail, selected }: { title: string; detail: string; selected?: boolean }) {
  return (
    <button
      className="pickup_option_item"
      aria-pressed={selected}
      data-name="pickup_option_item"
      data-state={selected ? 'Selected' : 'Idle'}
    >
      <span className="pickup_option_item__radio" aria-hidden />
      <span>
        <span className="t-H4">{title}</span>
        <span className="t-Paragraph-Small-Regular" style={{ color: 'var(--fg-secondary)', display: 'block' }}>
          {detail}
        </span>
      </span>
    </button>
  );
}

export function PaymentOption({ title, detail, selected }: { title: string; detail: string; selected?: boolean }) {
  return (
    <button className="payment_option" aria-pressed={selected} data-name="payment_option">
      <span className="payment_option__card" aria-hidden />
      <span className="payment_option__copy">
        <span className="t-Paragraph-Medium-Bold">{title}</span>
        <span className="t-Paragraph-Small-Regular" style={{ color: 'var(--fg-secondary)' }}>
          {detail}
        </span>
      </span>
      <Icon name="ic_chevron_right" size={16} />
    </button>
  );
}

export function FloatingJustifiedLarge({ label, value }: { label: string; value: string }) {
  return (
    <div className="floating_justified_large__wrap">
      <button className="floating_justified_large t-Button" data-name="floating_justified_large">
        <span>{label}</span>
        <span className="tnum">{value}</span>
      </button>
    </div>
  );
}

/** Lays out items with the per-row count, max width and gap the active rule resolved for them. */
export function RuleGrid({
  layout,
  component,
  children,
  className = '',
}: {
  layout: Layout;
  component: GridComponentId;
  children: ReactNode;
  className?: string;
}) {
  const max = layout.maxItemWidth[component];
  const perRow = layout.perRow[component];
  const gap = layout.gap[component];
  const column = max ? `minmax(0, ${max}px)` : 'minmax(0, 1fr)';
  // Even grids on a folded display put their middle gutter over the fold.
  const foldSplit = !!layout.foldGutter && perRow % 2 === 0 && perRow > 0;
  const half = perRow / 2;
  const style: CSSProperties = {
    gridTemplateColumns: foldSplit
      ? `repeat(${half}, ${column}) ${Math.max(0, layout.foldGutter! - gap)}px repeat(${half}, ${column})`
      : `repeat(${perRow}, ${column})`,
    gap: `${gap}px`,
    justifyContent: foldSplit ? 'center' : 'start',
  };
  const items = Children.toArray(children);
  return (
    <div
      className={`rule-grid ${className}`}
      style={style}
      data-component={component}
      data-per-row={perRow}
      data-fold-split={foldSplit || undefined}
    >
      {foldSplit
        ? items.map((child, i) => {
            const col = i % perRow;
            return (
              <div className="rule-grid__cell" style={{ gridColumn: col < half ? col + 1 : col + 2 }} key={i}>
                {child}
              </div>
            );
          })
        : items}
    </div>
  );
}

export function InfoBanner({ children }: { children: ReactNode }) {
  return (
    <div className="info_banner t-Paragraph-Small-Regular" data-name="banner">
      <ImReward size={24} />
      <span>{children}</span>
    </div>
  );
}

export function LoyaltyCard({ code, copy }: { code: string; copy: string }) {
  return (
    <div className="loyalty-card" data-name="LoyaltyCard">
      <div className="loyalty-card__qr">
        <div className="code_card" data-name="code_card">
          <img src={asset('code_block.svg')} alt="Loyalty QR code" width={112} height={112} />
          <span className="t-H4 tnum">{code}</span>
        </div>
        <span className="loyalty-card__info" aria-label="About points">
          <Icon name="ic_information_default_32" size={32} />
        </span>
      </div>
      <p className="t-Paragraph-Medium-Regular">{copy}</p>
    </div>
  );
}

export function RewardCard({ reward }: { reward: Reward }) {
  const dim = reward.status === 'unavailable' || reward.status === 'locked';
  return (
    <article className={`reward_card${dim ? ' reward_card--dim' : ''}`} data-name="RewardCard" data-status={reward.status}>
      <div className="reward_card__top">
        <img className="reward_card__image" src={reward.image} alt="" />
        {(reward.status === 'unavailable' || reward.status === 'active') && (
          <span className="status_label t-Paragraph-Small-Bold" data-name="StatusLabel">
            {reward.status === 'active' ? 'Active' : 'Unavailable'}
          </span>
        )}
        <span
          className={`points_badge_small t-Paragraph-Medium-Bold tnum${reward.unused && !dim ? ' points_badge_small--reward' : ''}`}
          data-name="PointsBadgeSmall"
        >
          {reward.status === 'locked' && <Icon name="ic_reward_locked_16" size={12} />}
          {reward.badge}
        </span>
      </div>
      <div className="reward_card__bottom t-Paragraph-Medium-Bold">{reward.name}</div>
    </article>
  );
}

export function NotUsedRewardsBlock() {
  return (
    <div className="not_used_rewards_block" data-name="not_used _rewards_block">
      <div className="not_used_rewards_block__stack">
        <span />
        <img src={asset('reward_fries.png')} alt="" />
      </div>
      <p className="t-Paragraph-Small-Regular">
        <strong className="t-Paragraph-Small-Bold">You have redeemed rewards that you have not used yet</strong> – go get
        them!
      </p>
      <span className="round_icon_button round_icon_button--brand" aria-hidden>
        <Icon name="ic_arrow_right_default_32" />
      </span>
    </div>
  );
}

export function BonusCampaignBanner({ title, image, expiry }: { title: string; image: string; expiry?: string }) {
  return (
    <article className="bonus_campaign_banner" data-name="GenericCampaignBanner">
      <div className="bonus_campaign_banner__copy">
        <h3 className="t-Paragraph-Medium-Bold">{title}</h3>
        {expiry && (
          <span className="t-Paragraph-XSmall-Regular" style={{ color: 'var(--fg-secondary)' }}>
            {expiry}
          </span>
        )}
      </div>
      <img className="bonus_campaign_banner__image" src={image} alt="" />
      <span className="bonus_campaign_banner__stripe" data-name="Bottom Stripe" />
    </article>
  );
}

export function Pills({ labels, selected }: { labels: string[]; selected?: string }) {
  const [current, setCurrent] = useState(selected);
  return (
    <div className="pills" data-name="Pills" role="tablist">
      {labels.map((label) => (
        <button
          className="filter_pill t-Paragraph-Small-Regular"
          aria-selected={label === current}
          data-name="filter_pill"
          onClick={() => setCurrent(label)}
          key={label}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function DealCard({ name, image, expiresSoon }: { name: string; image: string; expiresSoon: boolean }) {
  return (
    <article className="deal_card" data-name="DealCard">
      <div className="deal_card__image">
        <img src={image} alt="" />
        {expiresSoon && (
          <span className="deal_label t-Paragraph-Small-Regular" data-name="DealLabel">
            <Icon name="ic_deal_timeout_16" size={16} /> Expires soon
          </span>
        )}
      </div>
      <div className="deal_card__meta">
        <h3 className="t-H3">{name}</h3>
      </div>
    </article>
  );
}

export function Carousel({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="carousel" aria-label={label} data-name="carousel">
      {children}
    </div>
  );
}

