/* Markdown: one escaping rule, identical in Bets, Tree and Paths (each keeps its own copy): a backslash before each of
   \ | * _ ` [ ] < >, a newline as a space, and no HTML entities. */
export const mdEscape = value => String(value == null ? '—' : value).replace(/\r?\n/g, ' ').replace(/[\\|*_`[\]<>]/g, '\\$&');
