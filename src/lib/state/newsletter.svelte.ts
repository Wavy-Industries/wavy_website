export const newsletterUI = $state({
    popupOpen: false,
});

export function openNewsletter() {
    newsletterUI.popupOpen = true;
}

export function closeNewsletter() {
    newsletterUI.popupOpen = false;
}
