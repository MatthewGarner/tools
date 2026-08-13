/* Test-only inspection for the semantic contract shared by exported and
   interactive SVG artefacts. Keep this deliberately smaller than an SVG/DOM
   parser: the renderers already pass the XML and injection gates; this helper
   makes their accessibility promise reviewable in one place. */

function attribute(source, name){
  const match = new RegExp('(?:^|\\s)' + name + '="([^"]*)"').exec(source || '');
  return match?.[1] ?? null;
}

function firstText(svg, tag){
  return new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + tag + '>').exec(svg)?.[1] ?? '';
}

export function inspectSemanticArtifact(svg){
  const source = String(svg || '');
  const root = /^<svg\b([^>]*)>/.exec(source)?.[1] ?? '';
  const controls = [...source.matchAll(/<([a-z][\w:-]*)\b([^>]*\brole="button"[^>]*)>/gi)]
    .map(match => ({
      tag:match[1],
      role:attribute(match[2], 'role'),
      tabIndex:attribute(match[2], 'tabindex'),
      pressed:attribute(match[2], 'aria-pressed'),
      expanded:attribute(match[2], 'aria-expanded'),
      label:attribute(match[2], 'aria-label'),
      decisionKey:attribute(match[2], 'data-decision-key'),
      selectable:attribute(match[2], 'data-select-decision') !== null,
    }));
  const liveInteractionPatterns = [
    /\brole="button"/,
    /\btabindex="0"/,
    /\bdata-select-decision=/,
    /\baria-pressed=/,
    /\bdata-hit=/,
  ];
  return {
    rootRole:attribute(root, 'role'),
    labelledBy:attribute(root, 'aria-labelledby'),
    label:attribute(root, 'aria-label'),
    title:firstText(source, 'title'),
    description:firstText(source, 'desc'),
    controls,
    liveInteractionMarkup:liveInteractionPatterns.filter(pattern => pattern.test(source))
      .map(pattern => pattern.source),
  };
}
