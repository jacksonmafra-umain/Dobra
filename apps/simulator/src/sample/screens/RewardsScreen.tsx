import type { Layout } from '@dobra/core/engine/layout';
import { Pills, RewardCard, RuleGrid, SectionHeader } from '../components';
import { REDEEMABLE_REWARDS, UNUSED_REWARDS } from '../content';

export function RewardsScreen({ layout }: { layout: Layout }) {
  return (
    <div className="content-stack content-stack--white" data-name=".content/.RewardsList">
      <Pills labels={['Redeemable now']} />
      <section className="page-pad section-pad">
        <SectionHeader title="Unused rewards" />
        <p className="t-Paragraph-Medium-Regular section-copy">
          Rewards you have previously redeemed for points but never used – redeem them again without spending more points.
        </p>
        <RuleGrid layout={layout} component="reward_card">
          {UNUSED_REWARDS.map((reward, i) => (
            <RewardCard reward={reward} key={i} />
          ))}
        </RuleGrid>
      </section>
      <section className="page-pad section-pad">
        <SectionHeader title="Redeem for points" />
        <RuleGrid layout={layout} component="reward_card">
          {REDEEMABLE_REWARDS.map((reward, i) => (
            <RewardCard reward={reward} key={i} />
          ))}
        </RuleGrid>
      </section>
    </div>
  );
}
