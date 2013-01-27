/*
 * Created by Martin Giger
 * Licensed under LGPLv3
 */


var Notifications = require("sdk/notifications");
var timer = require("sdk/timers");
var tabs = require("sdk/tabs");
var Request = require("sdk/request").Request;
var simplePrefs = require("sdk/simple-prefs");
var prefs = simplePrefs.prefs;
var passwords = require("sdk/passwords");
var self = require("sdk/self");
var _ = require("sdk/l10n").get;
var ss = require("sdk/simple-storage");

var livePanel;
var panelButton;
var intId;
var data = ss.storage;

exports.main = function() {
    if(self.loadReason=='install') {
        tabs.open("http://jtvn.humanoids.be/first-run.html");
    }
    else if(self.loadReason=='upgrade') {
        tabs.open("http://jtvn.humanoids.be/changes-"+self.version+".html");
    }
    
    if(prefs.updateInterval>0)
        intId = timer.setInterval(this.query,1000*prefs.updateInterval);
    else intId = false;
    
    // import add-on settings on first run/enable
    
    if(self.loadReason=='install'||self.loadReason=='enable'||self.loadReason=='upgrade') { // remove upgrade for next release
        this.init();
    }
    else if(data.quotaDisabled) {
        // reset data
        data = {};
        this.init();
    }
    
    // set up listeners
    
    ss.on("OverQuota", function() {
        // wipe storage
        data.channels = [];
        data.users = [];
        data.quoteDisabled = true;
        
        // set up local stuff
        
        data = {};
        this.init();
    });
    
    tabs.on('ready', function onOpen(tab) {
        exports.checkTab(tab);
    });
    tabs.on('close', function(tab) {
        exports.uncheckTab(tab);
    });
    tabs.on('activate', function(tab) {
        exports.checkTab(tab);
    });
    tabs.on('deactivate', function(tab) {
        exports.uncheckTab(tab);
    });
    simplePrefs.on('updateInterval',function() {
        if(intId)
            timer.clearInterval(intId);
        if(prefs.updateInterval>0)
            intId = timer.setInterval(exports.query,1000*prefs.updateInterval);
        else intId = false;
    });
    simplePrefs.on('channelList',function() {
        exports.setChannels({'name':'user','type':'user'},exports.getUsernames(prefs.channelList),false);
    });
    simplePrefs.on('usernameList',function() {
        exports.addUserFavorites();
    });
    simplePrefs.on('autoUsername',function() {
        exports.getLoginName();
    });
    
    // panel init
    var panelWidth = 212;
    livePanel = require("sdk/panel").Panel({
      width: panelWidth+12,
      contentURL: self.data.url("live-panel.html"),
      contentScriptOptions: {'minWidth':panelWidth}
    });
    panelButton = require("sdk/widget").Widget({
      label: _("live_widget_label"),
      tooltip: _("live_panel_label_offline"),
      id: "live-channels",
      contentURL: self.data.url("panel_icon_empty.png"),
      panel: livePanel
    });
    livePanel.port.on("openTab",function(url) {
        for(var channel in data.channels) {
            if(exports.compareUrl(url,channel)) {
                exports.openTab(channel);
            }
        }
    });
	livePanel.port.on("resizePanel",function(dimensions) {
        livePanel.resize(dimensions[0],dimensions[1]);
    });
    livePanel.port.on("refresh",function() {
        exports.query();
    });
};

exports.init = function() {
    data.channels = [];
    data.users = [];
    this.setChannels('user',prefs.channelList.split(','),false);
    this.addUserFavorites();
    this.getLoginName();
};

/*
 * settings handler
 */

exports.setChannels = function(source,channelNames,rich) {
    if(rich===undefined) {
        rich = false;
    }
    if(channelNames.length>0&&channelNames[0]!='') {
        // check for added channels
        var name;
        for each(var channel in channelNames) {
            this.addChannel(channel,source,rich);
        }
    }
    
    // check for removed channels
    // We don't need to check the usernames here, since this is done right after the entry field gets changed
    for(var channel in data.channels) {
        if(!this.exactArraySearch(channelNames,channel,rich)&&source.type!='username') {
            if(data.channels[channel].sources.onlySourceSet(source.type)) {
                this.removeChannel(channel);
            }
            else if(data.channels[channel].sources[source.type+'Set']) {
                data.channels[channel].sources[source.type+'Set'] = false;
            }
        }
    }
};

