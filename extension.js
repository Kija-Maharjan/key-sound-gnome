const { Gio, GLib, GObject, St, Clutter, Meta, Shell, PopupMenu } = imports.gi;
const Main = imports.ui.main;
const QuickSettings = imports.ui.quickSettings;
const ExtensionUtils = imports.misc.extensionUtils;

const SOUND_SETS = {
  click1:  { label: 'Osu', icon: '🌸' },
  click2:  { label: 'Hitokage', icon: '🔥' },
  click3:  { label: 'Semimecha', icon: '⚙️' },
  click4:  { label: 'Lubed', icon: '🧈' },
  click5:  { label: 'Nk cream', icon: '🎵' },
  click6:  { label: 'Topre', icon: '💎' },
  click7:  { label: 'Mx Black', icon: '🖤' },
  click14: { label: 'Stealth', icon: '🌙' },
  click15: { label: 'Box Pink', icon: '🌸' },
  click16: { label: 'Gateron Yellow', icon: '💛' },
};

const SOUND_FILE_MAP = {
  click1:  ['click1/click1_1.wav','click1/click1_2.wav','click1/click1_3.wav'],
  click2:  ['click2/click2_1.wav','click2/click2_2.wav','click2/click2_3.wav'],
  click3:  ['click3/click3_1.wav','click3/click3_2.wav','click3/click3_3.wav'],
  click4:  ['click4/click4_1.wav','click4/click4_2.wav','click4/click4_3.wav'],
  click5:  ['click5/click5_1.wav','click5/click5_2.wav','click5/click5_3.wav'],
  click6:  ['click6/click6_1.wav','click6/click6_2.wav','click6/click6_3.wav'],
  click7:  ['click7/click7_1.wav','click7/click7_2.wav','click7/click7_3.wav'],
  click14: ['click14/click14_1.wav','click14/click14_2.wav','click14/click14_3.wav'],
  click15: ['click15/click15_1.wav','click15/click15_2.wav','click15/click15_3.wav'],
  click16: ['click16/click16_1.wav','click16/click16_2.wav','click16/click16_3.wav'],
};

let settings = null;
let keyPressHandlerId = 0;
let playbin = null;
let quickSettingsToggle = null;

function init() {
    ExtensionUtils.initTranslations();
}

function enable() {
    settings = ExtensionUtils.getSettings();

    // Initialize GStreamer
    const Gst = imports.gi.Gst;
    Gst.init(null);

    playbin = Gst.ElementFactory.make('playbin', 'playbin');

    // Connect to key press events
    keyPressHandlerId = global.display.connect('key-press-event', onKeyPress);

    // Add Quick Settings toggle
    quickSettingsToggle = new KeySoundToggle();
    Main.panel.statusArea.quickSettings.addExternalIndicator(quickSettingsToggle);
}

function disable() {
    if (keyPressHandlerId) {
        global.display.disconnect(keyPressHandlerId);
        keyPressHandlerId = 0;
    }

    if (playbin) {
        playbin.set_state(imports.gi.Gst.State.NULL);
        playbin = null;
    }

    if (quickSettingsToggle) {
        Main.panel.statusArea.quickSettings.removeExternalIndicator(quickSettingsToggle);
        quickSettingsToggle.destroy();
        quickSettingsToggle = null;
    }

    settings = null;
}

function onKeyPress(display, event) {
    if (!settings.get_boolean('enabled')) {
        return;
    }

    const soundStyle = settings.get_string('sound-style');
    const paths = SOUND_FILE_MAP[soundStyle];
    if (!paths) return;

    const path = paths[Math.floor(Math.random() * paths.length)];
    playSound(path);
}

function playSound(filename) {
    if (!playbin) return;

    const extensionPath = ExtensionUtils.getCurrentExtension().path;
    const filePath = GLib.build_filenamev([extensionPath, 'sound', filename]);

    playbin.set_property('uri', 'file://' + filePath);
    playbin.set_property('volume', settings.get_double('volume'));

    playbin.set_state(imports.gi.Gst.State.PLAYING);
}

const KeySoundToggle = GObject.registerClass(
class KeySoundToggle extends QuickSettings.QuickToggle {
    _init() {
        super._init({
            title: 'Key Sound',
            iconName: 'audio-volume-high-symbolic',
            toggleMode: true,
        });

        this.connect('clicked', () => {
            settings.set_boolean('enabled', this.checked);
        });

        settings.bind('enabled', this, 'checked', Gio.SettingsBindFlags.DEFAULT);

        // Add menu for sound style selection
        this.menu.setHeader('audio-volume-high-symbolic', 'Key Sound Settings');

        // Volume slider
        const volumeItem = new VolumeSliderItem();
        this.menu.addMenuItem(volumeItem);

        // Sound style section
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem('Sound Style'));

        // Add items for each sound style
        Object.entries(SOUND_SETS).forEach(([key, info]) => {
            const item = new SoundStyleItem(key, info);
            this.menu.addMenuItem(item);
        });
    }
});

const VolumeSliderItem = GObject.registerClass(
class VolumeSliderItem extends QuickSettings.QuickSlider {
    _init() {
        super._init({
            iconName: 'audio-volume-high-symbolic',
        });

        this.slider.connect('notify::value', () => {
            settings.set_double('volume', this.slider.value);
        });

        settings.bind('volume', this.slider, 'value', Gio.SettingsBindFlags.DEFAULT);
    }
});

const SoundStyleSubmenu = GObject.registerClass(
class SoundStyleSubmenu extends QuickSettings.QuickMenuToggle {
    _init() {
        super._init({
            title: 'Sound Style',
            subtitle: SOUND_SETS[settings.get_string('sound-style')].label,
        });

        this.connect('clicked', () => {
            this.toggle();
        });

        // Add radio buttons for each sound style
        Object.entries(SOUND_SETS).forEach(([key, info]) => {
            const item = new SoundStyleItem(key, info);
            this.menu.addMenuItem(item);
        });
    }
});

const SoundStyleItem = GObject.registerClass(
class SoundStyleItem extends PopupMenu.PopupMenuItem {
    _init(styleKey, styleInfo) {
        super._init(styleInfo.label + ' ' + styleInfo.icon);

        this.styleKey = styleKey;

        this.connect('activate', () => {
            settings.set_string('sound-style', this.styleKey);
        });

        // Check if this is the current style
        if (settings.get_string('sound-style') === styleKey) {
            this.setOrnament(PopupMenu.Ornament.DOT);
        }
    }
});
