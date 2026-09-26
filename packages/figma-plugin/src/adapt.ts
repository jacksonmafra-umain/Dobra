// Adapt & flag: copy a frame to another target and do the mechanical work — resize, re-decorate,
// optionally split at the hinge, swap size/posture variants, switch variable modes — then check it.
// Everything that needs a design decision comes back as a flag.
import { adaptPlan, type AdaptPlan } from '@hinge/core/adapt';
import { kindOf } from '@hinge/core/coverage';
import type { Finding } from '@hinge/core/engine/checks';
import { presetSpec } from '@hinge/core/presets';
import { check } from '@hinge/core/rules';
import { resolveTarget, type Target } from '@hinge/core/targets';
import type { FigmaApi } from './api';
import { catalog, config } from './catalog';
import { toGeo } from './geo';
import { decorate, OVERLAY_NAME } from './presets';

const GAP = 80;
const ADAPTABLE_PROPS = ['Size', 'Posture'];

/** Children pinned top-left outside auto layout: they do not follow a resize. */
function fixedChildren(frame: FrameNode): string[] {
  if (frame.layoutMode !== 'NONE') return [];
  return frame.children
    .filter((c) => c.name !== OVERLAY_NAME && 'constraints' in c && c.constraints.horizontal === 'MIN' && c.constraints.vertical === 'MIN')
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
  const panes = api.createFrame();
  panes.name = 'Panes';
  panes.fills = [];
  panes.layoutMode = vertical ? 'HORIZONTAL' : 'VERTICAL';
  panes.itemSpacing = split.gutter;
  panes.primaryAxisSizingMode = 'FIXED';
  panes.counterAxisSizingMode = 'FIXED';
  panes.resize(frame.width, frame.height);
  const content = frame.children.filter((c) => c.name !== OVERLAY_NAME);
  frame.appendChild(panes);
  panes.x = 0;
  panes.y = 0;
  const [first, second] = ['Pane 1', 'Pane 2'].map((name) => {
    const pane = api.createFrame();
    pane.name = name;
    pane.fills = [];
    pane.clipsContent = false;
    panes.appendChild(pane);
    pane.layoutGrow = 1;
    return pane;
  });
  const secondStart = split.at + split.gutter;
  for (const child of content) {
    const centre = vertical ? child.x + child.width / 2 : child.y + child.height / 2;
    const inSecond = centre >= split.at;
    (inSecond ? second : first).appendChild(child);
    if (inSecond) {
      if (vertical) child.x -= secondStart;
      else child.y -= secondStart;
    }
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
  const frame = src.clone();
  frame.x = src.x + src.width + GAP;
  frame.y = src.y;

  const plan = adaptPlan(config, { width: src.width, height: src.height, root: await toGeo(src), fixed: fixedChildren(src) }, target, opts);

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
    const mode = collection.modes.find((m) => m.name.toLowerCase() === sizeClass.toLowerCase());
    if (mode) frame.setExplicitVariableModeForCollection(collection, mode.modeId);
  }

  const subject = { source: 'figma' as const, ref: frame.id, targets: [target], confidence: 'tag' as const, width: frame.width, height: frame.height, root: await toGeo(frame) };
  return { frame, plan, findings: check(subject, config) };
}
