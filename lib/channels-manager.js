/*
 * Created by Martin Giger
 * Licensed under MPL 2.0
 *
 * Model for the channels manager component
 */
//TODO migrate to page-mode
"use strict";

// setup event handling 
var { emit }        = require("sdk/event/core"),
    { EventTarget } = require("sdk/event/target"),

    tabs            = require("sdk/tabs"),
    passwords       = require("sdk/passwords"),
    self            = require("sdk/self"),
    { PageMod }     = require("sdk/page-mod");

var providers = require("./providers");

var list;

function ChannelsManager(chlist) {
    list = chlist;
    
    var that = this;
    PageMod({
        include: self.data.url("./channels-manager.html"),
        contentScriptFile: "./channels-manager.js",
        onAttach: function(worker) {
                list.getChannelsByType(null, function(channels) {
                    list.getUsersByType(null, function(users) {
                        worker.port.emit("initdata", {
                            channels : channels,
                            users    : users,
                            providers: providers 
                        });
                    });
                });
                worker.port.on("adduser",       that.addUserFavorites.bind(that));
                worker.port.on("autoadd",       that.getLoginName.bind(that));
                worker.port.on("addchannel",    that.addChannel.bind(that));
                worker.port.on("removechannel", that.removeChannel.bind(that));
                worker.port.on("removeuser",    that.removeUser.bind(that));
                worker.on("detach", function() {
                    that.worker = null;
                });
                that.worker = worker;
            }
    });
    for(var t in tabs) {
        if(tabs[t].url == self.data.url("./channels-manager.html")) {
            this.managerTab = tabs[t];
            this.managerTab.on("close", function onClose(tab) {
                that.managerTab = null;
            });
        }
    }
}

ChannelsManager.prototype = Object.create(EventTarget.prototype);

ChannelsManager.prototype.worker;
ChannelsManager.prototype.managerTab = null;

// singelton tab opener
ChannelsManager.prototype.open = function() {
    if(this.managerTab == null) {
        var that = this;
        tabs.open({
            url: "./channels-manager.html",
            onClose: function onClose(tab) {
                that.managerTab = null;
            },
            onLoad: function onLoad(tab) {
                that.managerTab = tab;
            },
            onPageshow: function onPageshow(tab) {
                that.managerTab = tab;
            }
        });
    }
    else {
        this.managerTab.activate();
    }
};

ChannelsManager.prototype.addChannel = function(name, type) {
    providers[type].getChannelDetails(name, list.addChannel.bind(list));
};

ChannelsManager.prototype.removeChannel = function(channelId) {
    list.removeChannel(channelId);
};

ChannelsManager.prototype.removeUser = function(userId) {
    list.removeUser(userId);
};

ChannelsManager.prototype.updateFavorites = function() {
    var users = list.getUsersByType();
    users.forEach(function(user) {
        this.addUserFavorites(user.login, user.type);
    }, this);
};

ChannelsManager.prototype.addUserFavorites = function(username,type) {
    providers[type].getUserFavorites(username, list.addUser.bind(list), list.addChannels.bind(list));
};

// check the credentials for a credential.login for the provider
ChannelsManager.prototype.getLoginName = function(provider) {
    console.debug("Searching login name for "+provider);
    var that = this;
    passwords.search({
        url: providers[provider].authURL,
        onComplete: (function(credentials) {
            credentials.forEach(function(credential) {
                console.debug("Found a credential for "+provider);
                this.addUserFavorites(provider, credential.username);
            });
        }).bind(that)
    });
};

ChannelsManager.prototype.onChannelAdded = function(channelObj) {
    if(this.worker)
        this.worker.port.emit("add", channelObj);
};
ChannelsManager.prototype.onChannelRemoved = function(channelId) {
    if(this.worker)
        this.worker.port.emit("remove", channelId);
};
ChannelsManager.prototype.onChannelUpdated = function(channelObj) {
    if(this.worker)
        this.worker.port.emit("update", channelObj);
};
ChannelsManager.prototype.onUserAdded = function(user) {
    if(this.worker)
        this.worker.port.emit("adduser", user);
};
ChannelsManager.prototype.onUserRemoved = function(userId) {
    if(this.worker)
        this.worker.port.emit("removeuser", userId);
};

exports.ChannelsManager = ChannelsManager;

