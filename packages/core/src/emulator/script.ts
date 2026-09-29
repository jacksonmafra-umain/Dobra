// An emulator plan as a POSIX sh script, for people without the Dobra repo. The CLI runs the same
// plan directly, so the two always agree.
import type { EmulatorPlan, EmulatorStep } from './plan';

export const shQuote = (s: string) => `'${s.replaceAll("'", "'\\''")}'`;

const VARS: Record<string, string> = { '{image}': '"$IMAGE"', '{runtime}': '"$RUNTIME"', '{udid}': '"$UDID"' };
const TOOLS: Record<string, string> = { avdmanager: '"$AVDMANAGER"', emulator: '"$EMULATOR"' };
/** Plain lowercase commands and flags (xcrun, simctl, create, -n, --force) stay bare; everything else is quoted. */
const BARE = /^-{0,2}[a-z][a-z-]*$/;
const word = (w: string, i: number): string => VARS[w] ?? (i === 0 ? TOOLS[w] : undefined) ?? (BARE.test(w) ? w : shQuote(w));
const command = (argv: string[]) => argv.map(word).join(' ');

function androidFind(api: number | null): string {
  return `WANT_API=${api ?? ''}
SDK="\${ANDROID_HOME:-\${ANDROID_SDK_ROOT:-}}"
if [ -z "$SDK" ]; then for d in "$HOME/Library/Android/sdk" "$HOME/Android/Sdk"; do if [ -d "$d" ]; then SDK="$d"; break; fi; done; fi
[ -n "$SDK" ] || { echo "No Android SDK: install Android Studio or set ANDROID_HOME." >&2; exit 1; }
# Apple silicon reports arm64 here even in a Rosetta terminal, where uname -m says x86_64.
if [ "$(uname -s)" = Darwin ] && [ "$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" = 1 ]; then ABI=arm64-v8a
else case "$(uname -m)" in arm64 | aarch64) ABI=arm64-v8a ;; *) ABI=x86_64 ;; esac; fi
IMAGE=""; BEST=0; OTHER=""
for dir in "$SDK"/system-images/android-*; do
  [ -d "$dir" ] || continue
  # android-36, android-36-ext18 and android-36.1 (a minor release) all count; 36.1 is newer than 36.
  ver=\${dir##*/android-}; ver=\${ver%%-*}
  MAJOR=\${ver%%.*}; MINOR=0
  case "$ver" in *.*) MINOR=\${ver#*.} ;; esac
  case "$MAJOR" in '' | *[!0-9]*) continue ;; esac
  case "$MINOR" in '' | *[!0-9]*) continue ;; esac
  if [ -n "$WANT_API" ] && [ "$MAJOR" != "$WANT_API" ]; then continue; fi
  SCORE=$((MAJOR * 100 + MINOR))
  for tag in google_apis_playstore google_apis default; do
    if [ -d "$dir/$tag/$ABI" ]; then
      if [ "$SCORE" -gt "$BEST" ]; then BEST=$SCORE; IMAGE="system-images;\${dir##*/};$tag;$ABI"; fi
      break
    fi
    for other in "$dir/$tag"/*; do if [ -d "$other" ]; then OTHER="$OTHER \${dir##*/}/$tag/\${other##*/}"; fi; done
  done
done
if [ -z "$IMAGE" ]; then
  if [ -n "$OTHER" ]; then echo "Installed images are for another processor:$OTHER" >&2; fi
  echo "No $ABI system image\${WANT_API:+ for API $WANT_API}. Install one with:" >&2
  echo "  \\"$SDK/cmdline-tools/latest/bin/sdkmanager\\" --install \\"system-images;android-\${WANT_API:-36};google_apis_playstore;$ABI\\"" >&2
  exit 1
fi
echo "Using $IMAGE"
AVDMANAGER="$SDK/cmdline-tools/latest/bin/avdmanager"
if [ ! -x "$AVDMANAGER" ]; then AVDMANAGER=$(command -v avdmanager) || { echo "avdmanager not found: install the Android SDK command-line tools." >&2; exit 1; }; fi
EMULATOR="$SDK/emulator/emulator"`;
}

