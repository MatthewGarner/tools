/* The viewer's calendar day as a day number (the model's currency), not the UTC day:
   between local midnight and UTC midnight the two differ by one. Pure given a Date. */
const DAY = 86400000;
export const localDay = (date = new Date()) => Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY);
export const localISO = (date = new Date()) =>
  String(date.getFullYear()).padStart(4, '0') + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
