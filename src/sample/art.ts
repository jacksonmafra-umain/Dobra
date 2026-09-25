// Neutral generated art for the sample app. Every image is an SVG built here, so the repo ships
// no third-party image files.

type Art = { kind: 'photo'; hue: number } | { kind: 'glyph'; d: string } | { kind: 'shape'; body: string };

const photo = (hue: number): Art => ({ kind: 'photo', hue });
const glyph = (d: string): Art => ({ kind: 'glyph', d });
const shape = (body: string): Art => ({ kind: 'shape', body });

const GLYPHS = {
  chevron: 'M9 6l6 6-6 6',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  info: 'M12 8h.01M11 11h1v6h1M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
  clock: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z',
  pin: 'M12 21s-6-5.3-6-11a6 6 0 0 1 12 0c0 5.7-6 11-6 11ZM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2z',
  tag: 'M3 12V4h8l10 10-8 8L3 12ZM7.5 7.5h.01',
  bag: 'M5 8h14l-1 12H6L5 8ZM9 8a3 3 0 0 1 6 0',
  plate: 'M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  dots: 'M6 12h.01M12 12h.01M18 12h.01',
  logo: 'M4 18V6l8 8 8-8v12',
  dot: 'M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  social: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
} as const;

/** Soft filled shapes for the decorative layers of the illustrations. */
const SHAPES = {
  circle: '<circle cx="12" cy="12" r="10" fill="currentColor" opacity=".35"/>',
  ring: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" opacity=".5"/>',
  square: '<rect x="3" y="3" width="18" height="18" rx="4" fill="currentColor" opacity=".35"/>',
  pill: '<rect x="2" y="8" width="20" height="8" rx="4" fill="currentColor" opacity=".3"/>',
  shadow: '<ellipse cx="12" cy="20" rx="9" ry="2" fill="#000" opacity=".15"/>',
} as const;

/** Every art name the sample app asks for, without extension. */
const ART: Record<string, Art> = {
  // Photos: product and card imagery.
  CardImage: photo(20), CardImage1510: photo(200), CardImage1511: photo(140), CityLevel: photo(100),
  bonus_meal: photo(30), deal_muffin_meal: photo(45), reward_burger: photo(15),
  reward_egg_muffin: photo(50), reward_fries: photo(40), reward_combo_meal: photo(10),
  reward_small_coffee: photo(25),
  // Icons.
  IcChevronRight: glyph(GLYPHS.chevron), IcLinkArrow: glyph(GLYPHS.arrow),
  IcQrCodeDefault32: glyph(GLYPHS.qr), code_block: glyph(GLYPHS.qr),
  ic_arrow_right_default_32: glyph(GLYPHS.arrow), ic_information_default_32: glyph(GLYPHS.info),
  ic_deal_timeout_16: glyph(GLYPHS.clock), ic_reward_locked_16: glyph(GLYPHS.lock),
  ic_location_default_32: glyph(GLYPHS.pin), ic_deals_32: glyph(GLYPHS.tag),
  ic_food_32: glyph(GLYPHS.plate), ic_order_32: glyph(GLYPHS.bag), ic_more_32: glyph(GLYPHS.dots),
  ic_logo_filled_32: glyph(GLYPHS.logo), ic_logo_default_32: glyph(GLYPHS.logo),
  ic_logo_default_mask_32: glyph(GLYPHS.logo), ImSampleLogo: glyph(GLYPHS.logo),
  member_logo_group: glyph(GLYPHS.logo), member_logo_vector: glyph(GLYPHS.logo),
  ImDeals: glyph(GLYPHS.tag), Bag: glyph(GLYPHS.bag), UserLocation: glyph(GLYPHS.dot),
  SelectedDot: glyph(GLYPHS.dot), BuildingBlockPaginatorItem: glyph(GLYPHS.dot),
  Pin2: glyph(GLYPHS.pin), Pin3: glyph(GLYPHS.pin), MapPinSingleDefault: glyph(GLYPHS.pin),
  LocationPinWithShadows: glyph(GLYPHS.pin), IcSocialMediaFacebook32: glyph(GLYPHS.social),
  IcSocialMediaInstagram32: glyph(GLYPHS.social), IcSocialMediaLinkedin32: glyph(GLYPHS.social),
  IcSocialMediaX32: glyph(GLYPHS.social),
  // Decorative layers of the illustrations.
  Box: shape(SHAPES.square), CombinedShape: shape(SHAPES.circle), CombinedShape1: shape(SHAPES.circle),
  Ellipse73Stroke: shape(SHAPES.ring), Ellipse99: shape(SHAPES.circle), Fries: shape(SHAPES.pill),
  Group: shape(SHAPES.square), Group1: shape(SHAPES.circle), IllustrationsProducts: shape(SHAPES.square),
  Image: shape(SHAPES.square), Mark: shape(SHAPES.pill), Shadow: shape(SHAPES.shadow),
  UnionStroke: shape(SHAPES.ring), Vector: shape(SHAPES.circle), Vector1: shape(SHAPES.circle),
  Vector2: shape(SHAPES.circle), Vector3: shape(SHAPES.circle), VectorStroke: shape(SHAPES.ring),
};

function render(art: Art): string {
  switch (art.kind) {
    case 'photo':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${art.hue} 70% 72%)"/><stop offset="1" stop-color="hsl(${art.hue + 30} 60% 48%)"/></linearGradient></defs><rect width="160" height="120" fill="url(#g)"/><circle cx="80" cy="64" r="30" fill="hsl(${art.hue} 40% 92% / .55)"/></svg>`;
    case 'glyph':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${art.d}"/></svg>`;
    case 'shape':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" color="#8a8a8a" preserveAspectRatio="none">${art.body}</svg>`;
  }
}

export const ART_NAMES: readonly string[] = Object.keys(ART);

/** A data URI for the named art, or undefined when the name is unknown. */
export function artUri(base: string): string | undefined {
  const art = ART[base];
  return art && `data:image/svg+xml,${encodeURIComponent(render(art))}`;
}
