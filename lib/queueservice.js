/*
 * Created by Martin Giger
 * Licensed under MPL 2.0
 *
 *
 * Queue service for providers
 */

//TODO auto update favs?

"use strict";

const { UpdateQueue } = require("./queue");

const queue    = new UpdateQueue(),
      services = {};
var qoptions = null;
exports.getServiceForProvider = function(providerName) {
    if(!services.hasOwnProperty(providerName)) {
        services[providerName] = new QueueService();
    }
    return services[providerName];
};

exports.setQueueOptions = function(options) {
    console.log("setting queue options:"+options.toSource());
    qoptions = options;
    queue.autoFetch(options.interval,
                    options.amount,
                    options.maxSize);
};
exports.updateQueueOptions = function(interval) {
    console.log("setting interval to "+interval);
    qoptions.interval = interval;
    queue.changeInterval(interval, qoptions.amount, qoptions.maxSize);
};
exports.pause = function() {
    queue.changeInterval(0);
};
exports.resume = function() {
    if(qoptions)
        queue.changeInterval(qoptions.interval, qoptions.amount, qoptions.maxSize);
};
exports.addQueueListeners = function(containsPriorized, priorizedLoaded) {
    if(containsPriorized)
        queue.on("queuepriorized", containsPriorized);
    if(priorizedLoaded)
        queue.on("allpriorizedloaded", priorizedLoaded);
};

QueueService.prototype.updateRequestIds = [];
function QueueService() {
    this.updateRequestIds = [];
}

QueueService.prototype.queueRequest = function(url, headers, requeue, callback) {
    console.log("Queueing "+url);
    queue.getRequestById(queue.addRequest({
        url: url,
        headers: headers,
        onComplete: (function(data) {
            console.log("Request done");
            if(requeue(data))
                this.queueRequest(url, headers, requeue, callback);
            else
                callback(data);
        }).bind(this)
    }, false, true));
};

QueueService.prototype.unqueueUpdateRequest = function() {
    if(this.updateRequestIds.length > 0) {
        this.updateRequestIds.forEach(function(reqId) {
            queue.removeRequest(reqId);
        });
        this.updateRequestIds.length = 0;
    }
};

QueueService.prototype.queueUpdateRequest = function(urls, headers, requeue, callback) {
    console.log("Requeueing update request");
    this.unqueueUpdateRequest();

    urls.forEach(function(url) {
        this.updateRequestIds.push(queue.addRequest({
            url: url,
            headers: headers,
            onComplete: function(data) {
                if(!requeue(data)) callback(data);
            }
        }, true));
    }, this);
};
