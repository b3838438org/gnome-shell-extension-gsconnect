'use strict';

const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const St = imports.gi.St;

const ModalDialog = imports.ui.modalDialog;
const PopupMenu = imports.ui.popupMenu;
const Util = imports.misc.util;

const _ = gsconnect._;
const Tooltip = imports.shell.tooltip;


/**
 * A simple implementation of GtkRadioButton for St
 */
var RadioButton = GObject.registerClass({
    GTypeName: 'GSConnectShellRadioButton'
}, class RadioButton extends St.BoxLayout {

    _init(params) {
        params = Object.assign({
            text: null,
            widget: null,
            group: [],
            active: false,
            tooltip_markup: false,
            tooltip_text: false
        }, params);

        super._init({
            style_class: 'radio-button',
            style: 'spacing: 6px;',
            vertical: false
        });

        this.button = new St.Button({
            style_class: 'pager-button',
            child: new St.Icon({ icon_name: 'radio-symbolic', icon_size: 16 })
        });
        this.add_child(this.button);

        this.add_child(new St.Label());

        if (params.text) {
            this.text = params.text;
        } else {
            this.widget = params.widget;
        }

        //
        this.button.connect('clicked', () => {
            this.active = true;
        });

        // Group
        this.group = params.group;
        this.connect('destroy', () => {
            this.group.splice(this.group.indexOf(this), 1);
        });

        this.active = params.active;

        // Tooltip
        this.tooltip = new Tooltip.Tooltip({ parent: this });

        if (params.tooltip_markup) {
            this.tooltip.markup = params.tooltip_markup;
        } else if (params.tooltip_text) {
            this.tooltip.text = params.tooltip_text;
        }
    }

    get active() {
        return (this.button.child.icon_name === 'radio-checked-symbolic');
    }

    set active(bool) {
        if (bool) {
            this.button.child.icon_name = 'radio-checked-symbolic';

            for (let radio of this.group) {
                if (radio !== this) {
                    radio.button.child.icon_name = 'radio-symbolic';
                }
            }
        } else {
            this.button.child.icon_name = 'radio-symbolic';
        }
    }

    get group() {
        return this._group;
    }

    set group(group) {
        this._group = group;

        if (this._group.indexOf(this) < 0) {
            this._group.push(this);
        }

        this.active = (this.group.length === 1);
    }

    get text() {
        if (this.widget instanceof St.Label) {
            return this.widget.text;
        }

        return null;
    }

    set text(text) {
        if (typeof text === 'string') {
            this.widget = new St.Label({ text: text });
        }
    }

    get widget () {
        return this.get_child_at_index(1);
    }

    set widget (widget) {
        if (widget instanceof Clutter.Actor) {
            widget.y_align = Clutter.ActorAlign.CENTER
            this.replace_child(this.widget, widget);
        }
    }
});