exports.addChannel = function(channel,source,rich) {
    var name = rich?channel.login:channel;
    var exists = this.channelExists(name);
    if(!exists&&!rich) {
            data.channels[name] = new Channel('queued',source);
            exports.checkRateLimit({'name':channel,'type':source.type},exports.getChannelDetails,false);
    }
    else if(!exists)
        data.channels[name] = new Channel('full',source,channel);
    else if(data.channels[name].status == 'queued'&&rich)
        data.channels[name].addRichInfo(channel);
    else
        data.channels[name].sources.setSource(source);
};

exports.removeChannel = function(channel,del) {
    if(del===undefined)
        del = true;
    if(data.channels[channel].live) {
        livePanel.port.emit('remove',data.channels[channel].names[0]);
            
        if(panelButton.contentURL == self.data.url("panel_icon.png")&&!this.liveStatus()) {
            panelButton.contentURL = self.data.url("panel_icon_empty.png");
            panelButton.tooltip = _("live_panel_label_offline");
        }
    }
    if(del)
        delete data.channels[channel];
};

exports.updateFavorites = function() {
    exports.addUserFavorites();
    exports.getLoginName();
};

exports.addUserFavorites = function() {
    data.users = [];
    if(prefs.usernameList!='') {
        var usernames = exports.getUsernames(prefs.usernameList);
        for(var username of usernames) {
           exports.checkRateLimit({'name':username,'type':'username'},exports.getUserFavorites,false);
           data.users.push(username);
        }
        
    }
    
    // we can directly check for removed channels here, since
    // possibly deferred channels of a removed username won't get added
    // in any case.
    for(var channel in data.channels) {
        for(var username in data.channels[channel].sources.usernames) {
            if(!this.exactArraySearch(data.users,data.channels[channel].sources.usernames[username],false)||data.users.length==0) {
                if(data.channels[channel].sources.onlySourceSet(data.channels[channel].sources.usernames[username])||data.users.length==0) {
                    this.removeChannel(channel);
                }
                else {
                    data.channels[channel].sources.usernames.splice(username,1);
                }
            }
        }
    }
};

exports.getLoginName = function() {
    if(prefs.autoUsername) {
         passwords.search({
            url: 'http://www.justin.tv',
            onComplete: function(credentials) {
                credentials.forEach(function(credential) {
                    exports.checkRateLimit({'name':credential.username,'type':'credentials'},exports.getUserFavorites,false);
                });
            }
         });
         passwords.search({
            url: 'http://www.twitch.tv',
            onComplete: function(credentials) {
                credentials.forEach(function(credential) {
                    exports.checkRateLimit({'name':credential.username,'type':'credentials'},exports.getUserFavorites,false);
                });
            }
         });
    }
    else {
        for(var channel in data.channels) {
            if(data.channels[channel].sources.onlySourceSet('credentials'))
				this.removeChannel(channel);
            else
                data.channels[channel].sources.credentialsSet = false;
        }
    }
};

exports.getUserFavorites = function(source,ignoreNull) {
    var favoritesRequest = Request({
        url: 'http://api.justin.tv/api/user/favorites/'+source.name+'.json',
        onComplete: function(response) {
            if(exports.checkResponse(response)) {
                if(exports.exactArraySearch(data.users,source.name,false)||source.type=='credentials')
                    exports.extractChannelsFromFavorites(source,response.json);
            }
            else if(!ignoreNull)
                timer.setTimeout(exports.checkRateLimit,100,source,exports.getUserFavorites,ignoreNull);
        }
    });
    favoritesRequest.get();
};

exports.getChannelDetails = function(source,ignoreNull) {
    var detailRequest = Request({
        url: 'http://api.justin.tv/api/channel/show/'+source.name+'.json',
        onComplete: function (response) {
            if(exports.checkResponse(response))  {
                if(!response.json.error && exports.channelExists(source.name) && data.channels[source.name].status=='queued') {
                    exports.addChannel(response.json,source,true);
                }
            }
            else if(!ignoreNull) {
                timer.setTimeout(exports.checkRateLimit,100,source,exports.getChannelDetails,ignoreNull);
            }
        }
    });
    detailRequest.get();
};

