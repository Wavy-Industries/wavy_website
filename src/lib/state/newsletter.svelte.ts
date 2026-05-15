export const newsletterUI = $state<{ popupOpen: boolean; source: string }>({
    popupOpen: false,
    source: 'unknown',
});

export function openNewsletter(source: string = 'unknown') {
    newsletterUI.source = source;
    newsletterUI.popupOpen = true;
}

export function closeNewsletter() {
    newsletterUI.popupOpen = false;
}
