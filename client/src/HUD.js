// ============================================================================
// HUD.js — HTML overlay HUD (manipulates DOM elements from index.html)
// ============================================================================

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
            respawnBtn:      document.getElementById('respawn-btn')
        };

        this.localPlayerId = null;
        this.killMessages = [];
        this.selectedShopVehicle = 'car';
        this.onRespawnCallback = null;
        this._setupShop();
    }

    show() {
        this.els.hud.style.display = 'block';
    }

    hide() {
        this.els.hud.style.display = 'none';
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
        const kmh = Math.abs(Math.round(speed * 3.6)); // rough conversion
        this.els.speedValue.textContent = kmh;
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

    // ---- Utility ----

    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
