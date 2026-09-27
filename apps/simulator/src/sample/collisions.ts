// Finds important elements that sit in the fold or in a reserved region, and outlines them in red.
import { useEffect, useRef, type RefObject } from 'react';
import { collisionZones, findCollisions, type CollisionSubject } from '@dobra/core/collisions';
import type { Environment } from '@dobra/core/engine/environment';

export { rectsOverlap, spansOverlap } from '@dobra/core/collisions';

export interface Collision {
  region: string;
  element: string;
}

const IMPORTANT_SELECTOR = [
  'button',
  'h1',
  'h2',
  'h3',
  '[data-name="action_card"]',
  '[data-name="DealCard"]',
  '[data-name="RewardCard"]',
  '[data-name="NewsStoryCard"]',
  '[data-name="GenericCampaignBanner"]',
  '[data-name="shortcut_card_item"]',
  '[data-name="order_item"]',
  '[data-name="pickup_option_item"]',
  '[data-name="payment_option"]',
  '[data-name="LoyaltyCard"]',
  '[data-name="floating_justified_large"]',
  '[data-name="order_bottom_button_bar/Default"]',
  '.modal-alert',
  '.modal-sheet',
].join(',');

/** Containers whose content is chrome or scrolls sideways, so a collision there is expected. */
const IGNORED_CONTAINERS = '.vertical-rail, .chrome-status, .carousel, .pills, .restaurant_card_small_carousel, .modal-scrim';

export function useCollisions(
  root: RefObject<HTMLElement | null>,
  env: Environment,
  deps: unknown[],
  onChange: (collisions: Collision[]) => void,
) {
  const last = useRef('');
  useEffect(() => {
    const host = root.current;
    if (!host) return;
    const zones = collisionZones(env);

    let frame = 0;
    const measure = () => {
      frame = 0;
      const box = host.getBoundingClientRect();
      const scale = box.width / env.width || 1;
      const subjects: CollisionSubject[] = [];
      const byId: HTMLElement[] = [];
      const elements = Array.from(host.querySelectorAll<HTMLElement>(IMPORTANT_SELECTOR));
      const important = new Set<Element>(elements);
      for (const el of elements) {
        el.removeAttribute('data-collision');
        if (el.closest(IGNORED_CONTAINERS) && !el.matches('.modal-alert, .modal-sheet')) continue;
        // Report the outermost important element only.
        let parent = el.parentElement;
        let nested = false;
        while (parent && parent !== host) {
          if (important.has(parent)) {
            nested = true;
            break;
          }
          parent = parent.parentElement;
        }
        if (nested) continue;
        const r = el.matches('h1, h2, h3') ? textRect(el) : el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const rect = {
          x: (r.left - box.left) / scale,
          y: (r.top - box.top) / scale,
          width: r.width / scale,
          height: r.height / scale,
        };
        subjects.push({ id: String(byId.length), rect, scrolls: !!el.closest('.screen__scroll') });
        byId.push(el);
      }
      const found: Collision[] = findCollisions(subjects, zones).map((hit) => {
        const el = byId[Number(hit.id)];
        el.setAttribute('data-collision', hit.zone);
        return { region: hit.zone, element: describeElement(el) };
      });
      const key = JSON.stringify(found);
      if (key !== last.current) {
        last.current = key;
        onChange(found);
      }
    };
    const schedule = () => {
      frame ||= requestAnimationFrame(measure);
    };
    schedule();
    const scroller = host.querySelector('.screen__scroll');
    scroller?.addEventListener('scroll', schedule, { passive: true });
    const late = setTimeout(schedule, 300);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(late);
      scroller?.removeEventListener('scroll', schedule);
      host.querySelectorAll('[data-collision]').forEach((el) => el.removeAttribute('data-collision'));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function describeElement(el: Element): string {
  const name = el.getAttribute('data-name') ?? el.tagName.toLowerCase();
  const text = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 32);
  return text ? `${name} "${text}"` : name;
}

/** Headings stretch to their container; measure the text itself. */
export function textRect(el: Element): DOMRect {
  const range = document.createRange();
  range.selectNodeContents(el);
  return range.getBoundingClientRect();
}
