/*
 * Created by Martin Giger
 * Licensed under MPL 2.0
 *
 *
 * Channels Manager content script
 */

// Add-on communication backend

var providers;
self.port.on("add", function(channel){
    addChannel(channel);
});
self.port.on("remove", function(channelId){
    removeChannel(channelId);
});
self.port.on("update", function(channel){
    updateChannel(channel);
});
self.port.on("adduser", function(user){
    addUser(user);
});
self.port.on("removeuser", function(userId){
    removeUser(userId);
});
self.port.on("initdata", function(options){
    providers = options.providers;

    var providerDropdown = document.querySelector("#providerDropdown");
    for(var provider in providers) {
        var option = document.createElement("option");
        option.value = provider;
        option.innerHTML = providers[provider].name;
        providerDropdown.appendChild(option);
    }

    options.channels.forEach(function(channel) {
        addChannel(channel);
    });
    options.users.forEach(function(user) {
        addUser(user);
    });
});

// Methods modifying the DOM

var channels = document.querySelector("#channels"),
    users    = document.querySelector("#users"),
    popup    = document.querySelector("#popup");

function checkChannel() {
    popup.querySelector("#channelRadio").checked = true;
    popup.querySelector("#userRadio").checked = false;
}

function checkUser() {
    popup.querySelector("#channelRadio").checked = false;
    popup.querySelector("#userRadio").checked = true;
}

if(document.querySelector(".tabbed a.current").dataset.tab == 1) {
    hide(document.querySelector("#autoAdd"));
    checkChannel();
}
else
    checkUser();

document.querySelector("main.tabbed").addEventListener("tabchanged", function(evt) {
    if(evt.detail == 1) {
        hide(document.querySelector("#autoAdd"));
        checkChannel();
    }
    else if(evt.detail == 2) {
        show(document.querySelector("#autoAdd"));
        checkUser();
    }
});

document.querySelector("#autoAdd").addEventListener("click", function(evt) {
    for(var provider in providers) {
        self.port.emit("autoadd", provider);
    }
});

document.querySelector("#showDialog").addEventListener("click", function(evt) {
    showDialog();
});

document.querySelector("#removeItem").addEventListener("click", function(evt) {
    if(users.classList.contains("hidden")) {
        if(channels.querySelector(".selected")) {
            //TODO extract numeric part from ID
            self.port.emit("removechannel", parseInt(channels.querySelector(".selected").id, 10));
        }
    }
    else {
        if(users.querySelector(".selected"))
            self.port.emit("removeuser", parseInt(users.querySelector(".selected").id, 10));
    }
});

function hide(el) {
    el.classList.add("hidden");
    el.setAttribute("aria-hidden", "true");
}

function show(el) {
    el.classList.remove("hidden");
    el.removeAttribute("aria-hidden");
}

function showDialog() {
    popup.querySelector("dialog").setAttribute("open", true);
    show(popup);
    document.querySelector("main").setAttribute("aria-hidden", true);
    popup.querySelector("dialog").focus();
}

function hideDialog() {
    popup.querySelector("dialog").removeAttribute("open");
    hide(popup);
    document.querySelector("main").removeAttribute("aria-hidden");
}

function resetDialogForms() {
    popup.querySelector("#channelNameField").value = "";
}

popup.querySelector("input[type='button']").addEventListener("click", function(evt) {
    hideDialog();
    resetDialogForms();
});

popup.addEventListener("keypress", function(evt) {
    if(evt.keyCode == 27) {
        hideDialog();
        resetDialogForms();
    }        
});

popup.querySelector("form").addEventListener("submit", function(evt) {
    evt.preventDefault();
    popup.querySelector("dialog").removeAttribute("open");
    hideDialog();
    if(popup.querySelector("#channelRadio").checked)
        self.port.emit("addchannel", popup.querySelector("#channelNameField").value, popup.querySelector("#providerDropdown").value);
    else
        self.port.emit("adduser", popup.querySelector("#channelNameField").value, popup.querySelector("#providerDropdown").value);
    resetDialogForms();
});

function getBestImageForSize(user, size) {
    // shortcut if there's an image with the size demanded
    if(user.image.hasOwnProperty(size.toString())) {
        return user.image[size];
    }
    
    // search next biggest image
    var index = Number.MAX_VALUE;
    Object.keys(user.image).forEach(function(s) {
        s = parseInt(s, 10);
        if(s > size && s < index) {
            index = s;
        }
    });
    return user.image[index];
}

function addChannel(channel) {
    if(!hasChannel(channel.id)) {
        var channelNode = document.createElement("li"),
            image       = new Image(),
            small       = document.createElement("small"),
            span        = document.createElement("span"),
            title       = document.createTextNode(channel.uname),
            type        = document.createTextNode(channel.type);
        image.src       = getBestImageForSize(channel, 50);
        channelNode.id  = "channel"+channel.id;
        small.appendChild(type);
        span.appendChild(title);
        channelNode.appendChild(image);
        channelNode.appendChild(span);
        channelNode.appendChild(small);
        channels.appendChild(channelNode);

        var evt = new CustomEvent("nodeadded", { detail: channelNode });
        channels.dispatchEvent(evt);
    }
}

function addUser(user) {
    if(!hasUser(user.id)) {
        var userNode = document.createElement("li");
            image    = new Image(),
            small    = document.createElement("small"),
            span     = document.createElement("span"),
            title    = document.createTextNode(user.uname),
            type     = document.createTextNode(user.type);
        image.src    = getBestImageForSize(user, 50);
        userNode.id  = "user"+user.id;
        small.appendChild(type);
        span.appendChild(title);
        userNode.appendChild(image);
        userNode.appendChild(span);
        userNode.appendChild(small);
        users.appendChild(userNode);

        var evt = new CustomEvent("nodeadded", { detail: userNode });
        users.dispatchEvent(evt);
    }
}

function updateChannel(channel) {
    if(hasChannel(channel.id)) {
        var channelNode = channels.getElementById("channel"+channel.id),
            span = channelNode.querySelector("span");
        channelNode.querySelector("image").src = getBestImageForSize(channel, 50);
        span.replaceChild(document.createTextNode(channel.uname), span.firstChild);
    }
}

function removeChannel(channelId) {
    if(hasChannel(channelId)) {
        document.getElementById("channel"+channelId).remove();
    }
}

function removeUser(userId) {
    if(hasUser(userId)) {
        document.getElementById("user"+userId).remove();
    }
}

function hasChannel(channelId) {
    return !!channels.querySelector("#channel"+channelId);
}

function hasUser(userId) {
    return !!users.querySelector("#user"+userId);
}

