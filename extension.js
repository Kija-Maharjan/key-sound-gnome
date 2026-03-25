// SPDX-License-Identifier: GPL-2.0-or-later
'use strict';

const { Gio, GLib, GObject, St, PopupMenu } = imports.gi;
const Main = imports.ui.main;
const QuickSettings = imports.ui.quickSettings;
const ExtensionUtils = imports.misc.extensionUtils;

// ✅ SOUND_SETS kept — labels and emojis preserved
const SOUND_SETS = {
    click1:  { label: 'Osu',            icon: '🌸' },
    click2:  { label: 'Hitokage',       icon: '🔥' },
    click3:  { label: 'Semimecha',      icon: '⚙️'  },
    click4:  { label: 'Lubed',          icon: '🧈' },
    click5:  { label: 'Nk cream',       icon: '🎵' },
    click6:  { label: 'Topre',          icon: '💎' },
    click7:  { label: 'Mx Black',       icon: '🖤' },
    click14: { label: 'Stealth',        icon: '🌙' },
    click15: { label: 'Box Pink',       icon: '🌸' },
    click16: { label: 'Gateron Yellow', icon: '💛' },
};

// ✅ WAV file list kept
const SOUND_FILE_MAP = {
    click1:  ['click1/click1_1.wav',   'click1/click1_2.wav',   'click1/click1_3.wav'],
    click2:  ['click2/click2_1.wav',   'click2/click2_2.wav',   'click2/click2_3.wav'],
    click3:  ['click3/click3_1.wav',   'click3/click3_2.wav',   'click3/click3_3.wav'],
    click4:  ['click4/click4_1.wav',   'click4/click4_2.wav',   'click4/click4_3.wav'],
    click5:  ['click5/click5_1.wav',   'click5/click5_2.wav',   'click5/click5_3.wav'],
    click6:  ['click6/click6_1.wav',   'click6/click6_2.wav',   'click6/click6_3.wav'],
    click7:  ['click7/click7_1.wav',   'click7/click7_2.wav',   'click7/click7_3.wav'],
    click14: ['click14/click14_1.wav', 'click14/click14_2.wav', 'click14/click14_3.wav'],
    click15: ['click15/click15_1.wav', 'click15/click15_2.wav', 'click15/click15_3.wav'],
    click16: ['click16/click16_1.wav', 'click16/click16_2.wav', 'click16/click16_3.wav'],
};

// Module-level state
let _settings = null;
let _keyPressHandlerId = 0;
let _playbin = null;          // ✅ GStreamer playbin (replaces AudioContext)
let _quickSettingsToggle = null;

// ---------------------------------------------------------------------------
// Extension lifecycle
// ---------------------------------------------------------------------------

function init() {
    ExtensionUtils.initTranslations();
}

function enable() {
    // ✅ GSettings (replaces chrome.storage)
    _settings = ExtensionUtils.getSettings();

    // ✅ GStreamer (replaces AudioContext / WebAudio)
    const Gst = imports.gi.Gst;
    Gst.init(null);
    _playbin = Gst.ElementFactory.make('playbin', 'playbin');

    _keyPressHandlerId = global.display.connect('key-press-event', _onKeyPress);

    _quickSettingsToggle = new KeySoundToggle();
    Main.panel.statusArea.quickSettings.addExternalIndicator(_quickSettingsToggle);
}

function disable() {
    if (_keyPressHandlerId) {
        global.display.disconnect(_keyPressHandlerId);
        _keyPressHandlerId = 0;
    }

    if (_playbin) {
        _playbin.set_state(imports.gi.Gst.State.NULL);
        _playbin = null;
    }

    if (_quickSettingsToggle) {
        Main.panel.statusArea.quickSettings.removeExternalIndicator(_quickSettingsToggle);
        _quickSettingsToggle.destroy();
        _quickSettingsToggle = null;
    }

    _settings = null;
}

// ---------------------------------------------------------------------------
// Playback — merged from popup.js, Chrome APIs replaced with GJS equivalents
// ---------------------------------------------------------------------------

