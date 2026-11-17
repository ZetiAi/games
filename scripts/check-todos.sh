#!/bin/sh
# Every TODO or FIXME names the issue that tracks it: TODO(#123): ...
# One without an issue is never done. The same check runs for every language in the repo.
set -eu

untracked=$(
	git grep -n -I -w -E 'TODO|FIXME' -- \
		'*.ts' '*.js' '*.mjs' '*.svelte' '*.astro' '*.dart' '*.rs' '*.py' '*.sql' '*.sh' \
		':!scripts/check-todos.sh' |
		grep -v -E '(TODO|FIXME)\(#[0-9]+\)' || true
)

if [ -n "$untracked" ]; then
	echo "TODO or FIXME without an issue number. Open an issue and write TODO(#123):"
	echo "$untracked"
	exit 1
fi
