#!/bin/sh
# Turns on .githooks/ for this clone (`bun run hooks`). It writes one small forwarder per hook into
# .git/hooks rather than setting core.hooksPath, so global hooks keep working. Not a postinstall
# script: Bip is a published package, and consumers' installs must not touch their git hooks.
common=$(git rev-parse --git-common-dir 2>/dev/null) || exit 0
marker='Written by `bun run hooks`'

mkdir -p "$common/hooks"
for hook in .githooks/*; do
  forwarder="$common/hooks/${hook##*/}"
  # Someone else's hook is theirs to keep; say what that costs them.
  if [ -e "$forwarder" ] && ! grep -q "$marker" "$forwarder"; then
    echo "warning: $forwarder is not from bun run hooks, so it does not run $hook" >&2
    continue
  fi
  cat > "$forwarder.$$" <<'HOOK' && chmod +x "$forwarder.$$" && mv "$forwarder.$$" "$forwarder"
#!/bin/sh
# Written by `bun run hooks`. Runs the checkout's own hook once its tools are installed.
hook=".githooks/${0##*/}"
[ -x "$hook" ] && [ -d node_modules ] || exit 0
exec "$hook" "$@"
HOOK
  echo "Installed ${hook##*/} hook."
done

# Let local `git blame` skip formatting-only commits, as GitHub does.
git config blame.ignoreRevsFile .git-blame-ignore-revs
