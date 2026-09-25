// Shape of simulator.config.json. Everything the simulator shows is driven from the config.

export type SizeClassValue = 'compact' | 'regular';
export type Orientation = 'portrait' | 'landscape';
export type BarAxis = 'horizontal' | 'vertical';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface SafeArea {
  top: number;
  right: number;
  bottom: number;
  left: number;
  source: string;
}

export interface UIKitSizeClass {
  horizontal: SizeClassValue;
  vertical: SizeClassValue;
  estimated?: boolean;
}

export interface OrientationSpec {
  $comment?: string;
  sizeClass: UIKitSizeClass;
  barAxis: BarAxis;
  safeArea: SafeArea;
  statusBar: boolean;
}

export type Anchor = 'top-left' | 'top-right';

export interface ReservedRegionSpec {
  id: string;
  label: string;
  when: 'always' | 'camera-active';
  anchor: Anchor | Partial<Record<Orientation, Anchor>>;
  width: number;
  height: number;
  offsetTop: number;
  liveActivity?: { width: number; height: number; offsetTop: number; $comment?: string };
  estimated?: boolean;
  $comment?: string;
}

export interface DisplaySpec {
  label: string;
  portraitSize: Size;
  pixels?: Size;
  scale: number;
  estimated: boolean;
  cornerRadius: number;
  homeIndicator: boolean;
  orientations: Partial<Record<Orientation, OrientationSpec>>;
  hardware: {
    dynamicIsland: { width: number; height: number; offset: number } | null;
    camera?: { diameter: number; region: number; $comment?: string };
    fold?: { width: number; estimated?: boolean; $comment?: string };
  };
  reservedRegions?: ReservedRegionSpec[];
}

export interface PoseSpec {
  id: string;
  label: string;
  display: string;
  folded: boolean;
  orientations: Orientation[];
  estimated?: boolean;
  $comment?: string;
}

export interface DeviceSpec {
  id: string;
  name: string;
  enabled: boolean;
  displays: Record<string, DisplaySpec>;
  poses?: PoseSpec[];
}

export interface ComponentRule {
  perRow: number;
  minItemWidth?: number;
  maxItemWidth?: number;
  $comment?: string;
}

export interface LayoutRule {
  id: string;
  label: string;
  match: { horizontal?: SizeClassValue; vertical?: SizeClassValue };
  pageMargin: { base: number; mode: 'max' | 'add'; $comment?: string };
  grid: { columns: number; gutter: number; proposed?: boolean };
  panes: number;
  components: {
    news_story_hero: { variant: 'stacked' | 'split'; bleed: 'full' | 'inset' };
    'restaurant-card-small': { mode: 'carousel' };
    tab_bar_26: { item: 'stacked' | 'inline'; $comment?: string };
  } & Record<GridComponentId, ComponentRule>;
}

export const GRID_COMPONENTS = [
  'action_card',
  'shortcut_card_item',
  'news_story_card',
  'reward_card',
  'deal_card',
  'bonus_campaign_banner',
] as const;
export type GridComponentId = (typeof GRID_COMPONENTS)[number];

export type ToolbarGroup = 'navigation' | 'prominent' | 'secondary';

export interface ToolbarItemSpec {
  id: string;
  title: string;
  symbol: string | null;
  label: 'symbol' | 'text';
  group: ToolbarGroup;
  priority: number;
  badge?: boolean;
}

export interface ToolbarSpec {
  component: 'app_toolbar' | 'toolbar';
  logo?: string;
  type?: string;
  title?: string;
  items: ToolbarItemSpec[];
}

export interface ScreenSpec {
  id: string;
  name: string;
  experience: 'navigation' | 'task';
  tab: string;
  enabled: boolean;
  figma: ({ portrait?: string; landscape?: string; $comment?: string }) | null;
  source?: string;
  components: string[];
  toolbar: ToolbarSpec;
}

export interface TabItemSpec {
  id: string;
  title: string;
  icon: string;
  iconSelected?: string;
}

export interface VerticalBarsSpec {
  $comment?: string;
  estimated: boolean;
  railWidth: number;
  statusRegion: number;
  toolbarItem: number;
  groupGap: number;
  overflowButton: number;
  tabItem: number;
  tabItemGap: number;
  tabBarMinimized: number;
  minGapBetweenBars: number;
}

export interface SimulatorConfig {
  $comment?: string;
  version: string;
  figmaFile: string;
  sources: Record<string, string>;
  freeResize: { $comment?: string; regularWidthMin: number; regularHeightMin: number; barAxis: BarAxis };
  verticalBars: VerticalBarsSpec;
  fold: {
    $comment?: string;
    balanceMargins: boolean;
    evenGridGutterAtFold: boolean;
    modalPlacement: { vertical: string; horizontal: string };
  };
  devices: DeviceSpec[];
  layoutRules: LayoutRule[];
  tabBar: { component: string; items: TabItemSpec[] };
  screens: ScreenSpec[];
}
