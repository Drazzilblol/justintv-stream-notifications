/*
 * Created by Martin Giger
 * Licensed under LGPLv3
 *
 *
 * Model for the Panel
 */

const { Panel } = require('sdk/panel');
const { ToggleButton } = require('sdk/ui');
var { prefs } = require("sdk/simple-prefs");

const liveIcons = {
    "18": "./icon18.png",
    "32": "./icon32.png",
    "36": "./icon36.png", //hidpi
    "64": "./icon64.png" // hidpi
},
offlineIcons = {
    "18": "./offline18.png",
    "32": "./offline32.png",
    "36": "./offline36.png", //hidpi
    "64": "./offline64.png" // hidpi
};

ListView.prototype.button = null;
ListView.prototype.panel = null;
function ListView(live) {
    var liveState = live,
        that      = this;
    Object.defineProperties(this, {
        "liveState": {
            get: function() {
                return liveState;
            },
            set: function(val) {
                liveState = val;
                if(val) {
                    this.button.icon = liveIcons;
                    this.button.label = _("live_widget_label");
                }
                else {
                    this.button.icon = offlineIcons;
                    this.button.label = _("live_panel_label_offline");
                }
            }
        },
        "minWidth": {
            writable: false,
            get: function() {
                return prefs.panel_minWidth;
            }
        }
    });

    // Construct Buttons
    this.button = ToggleButton({
        id: "live-channels-button",
        label: this.liveState?_("live_widget_label"):_("live_panel_label_offline"),
        icon: this.liveState?liveIcons:offlineIcons,
        onClick: (function(state) {
            if(!state.checked)
                this.panel.hide();
            else
                this.panel.show({position: this.button});
        }).bind(that)
    });
    this.panel = Panel({
        width: that.panelWidth,
        contentURL: "./list.xul",
        contentScriptOptions: {
            "minWidth": that.panelWidth
        }
    });

    this.panel.on("hide", (function() {
        if(this.button.state("window").checked)
            this.button.state("window", {"checked": false});
    }).bind(this));
    this.panel.port.on("resizePanel", (function(dimensions) {
        this.panel.resize(dimensions[0], dimensions[1]);
    }).bind(this));

    this.panel.port.on("offline", function() {
        this.liveState = false;
    });
}

ListView.prototype.addChannels = function(channels) {
    this.panel.port.emit("updateChannels", channels);
};
ListView.prototype.removeChannels = function(channels) {
    this.panel.port.emit("updateChannels", channels);
};
ListView.setChannelsLive = function(channels) {
    this.liveState = true;
};
ListView.setChannelsOffline = function(channels) {
    this.panel.port.emit("setOffline", channels);
};

// open tab

exports.ListView = ListView;