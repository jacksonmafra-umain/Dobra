import type { Layout } from '@hinge/core/engine/layout';
import { asset } from '../assets';
import {
  ActionCard,
  ContentFooter,
  MapCard,
  NewsStoryCard,
  NewsStoryHero,
  Pagination,
  RuleGrid,
  SectionHeader,
  ShortcutCardItem,
  SocialMediaSection,
} from '../components';
import { NEWS_STORIES, RESTAURANTS } from '../content';
import { ImBag, ImDeals, ImLocalDeals, ImReward } from '../illustrations';

export function HomeScreen({ layout }: { layout: Layout }) {
  return (
    <div className="content-home" data-name=".Content/Home">
      <NewsStoryHero
        hero={layout.hero}
        title="Your Classic Burger, your way"
        body="Order ahead and skip the queue"
        image={asset('CardImage1510.png')}
      />
      <RuleGrid layout={layout} component="action_card" className="page-pad section-pad">
        <ActionCard
          title="Deals on the move"
          body="Turn on location to see deals from restaurants near you."
          cta="Let's go"
          illustration={<ImLocalDeals size={133} />}
        />
      </RuleGrid>
      <section className="shortcuts_section" data-name=".Shortcuts_section">
        <SectionHeader title="How about" />
        <RuleGrid layout={layout} component="shortcut_card_item">
          <ShortcutCardItem label="Order to pickup" illustration={<ImBag />} />
          <ShortcutCardItem label="Find deals" illustration={<ImDeals />} />
          <ShortcutCardItem label="Explore rewards" illustration={<ImReward />} />
        </RuleGrid>
      </section>
      <RuleGrid layout={layout} component="news_story_card" className="page-pad news_story_card_list">
        {NEWS_STORIES.map((story, i) => (
          <NewsStoryCard story={story} key={i} />
        ))}
      </RuleGrid>
      <section className="map_section" data-name="MapCardContentBlock">
        <SectionHeader title="Sample Store nearby" link="View all" />
        <MapCard restaurants={RESTAURANTS} />
        <Pagination pages={3} selected={0} />
      </section>
      <SocialMediaSection />
      <ContentFooter />
    </div>
  );
}