exports.extractChannelsFromFavorites = function(source,response) {
    if(response.length>0) {
        var channelNames = [];
        response.forEach(function(channel) {
            channelNames.push(channel);
        });
        this.setChannels(source,channelNames,true);
    }
};

exports.channelExists = function(channelName) {
    for(var channel in data.channels) {
        if(channelName==channel)
            return true;
    }
    return false;
};

exports.exactArraySearch = function(array, string, rich) {
    var name;
    for(var item of array) {
        name = (rich?item.login:item);
        if(string==name)
            return true;
    }
    return false;
};

exports.getUsernames = function(string) {
    return string.replace(" ","").split(','); // remove spaces andsplit by commas
};

/*
 * live status queries
 */

exports.query = function() {
    for(var channel in data.channels) {
        if(data.channels[channel].status=='full')
            exports.checkRateLimit(channel,exports.createQuery,true);    
    }
};

exports.checkRateLimit = function(channel,completeFunction,ignoreNull) {
    var rateRequest = Request({
        url: 'http://api.justin.tv/api/application/rate_limit_status.json?t='+new Date().getTime(),
        onComplete: function (response) {
            if(exports.checkResponse(response)) {
                if(!response.json.rate_limited)
                    completeFunction(channel,ignoreNull);
            }
            else if(!ignoreNull)
                timer.setTimeout(exports.checkRateLimit,100,channel,completeFunction,ignoreNull);
        }
    });
    rateRequest.get();
};

exports.createQuery = function(channel,ignoreNull) {
    var liveStatusRequest = Request({
        url: 'http://api.justin.tv/api/stream/list.json?channel='+channel,
        onComplete: function (response) {
            if(exports.checkResponse(response))
                exports.checkStatus(response.json,channel);
            else if(!ignoreNull)
                timer.setTimeout(exports.checkRateLimit,100,channel,exports.createQuery,ignoreNull);
        }
    });
    liveStatusRequest.get();
};

exports.checkResponse = function(response) {
    return response!=null&&response.status==200;
};

exports.checkStatus = function(result,channel) {
    try {
        if(result.length>0&&!data.channels[channel].live) {
            data.channels[channel].live = true;
            
			if(!data.channels[channel].mute&&prefs.onlineNotification)
				this.sendNotification(result[0].title,result[0].channel.image_url_medium,channel,true);
                
			data.channels[channel].image[0] = result[0].channel.image_url_tiny;
            data.channels[channel].image[1] = result[0].channel.image_url_medium;
			data.channels[channel].title = result[0].title;
            
            livePanel.port.emit('add',data.channels[channel]);
            
            if(panelButton.contentURL == self.data.url("panel_icon_empty.png")) {
                panelButton.contentURL = self.data.url("panel_icon.png");
                panelButton.tooltip = _("live_widget_label");
            }
        }
        else if(result.length>0&&data.channels[channel].live&&data.channels[channel].title!=result[0].title) {
            data.channels[channel].title = result[0].title;
            data.channels[channel].image[0] = result[0].channel.image_url_tiny;
            data.channels[channel].image[1] = result[0].channel.image_url_medium;
            
            if(!data.channels[channel].mute&&prefs.titleChangeNotification)
                this.sendNotification(result[0].title,result[0].channel.image_url_medium,channel,true);
        }
        else if(!result.length&&data.channels[channel].live) {
            this.removeChannel(channel,false);
        
            data.channels[channel].live = false;
            
            if(!data.channels[channel].mute&&prefs.offlineNotification)
				this.sendNotification( data.channels[channel].title, data.channels[channel].image[1],channel,false);
        }
    }
    catch(e) {}
};

exports.sendNotification = function(caption,icon,channel,live) {
    try {
        Notifications.notify({
            title: (live ? _("onlineNotification",data.channels[channel].getPrimaryName()) : _("offlineNotification",data.channels[channel].getPrimaryName())),
            text: caption,
            iconURL: icon,
            onClick: function() {
                exports.openTab(channel);
            }
        });
    }
    catch(e) {}
};

