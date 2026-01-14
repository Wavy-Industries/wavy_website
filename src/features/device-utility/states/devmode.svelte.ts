export const dev = $state({ enabled: false });

const STORAGE_KEY = 'wavy_dev_mode';

export const loadDevMode = () => {
    const stored = localStorage.getItem(STORAGE_KEY);
    dev.enabled = stored === 'true';

    const FLAG = '__wavyDevModeRegistered';
    if (FLAG in window) return;
    (window as any)[FLAG] = true;

    // Console API
    (window as any).__wavyDevMode = (value: boolean | 'enable' | 'disable') => {
        const next = value === 'enable' ? true : value === 'disable' ? false : Boolean(value);
        dev.enabled = next;
        console.log(next ? '🔧 Dev mode enabled! Device Tester tab is now available.' : '🔧 Dev mode disabled.');
    };

    // Keyboard shortcut: capital T (Shift+T) toggles dev mode
    window.addEventListener('keydown', (e) => {
        if (e.key === 'T' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
            // Ignore if user is typing in an input field
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

            dev.enabled = !dev.enabled;
            console.log(dev.enabled ? '🔧 Dev mode enabled! Device Tester tab is now available.' : '🔧 Dev mode disabled.');
        }
    });
};

$effect.root(() => {
    localStorage.setItem(STORAGE_KEY, String(dev.enabled));
});
