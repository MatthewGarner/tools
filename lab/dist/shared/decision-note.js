// Decision notes select authored material; they never score or complete it.
export const noteField = (label, value, missing = 'Not recorded.') =>
  `**${label}:** ${value.trim() || missing}`;
export const optionalNoteField = (label, value) => value.trim() ? [noteField(label, value)] : [];
export const note = (title, parts) => [`# ${title}`, ...parts].join('\n\n');
