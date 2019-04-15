/* jshint -W097 */
/* jshint -W030 */
/* jshint strict:true */
/* jslint node: true */
/* jslint esversion: 6 */
'use strict';

const mqtt        = require('mqtt')
const MerossCloud = require('meross-cloud');
const request     = require('request');
const options     = require("./config.json");

var devices = Array();


const meross = new MerossCloud(options.meross);
const client  = mqtt.connect('mqtt://' + options.mqtt.server);
const base_url = "http://" + options.domoticz.server + ":" + options.domoticz.port;

meross.on('deviceInitialized', (deviceId, deviceDef, device) => {
    device.on('connected', () => {
        devices.push(device);
    });

    device.on('close', (error) => {
        console.log('DEV: ' + deviceId + ' closed: ' + error);
    });

    device.on('error', (error) => {
        console.log('DEV: ' + deviceId + ' error: ' + error);
    });

    device.on('reconnect', () => {
        console.log('DEV: ' + deviceId + ' reconnected');
    });

    device.on('data', (namespace, payload) => {
        var nvalue = 0;
        if(Array.isArray(payload.togglex))
            nvalue = payload.togglex[0].onoff;
        else
            nvalue = payload.togglex.onoff;

        request(base_url + "/json.htm?type=devices&filter=light&used=true&order=Name",function(err, res, body){
              if (err) { return console.log(err); }
              var domodevices = JSON.parse(body);
              var dev = domodevices.result.filter( ob => { return (ob.Description == deviceId && ob.SwitchType == "On/Off") } ); 
              
              
              if(Array.isArray(dev)){
                dev = dev.pop();
                var status = nvalue ? "On" : "Off";
                if(dev && dev.Status != status){

                    var msg = {
                        "idx": parseInt(dev.idx),
                        "command": "switchlight",
                        "switchcmd": nvalue ? "On" : "Off"
                    };
                    
                    console.log("Sending state to Domoticz");
                    client.publish('domoticz/in', JSON.stringify(msg));
                }
              }
        });
    });

});

meross.on('connected', (deviceId) => {
    console.log(deviceId + ' connected');
});

meross.on('close', (deviceId, error) => {
    console.log(deviceId + ' closed: ' + error);
});

meross.on('error', (deviceId, error) => {
    console.log(deviceId + ' error: ' + error);
});

meross.on('reconnect', (deviceId) => {
    console.log(deviceId + ' reconnected');
});

meross.on('data', (deviceId, payload) => {
    console.log(deviceId + ' data: ' + JSON.stringify(payload));
    
});

meross.connect((error) => {
    if(error){
        console.log('connect error: ' + error);
        meross.connect((error) => { });
    };
});

client.on('connect', function () {
    client.subscribe('domoticz/out', function () {
        client.on('message', function(topic, message, packet) {
        // message is Buffer
            var obj = JSON.parse(message);
            var dev = devices.filter( ob => { return (ob.dev.uuid === obj.description && obj.switchType === "On/Off") });

            if(dev.length > 0){
                console.log("Sending state to Meross");
                dev.pop().controlToggleX(0,obj.nvalue);
            }
        });
    });
});
client.on('error',function(){
    client.reconnect();
});

setInterval(function(){
    var d = new Date();
    console.log(d.toISOString() + " -- Updating power consumption");
    request(base_url + "/json.htm?type=devices&filter=utility&used=true&order=Name",function(err, result, body){
        if (err) { return console.log(err); }
        var domodevices = JSON.parse(body); //We get all the domoticz devices
        devices.forEach(function(element){
            element.getControlElectricity((err, res) => {
                if (err) { return console.log(err); }
                var dev = domodevices.result.filter( ob => { return (ob.Description === element.dev.uuid && ob.Type === "General") } );
                if(Array.isArray(dev)){
                    dev = dev.pop();
                    if(dev){
                        var msg = {
                            "idx": parseInt(dev.idx),
                            "nvalue": 0,
                            "svalue": "" + (parseInt(res.electricity.power)/1000.0) + ";0"
                        };
                        client.publish('domoticz/in', JSON.stringify(msg));
                    }
                }
            });
        });
    });
}, 60000);

