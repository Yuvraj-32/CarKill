// ============================================================================
// HUD.js — HTML overlay HUD (manipulates DOM elements from index.html)
// ============================================================================

import { Settings } from './Settings.js';

export class HUD {
    constructor() {
        // Cache DOM elements
        this.els = {
            hud:             document.getElementById('hud'),
            healthFill:      document.getElementById('health-fill'),
            healthText:      document.getElementById('health-text'),
            healthLabel:     document.getElementById('health-label'),
            speedValue:      document.getElementById('speed-value'),
            leaderboardList: document.getElementById('leaderboard-list'),
            killFeed:        document.getElementById('kill-feed'),
            deathOverlay:    document.getElementById('death-overlay'),
            deathKiller:     document.getElementById('death-killer'),
            menu:            document.getElementById('menu-screen'),
            nameInput:       document.getElementById('player-name'),
            vehicleCards:    document.querySelectorAll('.vehicle-card'),
            playBtn:         document.getElementById('play-btn'),
            coinCounter:     document.getElementById('coin-counter'),
            shopCoinCount:   document.getElementById('shop-coin-count'),
            shopCards:       document.querySelectorAll('.shop-card'),
            respawnBtn:      document.getElementById('respawn-btn'),
            matchTimer:      document.getElementById('match-timer'),
            winnerBanner:    document.getElementById('winner-banner'),
            winnerName:      document.getElementById('winner-name'),
            winnerKills:     document.getElementById('winner-kills'),
            themeLabel:      document.getElementById('theme-label'),
            // Settings
            settingsBtn:     document.getElementById('settings-btn'),
            settingsModal:   document.getElementById('settings-modal'),
            closeSettingsBtn:document.getElementById('close-settings-btn'),
            keybindBtns:     document.querySelectorAll('.keybind-btn'),
            keybindHint:     document.getElementById('keybind-hint'),
            editLayoutBtn:   document.getElementById('edit-layout-btn'),
            uiEditOverlay:   document.getElementById('ui-edit-overlay'),
            saveLayoutBtn:   document.getElementById('save-layout-btn'),
            uiScaleSlider:   document.getElementById('ui-scale-slider')
        };

        this.localPlayerId = null;
        this.killMessages = [];
        this.selectedShopVehicle = 'car';
        this.onRespawnCallback = null;
        
        this.config = Settings.load();
        this._setupShop();
        this._setupSettings();
    }

    show() {
        this.els.hud.style.display = 'block';
    }

    hide() {
        this.els.hud.style.display = 'none';
    }

    setUITheme(theme) {
        const root = document.documentElement;
        if (theme === 'wasteland') {
            root.style.setProperty('--theme-bg', 'rgba(92, 74, 42, 0.6)');
            root.style.setProperty('--theme-accent', '#e6aa55');
            root.style.setProperty('--theme-border', 'rgba(230, 170, 85, 0.4)');
        } else if (theme === 'toxic') {
            root.style.setProperty('--theme-bg', 'rgba(42, 61, 30, 0.6)');
            root.style.setProperty('--theme-accent', '#6b9e38');
            root.style.setProperty('--theme-border', 'rgba(107, 158, 56, 0.4)');
        } else {
            // Storm or default
            root.style.setProperty('--theme-bg', 'rgba(42, 42, 42, 0.6)');
            root.style.setProperty('--theme-accent', '#7777cc');
            root.style.setProperty('--theme-border', 'rgba(119, 119, 204, 0.4)');
        }
    }

    // ---- Health ----

    updateHealth(current, max) {
        const ratio = Math.max(0, Math.min(1, current / max));
        this.els.healthFill.style.width = (ratio * 100) + '%';
        this.els.healthText.textContent = Math.ceil(current);

        // Color transition
        if (ratio > 0.6) {
            this.els.healthFill.style.background = 'linear-gradient(90deg, #2ecc71, #27ae60)';
        } else if (ratio > 0.3) {
            this.els.healthFill.style.background = 'linear-gradient(90deg, #f1c40f, #e67e22)';
        } else {
            this.els.healthFill.style.background = 'linear-gradient(90deg, #e74c3c, #c0392b)';
        }
    }