/*
 * Tab handlers
 */

exports.openTab = function(channel) {    
    for each(var tab in tabs) {
        if(this.compareUrl(tab.url,channel)) {
            tab.activate();
            return true;
        }
    }
    tabs.open(data.channels[channel].getUrl(1));
};


exports.checkTab = function(tab) {
    for(var channel in data.channels) {
        if(this.compareUrl(tab.url,channel)) {
            data.channels[channel].mute = true;
            data.channels[channel].tabIndex = tab.index;
        }
    }
    
    // if the location of a tab changes away from a stream page
    for(var channel in data.channels) {
        if(tab.index==data.channels[channel].tabIndex&&!this.compareUrl(tab.url,channel)) {
            data.channels[channel].mute = false;
            data.channels[channel].tabIndex = -1;
        }
    }
};

exports.compareUrl = function(aUrl,channel) {
    return data.channels[channel].url.some(function(value) {
        return 'http://'+value==aUrl||'http://www.'+value==aUrl;
    });
};

exports.uncheckTab = function(tab) {
    for(var channel in data.channels) {
        if(this.compareUrl(tab.url,channel)) {
            data.channels[channel].mute = false;
            data.channels[channel].tabIndex = -1;
        }
    }
};

exports.liveStatus = function() {
    for(channel of data.channels) {
        if(channel.live)
            return true;
    }
    return false;
}


/*
    Channel Object
*/

// properties
Channel.prototype.live=false;
Channel.prototype.mute=false;
Channel.prototype.title='';
Channel.prototype.tabIndex=-1;
Channel.prototype.url=[];
Channel.prototype.names=[];
Channel.prototype.sources=null;
Channel.prototype.image=[];
Channel.prototype.status='queued';

// constructor
function Channel(status,source,channelObj) {
    // init all the arrays, so they aren't global for all objects
    this.url = new Array();
    this.names = new Array();
    this.image = new Array();
    this.sources = new Sources(source);
    if(status=='full') {
		this.addRichInfo(channelObj);
    }
}

// methods
Channel.prototype.addRichInfo=function(channelRspObj) {
        this.status='full';
        
        /*
            we need to push array elements like beckham, so we don't modify the prototype.
            Actually constructing new Array object in the constructor adds a per-item array.
        */
        this.url.push(channelRspObj.channel_url.replace("http://",""));
        this.names.push(channelRspObj.title);
        this.names.push(channelRspObj.login);
        this.image.push(channelRspObj.image_url_tiny);
        this.image.push(channelRspObj.image_url_medium);
};
Channel.prototype.getPrimaryName = function() {
    try {
        return this.names[0].charAt(0).toUpperCase() + this.names[0].slice(1);
    }
    catch(e) {
        return '';
    }
};
Channel.prototype.getUrl = function(index) {
    if(index<=this.url.length)
        return 'http://'+this.url[index-1];
};


/*
    Sources Object
*/

Sources.prototype.userSet = false;
Sources.prototype.credentialsSet = false;
Sources.prototype.usernames = [];    
    
function Sources(source) {
    this.usernames = new Array();
    this.setSource(source);
}

Sources.prototype.setSource = function(source) {
        if(source.type=='username')
            this.usernames.push(source.name);
        else
            this[source.type+'Set'] = true;
};

Sources.prototype.onlySourceSet = function(sourceName) {
    var sourcePropertyName = sourceName+'Set';

    // bail if the source isn't even set (only for bool sources)
    if(!this[sourcePropertyName]&&typeof this[sourcePropertyName] === "boolean")
        return false;
    
    var suc; 
    for(var source in this) {
        if(Array.isArray(this[source])) {
            suc = this[source].every(function(item) {
                return item==sourceName;
            });
            if(!suc)
                return false;
        }
        // since this is a for in iteration, functions are also iterated, which aren't sources...
        else if(source!=sourcePropertyName&&this[source]&&typeof this[source] !== "function")
            return false;
    }
    return true;
};