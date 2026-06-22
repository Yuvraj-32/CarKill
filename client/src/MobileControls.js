// ============================================================================
// MobileControls.js — Draggable mobile buttons with preset layouts
// ============================================================================

const STORAGE_KEY = 'clashwars_ctrl_positions';
const LAYOUT_KEY  = 'clashwars_ctrl_layout';

// Default positions for each preset (as % of screen width/height from top-left)
// { id, label, defaultLeft%, defaultBottom% }
const BUTTON_DEFS = [
    { id: 'btn-left',   label: '◀', key: 'ArrowLeft'  },
    { id: 'btn-right',  label: '▶', key: 'ArrowRight' },
    { id: 'btn-up',     label: '▲', key: 'ArrowUp'    },
    { id: 'btn-brake',  label: '■', key: 'Space'      },
    { id: 'btn-down',   label: '▼', key: 'ArrowDown'  },
];

// 4 preset layouts – positions are [left%, bottom%] per viewport
const PRESETS = {
    classic: {
        label: '⬜ Classic',
        desc: 'Steer left, Gas/Brake right',
        positions: {
            'btn-left':  [4,  12],
            'btn-right': [16, 12],
            'btn-up':    [76, 18],
            'btn-brake': [88, 18],
            'btn-down':  [82, 8 ],
        }
    },
    thumbs: {
        label: '👍 Wide',
        desc: 'Far corners for big thumbs',
        positions: {
            'btn-left':  [2,  22],
            'btn-right': [18, 22],
            'btn-up':    [78, 22],
            'btn-brake': [92, 22],
            'btn-down':  [85, 10],
        }
    },
    lefty: {
        label: '🤚 Left-Hand',
        desc: 'Gas/Brake left, Steer right',
        positions: {
            'btn-up':    [4,  18],
            'btn-brake': [16, 18],
            'btn-down':  [10, 8 ],
            'btn-left':  [76, 12],
            'btn-right': [88, 12],
        }
    },
    dpad: {
        label: '🕹️ D-Pad',
        desc: 'Centered cross layout',
        positions: {
            'btn-left':  [36, 10],
            'btn-right': [56, 10],
            'btn-up':    [46, 22],
            'btn-brake': [46, 2 ],
            'btn-down':  [56, 2 ],
        }
    }
};

export class MobileControls {
    constructor(keysRef) {
        this.keys = keysRef;
        this.editMode = false;
        this.activePreset = localStorage.getItem(LAYOUT_KEY) || 'classic';
        this._dragging = null;
        this._buttons = {}; // id -> element

        this._buildUI();
        this._loadPositions();
        this._bindTouchInput();
        this._bindSettingsBtn();
    }

    // -------------------------------------------------------------------------
    // UI Construction
    // -------------------------------------------------------------------------

    _buildUI() {
        // Create each button and add to #mobile-controls
        const container = document.getElementById('mobile-controls');
        if (!container) return;

        // Clear existing buttons
        container.innerHTML = '';

        BUTTON_DEFS.forEach(def => {
            const btn = document.createElement('button');
            btn.id = def.id;
            btn.className = 'mc-btn';
            btn.textContent = def.label;
            btn.dataset.key = def.key;
            container.appendChild(btn);
            this._buttons[def.id] = btn;
        });
    }

    // -------------------------------------------------------------------------
    // Position management
    // -------------------------------------------------------------------------

    _applyPreset(presetName) {
        const preset = PRESETS[presetName];
        if (!preset) return;
        this.activePreset = presetName;
        localStorage.setItem(LAYOUT_KEY, presetName);

        Object.entries(preset.positions).forEach(([id, [l, b]]) => {
            const btn = this._buttons[id];
            if (!btn) return;
            btn.style.left   = l + 'vw';
            btn.style.bottom = b + 'vh';
            btn.style.right  = 'auto';
            btn.style.top    = 'auto';
        });

        // Clear custom positions for this preset
        localStorage.removeItem(STORAGE_KEY);
        this._updatePresetHighlight(presetName);
    }