function iosFind(runtime: string | null): string {
  // Newest first: sed picks the runtime ids, and the second sed reverses the list.
  const list = runtime
    ? shQuote(runtime)
    : `$(xcrun simctl list runtimes | sed -n 's/.*\\(com\\.apple\\.CoreSimulator\\.SimRuntime\\.iOS-[0-9-]*\\).*/\\1/p' | sed '1!G;h;$!d')`;
  return `command -v xcrun >/dev/null || { echo "Xcode is needed: install it from the App Store." >&2; exit 1; }
RUNTIMES=${list}
[ -n "$RUNTIMES" ] || { echo "No iOS simulator runtime: install one in Xcode, Settings, Components." >&2; exit 1; }`;
}

/** simctl create accepts duplicate names, so the script checks first, as the CLI does. */
function iosCreate(argv: string[], force: boolean): string {
  const [, , , name, type] = argv;
  const short = type.split('.').pop();
  return [
    `EXISTING=$(xcrun simctl list devices | awk -v n='    '${shQuote(name)}' (' 'index($0, n) == 1 { print substr($0, length(n) + 1, 36) }')`,
    force
      ? ''
      : `if [ -n "$EXISTING" ]; then echo ${shQuote(`A simulator named ${name} already exists. Pass --force to replace it.`)} >&2; exit 1; fi`,
    'UDID=""',
    'for RUNTIME in $RUNTIMES; do',
    `  UDID=$(${command(argv)} 2>/dev/null) && break`,
    '  UDID=""',
    'done',
    `[ -n "$UDID" ] || { echo ${shQuote(`No installed iOS runtime supports ${short}: a newer Xcode may be needed.`)} >&2; exit 1; }`,
    'echo "Using $RUNTIME"',
    // Replaced only once the new one exists, so a failed create keeps the old simulator.
    ...(force ? ['for u in $EXISTING; do xcrun simctl delete "$u"; done'] : []),
  ]
    .filter(Boolean)
    .join('\n');
}

const SET_KEY = `set_key() {
  awk -v k="$1" 'index($0, k "=") != 1' "$CONFIG" > "$CONFIG.tmp"
  printf '%s=%s\\n' "$1" "$2" >> "$CONFIG.tmp"
  mv "$CONFIG.tmp" "$CONFIG"
}`;

function step(s: EmulatorStep, plan: EmulatorPlan): string {
  switch (s.kind) {
    case 'find-image':
      return s.platform === 'android' ? androidFind(s.api) : iosFind(s.runtime);
    case 'run': {
      if (s.argv[0] === 'xcrun' && s.argv[2] === 'create') {
        const find = plan.steps.find((x) => x.kind === 'find-image');
        return iosCreate(s.argv, Boolean(find && find.platform === 'ios' && find.force));
      }
      return (s.input ? `printf ${shQuote(s.input.replace(/\n/g, '\\n'))} | ` : '') + command(s.argv);
    }
    case 'write-config':
      return [
        `CONFIG="\${ANDROID_AVD_HOME:-\${ANDROID_USER_HOME:-$HOME/.android}/avd}/"${shQuote(`${s.avd}.avd`)}"/config.ini"`,
        SET_KEY,
        ...Object.keys(s.settings)
          .sort()
          .map((k) => `set_key ${shQuote(k)} ${shQuote(s.settings[k])}`),
      ].join('\n');
    case 'print':
      return `printf '%s\\n' ${shQuote(s.text)}`;
  }
}

export function renderScript(plan: EmulatorPlan): string {
  const kind = plan.platform === 'android' ? 'Android emulator' : 'iOS simulator';
  return [
    '#!/bin/sh',
    'set -eu',
    `# ${plan.device.name}: an ${kind} from the Dobra catalog (dobra emulator script ${plan.device.id}).`,
    ...plan.steps.map((st) => step(st, plan)),
    ...plan.limits.map((l) => `printf '%s\\n' ${shQuote(`note: ${l}`)}`),
    // show prints a command with its variables filled in.
    `show() { printf '  %s' "$1"; shift; for a in "$@"; do printf ' %s' "$a"; done; printf '\\n'; }`,
    `printf '%s\\n' ${shQuote('Start it with:')}`,
    ...plan.start.map((argv) => `show ${command(argv)}`),
    '',
  ].join('\n');
}
