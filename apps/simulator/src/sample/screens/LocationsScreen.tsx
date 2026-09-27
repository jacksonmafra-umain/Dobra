import type { Layout } from '@dobra/core/engine/layout';
import { MapCard, RestaurantCardSmall, SectionHeader } from '../components';
import { RESTAURANTS } from '../content';

/** List-detail: store list and store detail (map). One pane shows the detail, as Navigation 3 does. */
export function LocationsScreen({ layout }: { layout: Layout }) {
  const panes = layout.scene.panes;
  // Pane rectangles are in window coordinates; the content column starts after a leading rail or drawer.
  const columnX = layout.leadingNav ? layout.margin.left - layout.rule.pageMargin.base : 0;
  return (
    <div className="scene" data-scene={layout.scene.strategy} data-name=".Content/Locations">
      {panes.map((pane, i) => {
        return (
          <section
            className={`scene__pane scene__pane--${pane.role}`}
            style={{ left: pane.rect.x - columnX, width: pane.rect.width }}
            data-role={pane.role}
            key={i}
          >
            {pane.role === 'list' && (
              <div className="scene__inner section-pad">
                <SectionHeader title="Nearby" />
                {RESTAURANTS.map((r) => (
                  <RestaurantCardSmall restaurant={r} key={r.name} />
                ))}
                <p className="t-Paragraph-Medium-Regular empty-state" data-text-block>
                  You have not saved any favourite locations yet. Tap the heart on a location to find it here faster
                  next time.
                </p>
              </div>
            )}
            {(pane.role === 'detail' || pane.role === 'main') && (
              <div className="scene__inner section-pad">
                <SectionHeader title={RESTAURANTS[0].name} />
                <MapCard restaurants={RESTAURANTS} />
              </div>
            )}
            {pane.role === 'spare' && (
              <div className="scene__spare">Spare area (no Navigation 3 strategy for three panes)</div>
            )}
          </section>
        );
      })}
    </div>
  );
}
