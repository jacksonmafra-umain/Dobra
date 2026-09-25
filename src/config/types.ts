// Types of simulator.config.json, derived from the schema so the two cannot drift apart.
import type { z } from 'zod';
import type { configSchema } from './schema';

export { GRID_COMPONENTS, type GridComponentId, type SimulatorConfig } from './schema';

type Config = z.infer<typeof configSchema>;

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

export type DeviceSpec = Config['devices'][number];
export type DisplaySpec = DeviceSpec['displays'][string];
export type OrientationSpec = NonNullable<DisplaySpec['orientations']['portrait']>;
export type SafeArea = OrientationSpec['safeArea'];
export type UIKitSizeClass = OrientationSpec['sizeClass'];
export type ReservedRegionSpec = NonNullable<DisplaySpec['reservedRegions']>[number];
export type PoseSpec = NonNullable<DeviceSpec['poses']>[number];
export type LayoutRule = Config['layoutRules'][number];
export type ScreenSpec = Config['screens'][number];
export type ToolbarSpec = ScreenSpec['toolbar'];
export type ToolbarItemSpec = ToolbarSpec['items'][number];
export type ToolbarGroup = ToolbarItemSpec['group'];
export type TabItemSpec = Config['tabBar']['items'][number];
export type VerticalBarsSpec = Config['verticalBars'];
