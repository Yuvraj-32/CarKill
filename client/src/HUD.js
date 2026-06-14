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
            deathCountdown:  document.getElementById('death-countdown'),
            menu:            document.getElementById('menu-screen'),
            nameInput:       document.getElementById('player-name'),
            vehicleCards:    document.querySelectorAll('.vehicle-card'),
            playBtn:         document.getElementById('play-btn')
        };

        this.localPlayerId = null;
        this.killMessages = [];
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

    // ---- Death Overlay ----

    showDeath(killerName) {
        this.els.deathKiller.textContent = 'Eliminated by ' + killerName;
        this.els.deathOverlay.classList.add('visible');
        this._startCountdown(3);
    }

    hideDeath() {
        this.els.deathOverlay.classList.remove('visible');
    }

    _startCountdown(seconds) {
        let remaining = seconds;
        this.els.deathCountdown.textContent = 'Respawning in ' + remaining + '...';
        const interval = setInterval(() => {
            remaining--;
            if (remaining > 0) {
                this.els.deathCountdown.textContent = 'Respawning in ' + remaining + '...';
            } else {
                this.els.deathCountdown.textContent = 'Respawning...';
                clearInterval(interval);
            }
        }, 1000);
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
