/*
 * Created by Martin Giger
 * Licensed under MPL 2.0
 *
 *
 * Controller of the extension
 */

//TODO l10n. Everywhere.

"use strict";

var prefs = require('sdk/simple-prefs'),
    self  = require('sdk/self'),
    tabs  = require('sdk/tabs');

var { ListView }        = require('./listview'),
    { Notifier }        = require('./notifier'),
    { UpdateQueue }     = require('./queue'),
    { ChannelList }     = require('./channellist'),
    { ChannelsManager } = require('./channels-manager'),
    qs                  = require('./queueservice');

const BASE_URL = "http://jtvn.humanoids.be";

// setup objects and events
var view, cm,
    notifier = new Notifier({
        onlineNotifications : prefs.prefs.onlineNotification,
        titleNotifications  : prefs.prefs.titleChangeNotification,
        offlineNotifications: prefs.prefs.offlineNotification
    }),
    list     = new ChannelList({
        onReady: function() {
            list.liveStatus(false, function(live) {
                view = new ListView(live, 1);
            });
            cm = new ChannelsManager(list);
        },
        onChannelupdated: function(channel) {
            notifier.sendNotification(channel);
            cm.onChannelUpdated(channel);
            //TODO ListView
        },
        onUserupdated: function(user) {
            cm.onUserUpdated(user);
        },
        onChannelsadded: function(channels) {
            channels.forEach(function(channel) {
                cm.onChannelAdded(channel);
            });
            //TODO requeue update request
            //TODO listview
        },
        onUseradded: function(user) {
            cm.onUserAdded(user);
        },
        onBeforechanneldeleted: function(channel) {
            //TODO requeue update request
        },
        onChanneldeleted: function(channelId) {
            cm.onChannelRemoved(channelId);
            notifier.onChannelRemoved(channelId);
            //TODO listview
        },
        onUserdeleted: function(userId) {
            cm.onUserRemoved(userId);
        }
    });

qs.setQueueOptions({
    interval: 1000*prefs.prefs.updateInterval,
    amount:   1/prefs.prefs.queue_ratio,
    maxSize:  prefs.prefs.queue_maxRequestBatchSize
});

// Preference change listeners
prefs.on("manageChannels", function() {
    cm.open();
});

prefs.on("onlineNotification", function() {
    notifier.onlineNotifications = prefs.prefs.onlineNotification;
});

prefs.on("titleChangeNotification", function() {
    notifier.titleNotifications = prefs.prefs.titleChangeNotification;
});

prefs.on("offlineNotification", function() {
    notifier.offlineNotifications = prefs.prefs.offlineNotification;
});

prefs.on("updateInterval", function() {
    qs.updateQueueOptions(1000*prefs.prefs.updateInterval);
});

// extension installation/upgrade stuff
if(self.loadReason == "install") {
    if(prefs.prefs.updateTab) // respect user's prefs that reinstall the extension
        tabs.open({url: BASE_URL + "/first-run.html"});
}
else if(self.loadReason == "upgrade") {
    if(prefs.prefs.updateTab)
        tabs.open({url: BASE_URL + "/changes-" + self.version + ".html"});

    //TODO migrate channels to channels-manager
}