    setVehicleLabel(type) {
        if (this.els.healthLabel) {
            this.els.healthLabel.textContent = type.toUpperCase();
        }
    }

    // ---- Speed ----

    updateSpeed(speed) {
        const kmh = Math.abs(Math.round(speed * 3.6));
        this.els.speedValue.textContent = kmh;
    }

    // ---- Match Timer ----

    updateMatchTimer(secondsLeft) {
        if (!this.els.matchTimer) return;
        const m = Math.floor(secondsLeft / 60).toString().padStart(2, '0');
        const s = (secondsLeft % 60).toString().padStart(2, '0');
        this.els.matchTimer.textContent = `${m}:${s}`;
        // Turn red when < 30s
        this.els.matchTimer.style.color = secondsLeft < 30 ? '#ff4422' : '#ffffff';
    }

    showThemeLabel(theme) {
        if (!this.els.themeLabel) return;
        const icons = { wasteland: '🏜️', toxic: '☣️', storm: '🌪️' };
        const names = { wasteland: 'WASTELAND', toxic: 'TOXIC ZONE', storm: 'ASH STORM' };
        this.els.themeLabel.textContent = `${icons[theme] || ''} ${names[theme] || theme.toUpperCase()}`;
        this.els.themeLabel.style.opacity = '1';
        setTimeout(() => { if (this.els.themeLabel) this.els.themeLabel.style.opacity = '0'; }, 4000);
    }

    // ---- Winner Banner ----

    showWinnerBanner(name, kills) {
        if (!this.els.winnerBanner) return;
        this.els.winnerName.textContent = name;
        this.els.winnerKills.textContent = `${kills} KILLS`;
        this.els.winnerBanner.classList.add('visible');
    }

    hideWinnerBanner() {
        if (!this.els.winnerBanner) return;
        this.els.winnerBanner.classList.remove('visible');
    }

    // ---- Coins ----

    updateCoins(count) {
        if (this.els.coinCounter) {
            this.els.coinCounter.textContent = count;
        }
    }

    // ---- Leaderboard ----

    updateLeaderboard(entries, localId) {
        this.localPlayerId = localId;
        const list = this.els.leaderboardList;
        list.innerHTML = '';

        const max = Math.min(entries.length, 5);
        for (let i = 0; i < max; i++) {
            const e = entries[i];
            const row = document.createElement('div');
            row.className = 'lb-row';
            if (e.id === localId) row.classList.add('lb-local');

            row.innerHTML =
                '<span class="lb-rank">' + (i + 1) + '.</span>' +
                '<span class="lb-name">' + this._escapeHtml(e.name) + '</span>' +
                '<span class="lb-kills">' + e.kills + '</span>';

            list.appendChild(row);
        }
    }

    // ---- Kill Feed ----

    addKill(killerName, victimName) {
        this._addFeedMessage(
            '<span class="kf-killer">' + this._escapeHtml(killerName) + '</span>' +
            ' <span class="kf-icon">💥</span> ' +
            '<span class="kf-victim">' + this._escapeHtml(victimName) + '</span>',
            'kf-kill'
        );
    }

    addSystemMessage(text, type) {
        this._addFeedMessage(
            '<span class="kf-system">' + this._escapeHtml(text) + '</span>',
            type === 'join' ? 'kf-join' : 'kf-leave'
        );
    }

    _addFeedMessage(html, className) {
        const el = document.createElement('div');
        el.className = 'kf-entry ' + (className || '');
        el.innerHTML = html;
        this.els.killFeed.appendChild(el);

        // Trigger animation
        requestAnimationFrame(() => el.classList.add('kf-visible'));

        // Auto-remove after 4s
        setTimeout(() => {
            el.classList.add('kf-fade');
            setTimeout(() => {
                if (el.parentNode) el.parentNode.removeChild(el);
            }, 500);
        }, 4000);

        // Limit visible messages
        const entries = this.els.killFeed.querySelectorAll('.kf-entry');
        if (entries.length > 5) {
            entries[0].parentNode.removeChild(entries[0]);
        }
    }

    // ---- Death Overlay + Shop ----

