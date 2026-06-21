export class Settings {
    static get defaultConfig() {
        return {
            keys: {
                forward: ['KeyW', 'ArrowUp'],
                backward: ['KeyS', 'ArrowDown'],
                left: ['KeyA', 'ArrowLeft'],
                right: ['KeyD', 'ArrowRight'],
            },
            mobileLayout: {
                // positions in percentage to adapt to screens
                btnLeft: { x: 5, y: 80, scale: 1 },
                btnRight: { x: 25, y: 80, scale: 1 },
                btnDown: { x: 75, y: 80, scale: 1 },
                btnUp: { x: 90, y: 65, scale: 1 } // Moved up button slightly higher
            }
        };
    }

    static load() {
        try {
            const data = localStorage.getItem('vehikillSettings');
            if (data) {
                const parsed = JSON.parse(data);
                // Merge with defaults to ensure all keys exist
                return {
                    keys: { ...this.defaultConfig.keys, ...parsed.keys },
                    mobileLayout: { ...this.defaultConfig.mobileLayout, ...parsed.mobileLayout }
                };
            }
        } catch (e) {
            console.error("Failed to load settings from localStorage", e);
        }
        return this.defaultConfig;
    }

    static save(config) {
        try {
            localStorage.setItem('vehikillSettings', JSON.stringify(config));
        } catch (e) {
            console.error("Failed to save settings to localStorage", e);
        }
    }

    // Check if a specific keyboard code matches a logical action
    static isAction(config, actionName, code) {
        if (!config.keys[actionName]) return false;
        return config.keys[actionName].includes(code);
    }
}
