#!/usr/bin/env bash
# Installs Dobra and everything it needs: Node (without admin rights, when it's missing or too old),
# the code, the npm packages, the builds of every tool, and Chromium for the site checker. It then
# adds a `dobra` command that opens each tool and updates the install.
#
# Three ways to run it, all the same script:
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/jacksonmafra-umain/Dobra/main/install.sh)"
#   bash install.sh          # inside the downloaded ZIP or a clone
#
# Settings, all optional:
#   DOBRA_DIR           where the code goes when the script downloads it (default ~/Dobra)
#   DOBRA_HOME          where Node and the `dobra` command go (default ~/.dobra)
#   DOBRA_BRANCH        the branch to download (default main)
#   DOBRA_SKIP_BROWSER  set to 1 to skip Chromium; only the site checker needs it
#   DOBRA_UPDATE        set to 1 to download the latest code even when run from a checkout
set -euo pipefail

REPO="jacksonmafra-umain/Dobra"
BRANCH="${DOBRA_BRANCH:-main}"
DOBRA_HOME="${DOBRA_HOME:-$HOME/.dobra}"
NODE_LINE="latest-v24.x" # the Node release line installed when none fits
NODE_MIN_MAJOR=22        # the oldest Node the tools run on: 22.12
NODE_MIN_MINOR=12
MARKER=".dobra-install"  # marks a folder this script manages, so an update may replace it

if [ -t 1 ]; then B=$'\033[1m'; C=$'\033[36m'; R=$'\033[31m'; N=$'\033[0m'; else B=; C=; R=; N=; fi
step() { printf '\n%s==>%s %s%s%s\n' "$C" "$N" "$B" "$*" "$N"; }
info() { printf '    %s\n' "$*"; }
fail() { printf '\n%sError:%s %s\n' "$R" "$N" "$*" >&2; exit 1; }

# Runs a noisy step with its output in the log, and shows the end of the log only when it fails.
LOG="$(mktemp -t dobra-install)"
quiet() { "$@" >>"$LOG" 2>&1 || { tail -n 40 "$LOG" >&2; fail "'$*' failed. The full log is in $LOG"; }; }
export npm_config_update_notifier=false

# The Dobra checkout this script sits in, when it was run from a file rather than from curl.
checkout_of_script() {
  local src="${BASH_SOURCE[0]:-}" dir
  [ -n "$src" ] && [ -f "$src" ] || return 1
  dir="$(cd "$(dirname "$src")" && pwd)"
  grep -q '"name": "dobra"' "$dir/package.json" 2>/dev/null || return 1
  printf '%s\n' "$dir"
}

node_fits() {
  command -v node >/dev/null 2>&1 &&
    node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>$NODE_MIN_MAJOR||(a===$NODE_MIN_MAJOR&&b>=$NODE_MIN_MINOR)?0:1)"
}

sha256() { if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1"; else sha256sum "$1"; fi | cut -d' ' -f1; }

install_node() {
  local os arch base sums file tmp
  case "$(uname -s)" in Darwin) os=darwin ;; Linux) os=linux ;; *) fail "Dobra installs on macOS and Linux only." ;; esac
  case "$(uname -m)" in arm64 | aarch64) arch=arm64 ;; x86_64 | amd64) arch=x64 ;; *) fail "Unsupported processor: $(uname -m)." ;; esac
  base="https://nodejs.org/dist/$NODE_LINE"
  sums="$(curl -fsSL "$base/SHASUMS256.txt")" || fail "Couldn't reach nodejs.org. Check the internet connection and try again."
  file="$(printf '%s\n' "$sums" | grep -o "node-v[0-9.]*-$os-$arch\.tar\.gz" | head -n 1)"
  [ -n "$file" ] || fail "nodejs.org has no Node build for $os-$arch."
  info "Downloading ${file%.tar.gz} into $DOBRA_HOME/node (no admin rights needed)"
  tmp="$(mktemp -d)"
  curl -fsSL "$base/$file" -o "$tmp/$file"
  [ "$(sha256 "$tmp/$file")" = "$(printf '%s\n' "$sums" | grep " $file\$" | cut -d' ' -f1)" ] ||
    fail "The Node download is corrupt (checksum mismatch). Run the installer again."
  mkdir -p "$tmp/node" "$DOBRA_HOME"
  tar -xzf "$tmp/$file" -C "$tmp/node" --strip-components 1
  rm -rf "$DOBRA_HOME/node"
  mv "$tmp/node" "$DOBRA_HOME/node"
  rm -rf "$tmp"
}