    _setupShop() {
        // Shop card selection
        this.els.shopCards.forEach(card => {
            card.addEventListener('click', () => {
                if (card.classList.contains('locked')) return;
                this.els.shopCards.forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                this.selectedShopVehicle = card.dataset.type;
            });
        });

        // Respawn button
        if (this.els.respawnBtn) {
            this.els.respawnBtn.addEventListener('click', () => {
                if (this.onRespawnCallback) {
                    this.onRespawnCallback(this.selectedShopVehicle);
                }
            });
        }
    }

    showDeath(killerName, currentCoins) {
        this.els.deathKiller.textContent = 'Eliminated by ' + killerName;

        // Update shop coin display
        if (this.els.shopCoinCount) {
            this.els.shopCoinCount.textContent = currentCoins || 0;
        }

        // Update locked/unlocked state based on coins
        const coins = currentCoins || 0;
        this.els.shopCards.forEach(card => {
            const cost = parseInt(card.dataset.cost) || 0;
            card.classList.remove('locked');
            if (cost > coins) {
                card.classList.add('locked');
                card.classList.remove('selected');
            }
        });

        // Auto-select the best affordable car, or keep current selection
        const currentSelected = document.querySelector('.shop-card.selected');
        if (!currentSelected || currentSelected.classList.contains('locked')) {
            // Select the first unlocked card
            const firstUnlocked = document.querySelector('.shop-card:not(.locked)');
            if (firstUnlocked) {
                firstUnlocked.classList.add('selected');
                this.selectedShopVehicle = firstUnlocked.dataset.type;
            }
        }

        this.els.deathOverlay.classList.add('visible');
    }

    hideDeath() {
        this.els.deathOverlay.classList.remove('visible');
    }

    // ---- Menu ----

    showMenu() {
        this.els.menu.style.display = 'flex';
    }

    hideMenu() {
        this.els.menu.style.display = 'none';
    }

    getPlayerName() {
        return this.els.nameInput.value.trim() || 'Player' + Math.floor(Math.random() * 900 + 100);
    }

    getSelectedVehicle() {
        const selected = document.querySelector('.vehicle-card.selected');
        return selected ? selected.dataset.type : 'car';
    }