function _onKeyPress(_display, _event) {
    if (!_settings.get_boolean('enabled'))
        return;

    const soundStyle = _settings.get_string('sound-style');
    const paths = SOUND_FILE_MAP[soundStyle];
    if (!paths) return;

    // ✅ Randomization logic kept
    const path = paths[Math.floor(Math.random() * paths.length)];
    _playSound(path);
}

function _playSound(filename) {
    if (!_playbin) return;

    const extensionPath = ExtensionUtils.getCurrentExtension().path;
    const filePath = GLib.build_filenamev([extensionPath, 'sound', filename]);

    // Reset to READY before switching URI so GStreamer flushes cleanly
    _playbin.set_state(imports.gi.Gst.State.READY);
    _playbin.set_property('uri', `file://${filePath}`);

    // ✅ Volume scaling 0.0–1.0 kept (replaces WebAudio GainNode)
    _playbin.set_property('volume', _settings.get_double('volume'));

    _playbin.set_state(imports.gi.Gst.State.PLAYING);
}

// ---------------------------------------------------------------------------
// GJS Menu items (replaces popup.html / popup.js DOM widgets)
// ---------------------------------------------------------------------------

// Volume slider in the Quick Settings panel menu
const VolumeSliderItem = GObject.registerClass(
class VolumeSliderItem extends QuickSettings.QuickSlider {
    _init() {
        super._init({ iconName: 'audio-volume-high-symbolic' });

        this.slider.connect('notify::value', () => {
            // ✅ Volume scaling 0.0–1.0 written to GSettings
            _settings.set_double('volume', this.slider.value);
        });

        // ✅ GSettings bind (replaces chrome.storage listener)
        _settings.bind('volume', this.slider, 'value', Gio.SettingsBindFlags.DEFAULT);
    }
});

// One menu row per sound style — replaces the HTML button grid in popup.js
const SoundStyleItem = GObject.registerClass(
class SoundStyleItem extends PopupMenu.PopupMenuItem {
    _init(styleKey, styleInfo) {
        // ✅ Emojis and labels kept
        super._init(`${styleInfo.icon}  ${styleInfo.label}`);

        this._styleKey = styleKey;

        this.connect('activate', () => {
            // ✅ GSettings (replaces chrome.storage.sync.set)
            _settings.set_string('sound-style', this._styleKey);
            _updateStyleOrnaments();

            // Preview selected sound on click — mirrors popup.js playPreview()
            const paths = SOUND_FILE_MAP[this._styleKey];
            _playSound(paths[Math.floor(Math.random() * paths.length)]);
        });

        if (_settings.get_string('sound-style') === styleKey)
            this.setOrnament(PopupMenu.Ornament.DOT);
    }
});

// Holds all SoundStyleItems so ornaments can be refreshed on selection change
let _styleItems = [];

function _updateStyleOrnaments() {
    const current = _settings.get_string('sound-style');
    _styleItems.forEach(item => {
        item.setOrnament(
            item._styleKey === current
                ? PopupMenu.Ornament.DOT
                : PopupMenu.Ornament.NONE
        );
    });
}

// Main Quick Settings toggle — replaces the popup.html enable toggle + container
const KeySoundToggle = GObject.registerClass(
class KeySoundToggle extends QuickSettings.QuickToggle {
    _init() {
        super._init({
            title: 'Key Sound',
            iconName: 'audio-volume-high-symbolic',
            toggleMode: true,
        });

        // ✅ GSettings bind for enabled state (replaces chrome.storage)
        _settings.bind('enabled', this, 'checked', Gio.SettingsBindFlags.DEFAULT);
        this.connect('clicked', () => _settings.set_boolean('enabled', this.checked));

        this.menu.setHeader('audio-volume-high-symbolic', 'Key Sound Settings');

        // Volume slider row
        this.menu.addMenuItem(new VolumeSliderItem());

        // Sound style section
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem('Sound Style'));

        // Build one menu item per style — replaces buildStyleGrid() from popup.js
        _styleItems = [];
        Object.entries(SOUND_SETS).forEach(([key, info]) => {
            const item = new SoundStyleItem(key, info);
            _styleItems.push(item);
            this.menu.addMenuItem(item);
        });

        // Keep ornaments in sync when sound-style changes externally
        _settings.connect('changed::sound-style', _updateStyleOrnaments);
    }
});
