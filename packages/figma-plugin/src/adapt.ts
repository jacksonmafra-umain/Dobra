// Adapt & flag: copy a frame to another target and do the mechanical work — resize, re-decorate,
// optionally split at the hinge, swap size/posture variants, switch variable modes — then check it.
// Everything that needs a design decision comes back as a flag.
import { adaptPlan, type AdaptPlan } from '@dobra/core/adapt';
import { kindOf } from '@dobra/core/coverage';
import type { Finding } from '@dobra/core/engine/checks';
import { presetSpec } from '@dobra/core/presets';
import { check } from '@dobra/core/rules';
import { resolveTarget, targetKey, type Target } from '@dobra/core/targets';
import type { FigmaApi } from './api';
import { catalog, config } from './catalog';
import { toGeo } from './geo';
import { filePatterns } from './patterns';
import { deviceModes, dobraKeyOf } from './variables';
import { decorate, nextFreeX, OVERLAY_NAME } from './presets';

const GAP = 80;
const ADAPTABLE_PROPS = ['Size', 'Posture'];

/** Children pinned top-left outside auto layout: they do not follow a resize. */
function fixedChildren(frame: FrameNode): string[] {
  if (frame.layoutMode !== 'NONE') return [];
  return frame.children
    .filter((c) => c.name !== OVERLAY_NAME && 'constraints' in c && c.constraints.horizontal === 'MIN' && c.constraints.vertical === 'MIN')
    .map((c) => c.id);
}

/** Children that resize with the frame: stretching constraints, or any child of an auto-layout frame. */
function stretchingChildren(frame: FrameNode): string[] {
  const reflows = frame.layoutMode !== 'NONE';
  return frame.children
    .filter((c) => c.name !== OVERLAY_NAME)
    .filter((c) => reflows || ('constraints' in c && ['STRETCH', 'LEFT_RIGHT', 'SCALE'].includes(c.constraints.horizontal)))
    .map((c) => c.id);
}

/** The variant options a component property offers, read from the instance's component set. */
async function variantOptionsOf(instance: InstanceNode, prop: string): Promise<string[]> {
  const main = await instance.getMainComponentAsync();
  const set = main?.parent;
  if (!set || set.type !== 'COMPONENT_SET') return [];
  return set.componentPropertyDefinitions[prop]?.variantOptions ?? [];
}

function instancesIn(node: BaseNode & ChildrenMixin): InstanceNode[] {
  return node.children.flatMap((c) => (c.type === 'INSTANCE' ? [c] : 'children' in c ? instancesIn(c) : []));
}

function splitIntoPanes(api: FigmaApi, frame: FrameNode, split: NonNullable<AdaptPlan['split']>) {
  const vertical = split.axis === 'vertical';
  const along = vertical ? frame.width : frame.height;
  const across = vertical ? frame.height : frame.width;
  // Pane i runs from the end of the previous hinge to the start of the next one.
  const starts = [0, ...split.cuts.map((c) => c.at + c.gutter)];
  const ends = [...split.cuts.map((c) => c.at), along];
  const panes = api.createFrame();
  panes.name = 'Panes';
  panes.fills = [];
  panes.layoutMode = vertical ? 'HORIZONTAL' : 'VERTICAL';
  panes.itemSpacing = split.cuts[0].gutter;
  panes.primaryAxisSizingMode = 'FIXED';
  panes.counterAxisSizingMode = 'FIXED';
  panes.resize(frame.width, frame.height);
  const content = frame.children.filter((c) => c.name !== OVERLAY_NAME);
  frame.appendChild(panes);
  panes.x = 0;
  panes.y = 0;
  const cells = starts.map((start, i) => {
    const pane = api.createFrame();
    pane.name = `Pane ${i + 1}`;
    pane.fills = [];
    pane.clipsContent = false;
    const size = ends[i] - start;
    pane.resize(vertical ? size : across, vertical ? across : size);
    panes.appendChild(pane);
    return { pane, start, end: ends[i] };
  });
  for (const child of content) {
    const centre = vertical ? child.x + child.width / 2 : child.y + child.height / 2;
    const cell = cells.find((c) => centre < c.end) ?? cells[cells.length - 1];
    cell.pane.appendChild(child);
    if (vertical) child.x -= cell.start;
    else child.y -= cell.start;
  }
}

export async function adaptFrame(
  api: FigmaApi,
  frameId: string,
  target: Target,
  opts: { split: boolean },
): Promise<{ frame: FrameNode; plan: AdaptPlan; findings: Finding[] }> {
  const src = await api.getNodeByIdAsync(frameId);
  if (!src || src.type !== 'FRAME') throw new Error(`Frame ${frameId} not found`);
  const env = resolveTarget(config, target);
  const x = nextFreeX(api, GAP);
  const frame = src.clone();
  frame.x = x;
  frame.y = src.y;

  const plan = adaptPlan(config, { width: src.width, height: src.height, root: await toGeo(src, undefined, 500, filePatterns(api)), fixed: fixedChildren(src), stretching: stretchingChildren(src) }, target, opts);

  frame.children.find((c) => c.name === OVERLAY_NAME)?.remove();
  frame.resize(plan.width, plan.height);
  if (plan.split) splitIntoPanes(api, frame, plan.split);
  const preset = presetSpec(config, target);
  frame.name = `${src.name} — ${preset.name.replace(/^Screen \/ /, '')}`;
  decorate(api, frame, preset, catalog.version);

  // Variants and variable modes named after the new size class or posture.
  const sizeClass = env.sizeClass.system === 'window' ? env.sizeClass.width : env.sizeClass.horizontal;
  const wanted = [sizeClass, kindOf(config, target)].map((v) => v.toLowerCase());
  for (const instance of instancesIn(frame)) {
    for (const prop of ADAPTABLE_PROPS) {
      if (!(prop in instance.componentProperties)) continue;
      const option = (await variantOptionsOf(instance, prop)).find((o) => wanted.includes(o.toLowerCase()));
      if (option) instance.setProperties({ [prop]: option });
    }
  }
  for (const collection of await api.variables.getLocalVariableCollectionsAsync()) {
    // Dobra's size-class collections are per platform: never switch the other platform's one.
    const dobraKey = dobraKeyOf(collection);
    if (dobraKey.startsWith('size-classes/') && !dobraKey.startsWith(`size-classes/${env.platform}`)) continue;
    const mode = collection.modes.find((m) => m.name.toLowerCase() === sizeClass.toLowerCase());
    if (mode) frame.setExplicitVariableModeForCollection(collection, mode.modeId);
  }
  // Dobra's device collections hold one mode per target: follow the device the frame was adapted to.
  for (const { collection, modes } of await deviceModes(api)) {
    const modeId = modes[targetKey(target)];
    if (modeId) frame.setExplicitVariableModeForCollection(collection, modeId);
  }

  const subject = { source: 'figma' as const, ref: frame.id, targets: [target], confidence: 'tag' as const, width: frame.width, height: frame.height, root: await toGeo(frame, undefined, 500, filePatterns(api)) };
  return { frame, plan, findings: check(subject, config) };
}
