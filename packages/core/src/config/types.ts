// Types of the catalog and app profile, derived from the schema so the two cannot drift apart.
import type { SimulatorConfig } from './schema';

export type { ComponentKind, FlexFormRule, GridFormRule, GridRule, HeroRule, Platform, SimulatorConfig, TabBarRule } from './schema';
export { PLATFORMS } from './schema';

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

export type IosProfile = SimulatorConfig['platforms']['ios'];
export type AndroidProfile = SimulatorConfig['platforms']['android'];
export type DeviceSpec = SimulatorConfig['devices'][number];
export type IosDeviceSpec = Extract<DeviceSpec, { platform: 'ios' }>;
export type DisplaySpec = IosDeviceSpec['displays'][string];
export type OrientationSpec = NonNullable<DisplaySpec['orientations']['portrait']>;
export type SafeArea = OrientationSpec['safeArea'];
export type UIKitSizeClass = OrientationSpec['sizeClass'];
export type ReservedRegionSpec = NonNullable<DisplaySpec['reservedRegions']>[number];
export type PoseSpec = NonNullable<IosDeviceSpec['poses']>[number];
export type LayoutRule = SimulatorConfig['layoutRules'][number];
export type ComponentSpec = SimulatorConfig['components'][string];
export type ScreenSpec = SimulatorConfig['screens'][number];
export type ToolbarSpec = ScreenSpec['toolbar'];
export type ToolbarItemSpec = ToolbarSpec['items'][number];
export type ToolbarGroup = ToolbarItemSpec['group'];
export type TabItemSpec = SimulatorConfig['tabBar']['items'][number];
export type VerticalBarsSpec = IosProfile['verticalBars'];
