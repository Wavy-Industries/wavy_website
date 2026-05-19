export const newsletterUI = $state<{ popupOpen: boolean; source: string }>({
    popupOpen: false,
    source: '',
});

export function openNewsletter(source: string) {
    newsletterUI.source = source;
    newsletterUI.popupOpen = true;
}

export function closeNewsletter() {
    newsletterUI.popupOpen = false;
}
