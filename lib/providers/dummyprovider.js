/*
 * Created by Martin Giger
 * Licensed under LGPLv3
 */
 
"use strict";
var _ = require("sdk/l10n").get;
var { Channel, User } = require('../channeluser');

var type = "dummy",
    archiveURL = "http://example.com/%u/archive",
    headers = {};
exports.name         = _("provider_"+type);
exports.toString     = () => { return this.name; };
exports.authURL      = ["https://example.com"];

var qs = require("../queueservice").getServiceForProvider(type);

function requeue(data) {
    return false;
}

exports.getUserFavorites = function(username, userCallback, channelsCallback) {
    qs.queueRequest(username, headers, requeue, function(data) {
        userCallback(Object.assign(new User(), data.user));
        var channels = [];
        data.follows.forEach(function(channel) {
            channels.push(Object.assign(new Channel(), channel));
        });
        channelsCallback(channels);
    });
};
exports.getChannelDetails = function(channelname, callback) {
    qs.queueRequest(channelname, headers, requeue, function(data) {
        callback(Object.assign(new Channel(), data));
    });
};
exports.updateFavsRequest = function(users, callback) {
    qs.queueUpdateRequest(channels, headers, qs.LOW_PRIORITY, requeue, function(data) {
        callback(data);
    });
};
exports.removeFavsRequest = function() {
    qs.unqueueUpdateRequest(qs.LOW_PRIORITY);
};
exports.updateRequest = function(channels, callback) {
    qs.queueUpdateRequest(channels, headers, qs.HIGH_PRIORITY, requeue, function(data) {
        callback(data);
    });
};

exports.removeRequest = function() {
    qs.unqueueUpdateRequest(qs.HIGH_PRIORITY);
};

exports.updateChannel  = function(channelname, callback) {};
exports.updateChannels = function(channels, callback) {};