    _savePositions() {
        const saved = {};
        Object.entries(this._buttons).forEach(([id, btn]) => {
            saved[id] = { left: btn.style.left, bottom: btn.style.bottom };
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    }

    _loadPositions() {
        // First apply the active preset as a base
        this._applyPreset(this.activePreset);

        // Then override with any custom dragged positions
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        try {
            const saved = JSON.parse(raw);
            Object.entries(saved).forEach(([id, pos]) => {
                const btn = this._buttons[id];
                if (!btn) return;
                btn.style.left   = pos.left;
                btn.style.bottom = pos.bottom;
                btn.style.right  = 'auto';
                btn.style.top    = 'auto';
            });
        } catch (e) { /* ignore bad data */ }
    }

    // -------------------------------------------------------------------------
    // Settings panel
    // -------------------------------------------------------------------------

    _bindSettingsBtn() {
        // Show the cog button
        const cogBtn = document.getElementById('ctrl-settings-btn');
        if (!cogBtn) return;

        cogBtn.addEventListener('click', () => this._openPanel());
        cogBtn.addEventListener('touchend', (e) => { e.preventDefault(); this._openPanel(); }, { passive: false });
    }

    _openPanel() {
        const panel = document.getElementById('ctrl-panel-overlay');
        if (!panel) return;
        panel.classList.add('visible');
        this._updatePresetHighlight(this.activePreset);
    }

    _closePanel() {
        const panel = document.getElementById('ctrl-panel-overlay');
        if (panel) panel.classList.remove('visible');
    }

    _updatePresetHighlight(presetName) {
        document.querySelectorAll('.ctrl-preset-card').forEach(card => {
            card.classList.toggle('active', card.dataset.preset === presetName);
        });
    }

    // Called externally after panel HTML is ready
    bindPanelEvents() {
        // Preset cards
        document.querySelectorAll('.ctrl-preset-card').forEach(card => {
            const activate = (e) => {
                e.preventDefault();
                this._applyPreset(card.dataset.preset);
            };
            card.addEventListener('click', activate);
            card.addEventListener('touchend', activate, { passive: false });
        });

        // Edit (drag) button
        const editBtn = document.getElementById('ctrl-edit-btn');
        if (editBtn) {
            const startEdit = (e) => {
                e.preventDefault();
                this._closePanel();
                this._enterEditMode();
            };
            editBtn.addEventListener('click', startEdit);
            editBtn.addEventListener('touchend', startEdit, { passive: false });
        }

        // Done button
        const doneBtn = document.getElementById('ctrl-done-btn');
        if (doneBtn) {
            const endEdit = (e) => {
                e.preventDefault();
                this._exitEditMode();
            };
            doneBtn.addEventListener('click', endEdit);
            doneBtn.addEventListener('touchend', endEdit, { passive: false });
        }

        // Close panel button
        const closeBtn = document.getElementById('ctrl-panel-close');
        if (closeBtn) {
            const close = (e) => { e.preventDefault(); this._closePanel(); };
            closeBtn.addEventListener('click', close);
            closeBtn.addEventListener('touchend', close, { passive: false });
        }

        // Reset button
        const resetBtn = document.getElementById('ctrl-reset-btn');
        if (resetBtn) {
            const reset = (e) => {
                e.preventDefault();
                localStorage.removeItem(STORAGE_KEY);
                this._applyPreset(this.activePreset);
            };
            resetBtn.addEventListener('click', reset);
            resetBtn.addEventListener('touchend', reset, { passive: false });
        }
    }

    // -------------------------------------------------------------------------
    // Drag / Edit Mode
    // -------------------------------------------------------------------------

    _enterEditMode() {
        this.editMode = true;
        document.getElementById('mobile-controls').classList.add('edit-mode');
        document.getElementById('ctrl-done-btn').style.display = 'block';
        document.getElementById('ctrl-edit-hint').style.display = 'block';

        Object.values(this._buttons).forEach(btn => {
            btn.addEventListener('touchstart', this._onDragStart, { passive: false });
        });
        document.addEventListener('touchmove', this._onDragMove, { passive: false });
        document.addEventListener('touchend', this._onDragEnd, { passive: false });
    }

    _exitEditMode() {
        this.editMode = false;
        document.getElementById('mobile-controls').classList.remove('edit-mode');
        document.getElementById('ctrl-done-btn').style.display = 'none';
        document.getElementById('ctrl-edit-hint').style.display = 'none';
        this._savePositions();

        Object.values(this._buttons).forEach(btn => {
            btn.removeEventListener('touchstart', this._onDragStart);
        });
        document.removeEventListener('touchmove', this._onDragMove);
        document.removeEventListener('touchend', this._onDragEnd);
    }

    _onDragStart = (e) => {
        if (!this.editMode) return;
        e.preventDefault();
        const btn = e.currentTarget;
        const touch = e.touches[0];
        const rect = btn.getBoundingClientRect();
        this._dragging = {
            btn,
            offsetX: touch.clientX - rect.left,
            offsetY: touch.clientY - rect.top,
        };
        btn.classList.add('dragging');
    }

    _onDragMove = (e) => {
        if (!this._dragging) return;
        e.preventDefault();
        const touch = e.touches[0];
        const { btn, offsetX, offsetY } = this._dragging;
        const W = window.innerWidth;
        const H = window.innerHeight;
        const bW = btn.offsetWidth;
        const bH = btn.offsetHeight;

        // Position as bottom/left in px, clamped to screen
        let newLeft   = touch.clientX - offsetX;
        let newBottom = H - (touch.clientY - offsetY) - bH;

        newLeft   = Math.max(0, Math.min(W - bW, newLeft));
        newBottom = Math.max(0, Math.min(H - bH, newBottom));

        btn.style.left   = newLeft + 'px';
        btn.style.bottom = newBottom + 'px';
        btn.style.right  = 'auto';
        btn.style.top    = 'auto';
    }

    _onDragEnd = (e) => {
        if (!this._dragging) return;
        this._dragging.btn.classList.remove('dragging');
        this._dragging = null;
    }

    // -------------------------------------------------------------------------
    // Touch Input Binding (actual game controls)
    // -------------------------------------------------------------------------

    _bindTouchInput() {
        Object.values(this._buttons).forEach(btn => {
            const key = btn.dataset.key;

            btn.addEventListener('touchstart', (e) => {
                if (this.editMode) return;
                e.preventDefault();
                this.keys[key] = true;
            }, { passive: false });

            btn.addEventListener('touchend', (e) => {
                if (this.editMode) return;
                e.preventDefault();
                this.keys[key] = false;
            }, { passive: false });

            btn.addEventListener('touchcancel', () => {
                this.keys[key] = false;
            });

            // Mouse fallback for desktop testing
            btn.addEventListener('mousedown', () => { if (!this.editMode) this.keys[key] = true; });
            btn.addEventListener('mouseup',   () => { this.keys[key] = false; });
            btn.addEventListener('mouseleave',() => { this.keys[key] = false; });
        });
    }

    show() {
        const mc = document.getElementById('mobile-controls');
        if (mc) mc.style.display = 'block';
        const cogBtn = document.getElementById('ctrl-settings-btn');
        if (cogBtn) cogBtn.style.display = 'flex';
    }
}
