
export const dev = $state({ enabled: false });

const STORAGE_KEY = 'wavy_dev_mode';

export const loadDevMode = () => {
    const stored = localStorage.getItem(STORAGE_KEY);
    dev.enabled = stored === 'true';
    
    /* listen for the commands */ 
    const FLAG = '__wavyDevConsolePatched';
    if (!(FLAG in window)) {
        (window as any)[FLAG] = true;
    
        const orig = console.log;
        console.log = function (...args: any[]) {
            const msg = args.join(' ').toLowerCase();
    
            if (msg.includes('dev mode enable')) {
                dev.enabled = true;
                orig.call(console, '🔧 Dev mode enabled! Device Tester tab is now available.');
                return;
            }
    
            if (msg.includes('dev mode disable')) {
                dev.enabled = false;
                orig.call(console, '🔧 Dev mode disabled.');
                return;
            }
    
            orig.apply(console, args);
        };
    }
}

$effect.root(() => {
    localStorage.setItem(STORAGE_KEY, String(dev.enabled));
});