# Puts the latest code from GitHub in $1: `git pull` for a clone, otherwise a fresh download that
# replaces the folder's contents but keeps its installed packages.
fetch_code() {
  local dir="$1" tmp
  if [ -e "$dir/.git" ]; then
    info "Updating the clone in $dir"
    git -C "$dir" pull --ff-only || fail "git pull failed in $dir. Commit or stash your changes, then run the installer again."
    return
  fi
  if [ -e "$dir" ] && [ ! -f "$dir/$MARKER" ] && [ -n "$(ls -A "$dir")" ]; then
    fail "$dir already exists and wasn't made by this installer. Move it, or pick another folder: DOBRA_DIR=~/somewhere"
  fi
  info "Downloading $REPO ($BRANCH) into $dir"
  tmp="$(mktemp -d)"
  curl -fsSL "https://codeload.github.com/$REPO/tar.gz/refs/heads/$BRANCH" | tar -xz -C "$tmp" --strip-components 1 ||
    fail "Couldn't download the code from GitHub. Check the internet connection and try again."
  mkdir -p "$dir"
  rsync -a --delete --exclude node_modules --exclude "/$MARKER" "$tmp/" "$dir/"
  rm -rf "$tmp"
}

# The `dobra` command, and the line that puts it on the PATH of new Terminal windows.
install_command() {
  local dir="$1" bin="$DOBRA_HOME/bin" line profile
  mkdir -p "$bin"
  printf '#!/usr/bin/env bash\nexport DOBRA_DIR=%q DOBRA_HOME=%q\nexec bash "$DOBRA_DIR/scripts/dobra" "$@"\n' \
    "$dir" "$DOBRA_HOME" >"$bin/dobra"
  chmod +x "$bin/dobra"
  line="export PATH=\"$bin:\$PATH\" # Dobra"
  for profile in "$HOME/.zprofile" "$HOME/.bash_profile"; do
    case "$profile" in *bash_profile) [ -f "$profile" ] || [ "$(basename "${SHELL:-}")" = bash ] || continue ;; esac
    grep -qsF "$line" "$profile" || printf '\n%s\n' "$line" >>"$profile"
  done
}

main() {
  local dir
  command -v curl >/dev/null 2>&1 || fail "curl is missing."

  step "Getting the code"
  if [ "${DOBRA_UPDATE:-}" != 1 ] && dir="$(checkout_of_script)"; then
    info "Using the code in $dir"
  else
    dir="${DOBRA_DIR:-$HOME/Dobra}"
    fetch_code "$dir"
  fi
  [ -e "$dir/.git" ] || : >"$dir/$MARKER"
  cd "$dir"

  step "Checking Node"
  export PATH="$DOBRA_HOME/node/bin:$PATH"
  if node_fits; then info "Node $(node -v) at $(command -v node)"; else install_node; info "Node $(node -v)"; fi

  step "Installing packages (a few minutes the first time)"
  quiet npm ci --no-audit --no-fund

  step "Building the simulator, the report, the site checker and the Figma plugin"
  quiet npm run build
  quiet npm run build:report
  quiet npm run build:cli
  quiet npm run build -w @dobra/figma-plugin

  if [ "${DOBRA_SKIP_BROWSER:-}" = 1 ]; then
    step "Skipping Chromium (DOBRA_SKIP_BROWSER=1); dobra check site needs it"
  else
    step "Installing Chromium for the site checker"
    npm exec -w @dobra/cli -- playwright install chromium
  fi

  step "Adding the dobra command"
  install_command "$dir"

  printf '\n%sDobra is installed in %s%s\n\n' "$B" "$dir" "$N"
  cat <<EOF
Open a new Terminal window, then:

  dobra simulator            open the simulator
  dobra report               open the report
  dobra plugin               set up the Figma plugin
  dobra check site <url>     check a website on foldables
  dobra update               get the latest version

In this window, use $DOBRA_HOME/bin/dobra until you open a new one.
EOF
}

main "$@"