    setupMenuHandlers(onPlay) {
        // Vehicle card selection
        this.els.vehicleCards.forEach(card => {
            card.addEventListener('click', () => {
                this.els.vehicleCards.forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
            });
        });

        // Play button
        this.els.playBtn.addEventListener('click', () => {
            onPlay(this.getPlayerName(), this.getSelectedVehicle());
        });

        // Enter key on name input
        this.els.nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                onPlay(this.getPlayerName(), this.getSelectedVehicle());
            }
        });

        // Default selection
        const firstCard = document.querySelector('.vehicle-card');
        if (firstCard) firstCard.classList.add('selected');
    }

    // ---- Settings ----
    _setupSettings() {
        if (!this.els.settingsBtn) return;

        let activeActionBinding = null;

        const updateKeybindLabels = () => {
            this.els.keybindBtns.forEach(btn => {
                const action = btn.dataset.action;
                if (this.config.keys[action]) {
                    btn.textContent = this.config.keys[action].join(' / ');
                }
            });
        };

        this.els.settingsBtn.addEventListener('click', () => {
            updateKeybindLabels();
            this.els.settingsModal.style.display = 'flex';
        });

        this.els.closeSettingsBtn.addEventListener('click', () => {
            this.els.settingsModal.style.display = 'none';
            Settings.save(this.config);
            activeActionBinding = null;
            this.els.keybindHint.textContent = '';
        });

        // Keybinding clicks
        this.els.keybindBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                activeActionBinding = btn.dataset.action;
                btn.textContent = 'Press any key...';
                this.els.keybindHint.textContent = 'Press a key to bind it to ' + activeActionBinding.toUpperCase();
            });
        });

        // Keybinding capture
        window.addEventListener('keydown', (e) => {
            if (activeActionBinding) {
                // Remove from current binding
                this.config.keys[activeActionBinding] = [e.code]; // Overwrite with new single key, or we could push
                updateKeybindLabels();
                this.els.keybindHint.textContent = 'Bound ' + activeActionBinding.toUpperCase() + ' to ' + e.code;
                activeActionBinding = null;
            }
        });

        // Mobile Layout Edit
        this.els.editLayoutBtn.addEventListener('click', () => {
            this.els.settingsModal.style.display = 'none';
            this.els.uiEditOverlay.style.display = 'block';
            
            // Show mobile controls temporarily so they can be dragged
            const mc = document.getElementById('mobile-controls');
            if (mc) {
                mc.style.display = 'block';
                mc.style.pointerEvents = 'auto'; // allow dragging
            }
            this.els.uiScaleSlider.value = this.config.mobileLayout.btnLeft.scale || 1;
            
            // Apply current positions to buttons directly for dragging
            this._applyMobileLayout(true);
        });

        this.els.uiScaleSlider.addEventListener('input', (e) => {
            const scale = parseFloat(e.target.value);
            ['btnLeft', 'btnRight', 'btnUp', 'btnDown'].forEach(key => {
                this.config.mobileLayout[key].scale = scale;
            });
            this._applyMobileLayout(true);
        });

        this.els.saveLayoutBtn.addEventListener('click', () => {
            this.els.uiEditOverlay.style.display = 'none';
            this.els.settingsModal.style.display = 'flex'; // Go back to settings
            Settings.save(this.config);
            
            const mc = document.getElementById('mobile-controls');
            if (mc) mc.style.pointerEvents = 'none'; // reset
        });

        this._setupDraggableButtons();
    }

    _applyMobileLayout(isEditing) {
        const mapping = {
            'btn-left': 'btnLeft',
            'btn-right': 'btnRight',
            'btn-up': 'btnUp',
            'btn-down': 'btnDown'
        };
        
        for (const [id, key] of Object.entries(mapping)) {
            const btn = document.getElementById(id);
            if (!btn) continue;
            
            const layout = this.config.mobileLayout[key];
            if (layout) {
                btn.style.position = 'fixed';
                btn.style.left = layout.x + 'vw';
                btn.style.top = layout.y + 'vh';
                btn.style.bottom = 'auto';
                btn.style.right = 'auto';
                btn.style.transform = `translate(-50%, -50%) scale(${layout.scale || 1})`;
                if (isEditing) {
                    btn.style.boxShadow = '0 0 15px rgba(255,0,0,0.8)';
                } else {
                    btn.style.boxShadow = '';
                }
            }
        }
    }

    _setupDraggableButtons() {
        const btns = ['btn-left', 'btn-right', 'btn-up', 'btn-down'];
        
        btns.forEach(id => {
            const btn = document.getElementById(id);
            if (!btn) return;
            
            let isDragging = false;
            
            const startDrag = (e) => {
                if (this.els.uiEditOverlay.style.display !== 'block') return;
                isDragging = true;
                e.preventDefault();
            };
            
            const moveDrag = (e) => {
                if (!isDragging) return;
                e.preventDefault();
                let clientX = e.clientX || (e.touches && e.touches[0].clientX);
                let clientY = e.clientY || (e.touches && e.touches[0].clientY);
                
                if (clientX !== undefined && clientY !== undefined) {
                    // Convert to vw/vh
                    const vw = (clientX / window.innerWidth) * 100;
                    const vh = (clientY / window.innerHeight) * 100;
                    
                    const mapping = {
                        'btn-left': 'btnLeft',
                        'btn-right': 'btnRight',
                        'btn-up': 'btnUp',
                        'btn-down': 'btnDown'
                    };
                    const key = mapping[id];
                    this.config.mobileLayout[key].x = vw;
                    this.config.mobileLayout[key].y = vh;
                    
                    this._applyMobileLayout(true);
                }
            };
            
            const endDrag = () => { isDragging = false; };
            
            btn.addEventListener('mousedown', startDrag);
            btn.addEventListener('touchstart', startDrag, { passive: false });
            
            window.addEventListener('mousemove', moveDrag);
            window.addEventListener('touchmove', moveDrag, { passive: false });
            
            window.addEventListener('mouseup', endDrag);
            window.addEventListener('touchend', endDrag);
        });
    }

    // ---- Utility ----

    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