var Dialog = class Dialog extends ModalDialog.ModalDialog {

    _init() {
        super._init({ styleClass: 'gsconnect-dnd-dialog' });

        let headerBar = new St.BoxLayout({
            style_class: 'nm-dialog-header-hbox'
        });
        this.contentLayout.add(headerBar);

        this._icon = new St.Icon({
            style_class: 'nm-dialog-header-icon',
            gicon: new Gio.ThemedIcon({
                name: 'preferences-system-time-symbolic'
            })
        });
        headerBar.add(this._icon);

        let titleBox = new St.BoxLayout({ vertical: true });
        headerBar.add(titleBox);

        this._title = new St.Label({
            style_class: 'nm-dialog-header',
            text: _('Do Not Disturb')
        });
        titleBox.add(this._title);

        this._subtitle = new St.Label({
            style_class: 'nm-dialog-subheader',
            text: _('Silence Mobile Device Notifications')
        });
        titleBox.add(this._subtitle);

        this.content = new St.BoxLayout({
            vertical: true
        });
        this.contentLayout.style_class = 'nm-dialog-content gsconnect-dnd-dialog-content';
        this.contentLayout.add(this.content);

        // 1 hour in seconds
        this._time = 1*60*60;

        this.permButton = new RadioButton({
            text: _('Until you turn off Do Not Disturb')
        });
        this.content.add(this.permButton);

        // Duration Timer
        this.timerWidget = new St.BoxLayout({
            vertical: false,
            x_expand: true
        });

        let now = GLib.DateTime.new_now_local();
        this.timerLabel = new St.Label({
            text: _('Until %s (%s)').format(
                Util.formatTime(now.add_seconds(this._time)),
                this._getDurationLabel()
            ),
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER
        });
        this.timerWidget.add_child(this.timerLabel);

        this.minusTime = new St.Button({
            style_class: 'pager-button',
            child: new St.Icon({ icon_name: 'list-remove-symbolic' })
        });
        this.minusTime.connect('clicked', this._minusTime.bind(this));
        this.timerWidget.add_child(this.minusTime);

        this.plusTime = new St.Button({
            style_class: 'pager-button',
            child: new St.Icon({ icon_name: 'list-add-symbolic' })
        });
        this.plusTime.connect('clicked', this._plusTime.bind(this));
        this.timerWidget.add_child(this.plusTime);

        this.timerButton = new RadioButton({
            widget: this.timerWidget,
            group: this.permButton.group,
            active: true
        });
        this.content.add(this.timerButton);

        // Dialog Buttons
        this.setButtons([
            { label: _('Cancel'), action: this._cancel.bind(this), default: true },
            { label: _('Done'), action: this._done.bind(this) }
        ]);
    }

    _cancel() {
        gsconnect.settings.reset('donotdisturb');
        this.close();
    }

    _done() {
        let time;

        if (this.timerButton.active) {
            let now = GLib.DateTime.new_now_local();
            time = now.add_seconds(this._time).to_unix();
        } else {
            time = GLib.MAXINT32;
        }

        gsconnect.settings.set_int('donotdisturb', time);
        this.close();
    }

    _minusTime() {
        if (this._time <= 60*60) {
            this._time -= 15*60;
        } else {
            this._time -= 60*60;
        }

        this._setTimeLabel();
    }

    _plusTime() {
        if (this._time < 60*60) {
            this._time += 15*60;
        } else {
            this._time += 60*60;
        }

        this._setTimeLabel();
    }

    _getDurationLabel() {
        if (this._time >= 60*60) {
            let hours = this._time / 3600;
            // TRANSLATORS: Time duration in hours (eg. 2 hours)
            return gsconnect.ngettext('One hour', '%d hours', hours).format(hours);
        } else {
            // TRANSLATORS: Time duration in minutes (eg. 15 minutes)
            return _('%d minutes').format(this._time / 60);
        }
    }

    _setTimeLabel() {
        this.minusTime.reactive = (this._time > 15*60);
        this.plusTime.reactive = (this._time < 12*60*60);

        let now = GLib.DateTime.new_now_local();

        // TRANSLATORS: Time until change with time duration
        // EXAMPLE: Until 10:00 (2 hours)
        this.timerLabel.text = _('Until %s (%s)').format(
            Util.formatTime(now.add_seconds(this._time)),
            this._getDurationLabel()
        );
    }
}


var MenuItem = class MenuItem extends PopupMenu.PopupSwitchMenuItem {

    _init() {
        super._init(_('Do Not Disturb'), false);

        // Update the toggle state when 'paintable'
        this.actor.connect('notify::mapped', () => {
            let now = GLib.DateTime.new_now_local().to_unix();
            this.setToggleState(gsconnect.settings.get_int('donotdisturb') > now);
        });

        this.connect('toggled', (item) => {
            // The state has already been changed when this is emitted
            if (item.state) {
                let dialog = new Dialog();
                dialog.open();
            } else {
                gsconnect.settings.reset('donotdisturb');
            }

            item._getTopMenu().close(true);
        });
    }
}

