# Rebuilding vendor/codemirror.js

The bundle is committed so the site needs no build step. To rebuild (e.g. to upgrade CodeMirror):

```bash
mkdir cm-build && cd cm-build
npm init -y
npm install @codemirror/state @codemirror/view @codemirror/commands @codemirror/language @lezer/highlight
cat > entry.js <<'EOF'
export {EditorState, Compartment} from '@codemirror/state';
export {EditorView, keymap, drawSelection, highlightActiveLine} from '@codemirror/view';
export {defaultKeymap, history, historyKeymap} from '@codemirror/commands';
export {StreamLanguage, syntaxHighlighting, HighlightStyle} from '@codemirror/language';
export {tags} from '@lezer/highlight';
EOF
npx esbuild entry.js --bundle --format=esm --minify --outfile=codemirror.js
```

Then prepend the two provenance comment lines (see the current file header) with the versions from `package-lock.json`, and replace `roadmap/vendor/codemirror.js`.

Versions in the current bundle (2026-07-04):
@codemirror/commands@6.10.4 @codemirror/language@6.12.4 @codemirror/state@6.7.0 @codemirror/view@6.43.5 @lezer/common@1.5.2 @lezer/highlight@1.2.3 @lezer/lr@1.4.10 @marijn/find-cluster-break@1.0.3
