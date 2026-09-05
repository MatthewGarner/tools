/* Heroicons v2.2.0 outline icons. Copyright (c) Tailwind Labs, Inc.
   MIT License — see action-icons-LICENSE.txt. https://heroicons.com */
const paths = {
  "download": "<path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3\"/>",
  "edit": "<path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10\"/>",
  "close": "<path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M6 18 18 6M6 6l12 12\"/>"
};
export function actionIcon(name){
  return `<svg class="action-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${paths[name] || ''}</svg>`;
}
export function mountActionIcons(root = document){
  for(const button of root.querySelectorAll('[data-icon]')){
    if(!button.querySelector('.action-icon')) button.insertAdjacentHTML('afterbegin', actionIcon(button.dataset.icon));
  }
}
