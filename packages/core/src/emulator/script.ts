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
case "$(uname -m)" in arm64 | aarch64) ABI=arm64-v8a ;; *) ABI=x86_64 ;; esac
IMAGE=""; BEST=0; OTHER=""
for dir in "$SDK"/system-images/android-*; do
  [ -d "$dir" ] || continue
  api=\${dir##*/android-}; api=\${api%%-*}
  case "$api" in '' | *[!0-9]*) continue ;; esac
  if [ -n "$WANT_API" ] && [ "$api" != "$WANT_API" ]; then continue; fi
  for tag in google_apis_playstore google_apis default; do
    if [ -d "$dir/$tag/$ABI" ]; then
      if [ "$api" -gt "$BEST" ]; then BEST=$api; IMAGE="system-images;\${dir##*/};$tag;$ABI"; fi
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
AVDMANAGER="$SDK/cmdline-tools/latest/bin/avdmanager"
if [ ! -x "$AVDMANAGER" ]; then AVDMANAGER=$(command -v avdmanager) || { echo "avdmanager not found: install the Android SDK command-line tools." >&2; exit 1; }; fi
EMULATOR="$SDK/emulator/emulator"
echo "Using $IMAGE"`;
}

function iosFind(runtime: string | null): string {
  const pick = runtime
    ? shQuote(runtime)
    : `$(xcrun simctl list runtimes | sed -n 's/.*\\(com\\.apple\\.CoreSimulator\\.SimRuntime\\.iOS-[0-9-]*\\).*/\\1/p' | tail -n 1)`;
  return `command -v xcrun >/dev/null || { echo "Xcode is needed: install it from the App Store." >&2; exit 1; }
RUNTIME=${pick}
[ -n "$RUNTIME" ] || { echo "No iOS simulator runtime: install one in Xcode, Settings, Components." >&2; exit 1; }
echo "Using $RUNTIME"`;
}

const SET_KEY = `set_key() {
  awk -v k="$1" 'index($0, k "=") != 1' "$CONFIG" > "$CONFIG.tmp"
  printf '%s=%s\\n' "$1" "$2" >> "$CONFIG.tmp"
  mv "$CONFIG.tmp" "$CONFIG"
}`;

function step(s: EmulatorStep): string {
  switch (s.kind) {
    case 'find-image':
      return s.platform === 'android' ? androidFind(s.api) : iosFind(s.runtime);
    case 'run': {
      const line = (s.input ? `printf ${shQuote(s.input.replace(/\n/g, '\\n'))} | ` : '') + command(s.argv);
      // The simulator's UDID is what simctl create prints; the start commands need it.
      return s.argv[0] === 'xcrun' && s.argv[2] === 'create' ? `UDID=$(${line})` : line;
    }
    case 'write-config':
      return [
        `CONFIG="\${ANDROID_AVD_HOME:-\${ANDROID_USER_HOME:-$HOME/.android}/avd}/${s.avd}.avd/config.ini"`,
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
    ...plan.steps.map(step),
    ...plan.limits.map((l) => `printf '%s\\n' ${shQuote(`note: ${l}`)}`),
    // show prints a command with its variables filled in.
    `show() { printf '  %s' "$1"; shift; for a in "$@"; do printf ' %s' "$a"; done; printf '\\n'; }`,
    `printf '%s\\n' ${shQuote('Start it with:')}`,
    ...plan.start.map((argv) => `show ${command(argv)}`),
    '',
  ].join('\n');
}
