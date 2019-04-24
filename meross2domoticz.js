/* jshint -W097 */
/* jshint -W030 */
/* jshint strict:true */
/* jslint node: true */
/* jslint esversion: 6 */
'use strict';

const mqtt          = require('mqtt')
const MerossCloud   = require('meross-cloud');
const request       = require('request');
const options       = require("./config.json");
const debug         = false;

var autocreate      = true; 
var devices         = Array();
var DummyHardwareId = -1;

const meross = new MerossCloud(options.meross);
const client  = mqtt.connect('mqtt://' + options.mqtt.server);
const base_url = "http://" + options.domoticz.server + ":" + options.domoticz.port;


//We will try to find the hardware id for a Dummy hardware in order to autocreate devices
request(base_url + "/json.htm?type=hardware",function(err, result, body){ //We get all hardware
    if (err) { return console.log(err); }
    var domohardware = JSON.parse(body); //We get all hardware
    var hardware = domohardware.result.filter( ob => { return ob.Type == 15; });

    if(hardware && Array.isArray(hardware) && hardware.length > 0){
        hardware = hardware.pop();
        DummyHardwareId = hardware.idx;
        if(debug){
            console.log("Dummy hardware found (" + DummyHardwareId + "). Autocreate enabled");
        }

    } else {
        autocreate = false;
        if(debug){
            console.log("No dummy hardware found. Autocreate disabled");
        }
    }
});


meross.on('deviceInitialized', (deviceId, deviceDef, device) => {
    device.on('connected', () => {
        devices.push(device);
        console.log(device.dev.uuid + " (" + device.dev.devName + ") connected");
        if(autocreate){
            //We will try to autocreate the devices if not present in the Domoticz configuration
            request(base_url + "/json.htm?type=devices&filter=all&used=true&order=Name",function(err, result, body){ //We get all devices
                if (err) { return console.log(err); }
                var domodevices = JSON.parse(body); //We get all the domoticz devices
                if(device.dev.deviceType == "mss310"){
                //We will try to create the energy device
                    var dev = domodevices.result.filter( ob => { return (  ob.Description === device.dev.uuid && ob.Type === "General" && ob.SubType === "kWh")  } );
                    if(dev && Array.isArray(dev) && dev.length == 0){
                        //No device found, we will create one.

                        request(base_url + "/json.htm?type=createdevice&idx=" + DummyHardwareId + "sensorname=" + device.dev.devName+ "&devicetype=243&devicesubtype=29",function(err, result, body) {
                            var response = JSON.parse(body);
                            if(response.status === "OK"){
                                request(base_url + "/json.htm?type=setused&idx="+ response.idx +"&description=" + device.dev.uuid + "&used=true&EnergyMeterMode=1&name=" + device.dev.devName ,function(err, result, body) {
                                    var response2 = JSON.parse(body);
                                    if(response2.status === "OK"){
                                        console.log("\tEnergy Device " + device.dev.devName + " created in Domoticz with id " + response.idx);
                                    }
                                });
                            }
                        });
                    } else {
                        console.log("\tEnergy Device " +  device.dev.devName + " already exists in Domoticz");
                    }

                //We will try to create the switch device
                    var dev = domodevices.result.filter( ob => { return (  ob.Description === device.dev.uuid && ob.Type === "Light/Switch" && ob.SubType === "Switch")  } );
                    if(dev && Array.isArray(dev) && dev.length == 0){
                        //No device found, we will create one
                        
                        request(base_url + "/json.htm?type=createdevice&idx=" + DummyHardwareId + "&devicetype=244&devicesubtype=73&sensorname=" + device.dev.devName,function(err, result, body) {
                            var response = JSON.parse(body);
                            if(response.status === "OK"){
                                request(base_url + "/json.htm?type=setused&idx="+ response.idx +"&description=" + device.dev.uuid + "&used=true&name=" + device.dev.devName ,function(err, result, body) {
                                    var response2 = JSON.parse(body);
                                    if(response2.status === "OK"){
                                        console.log("\tSwitch Device " + device.dev.devName + " created in Domoticz with id " + response.idx);
                                    }
                                });
                            }
                        });
                    } else {
                        console.log("\tSwitch Device " +  device.dev.devName + " already exists in Domoticz");
                    }
                }
           });
        }
    });

    device.on('close', (error) => {
        if(debug){
            console.log('DEV: ' + deviceId + ' closed: ' + error);
        }
    });

    device.on('error', (error) => {
        if(debug){
            console.log('DEV: ' + deviceId + ' error: ' + error);
        }
    });

    device.on('reconnect', () => {
        if(debug){
            console.log('DEV: ' + deviceId + ' reconnected');
        }
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
              var dev = domodevices.result.filter( ob => { return (ob.Description == deviceId && ob.Type === "Light/Switch" && ob.SubType === "Switch") } ); 
              
              if(dev && Array.isArray(dev) && dev.length > 0){
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
    if(debug){
        console.log(deviceId + ' connected');
    }
});

meross.on('close', (deviceId, error) => {
    if(debug){
        console.log(deviceId + ' closed: ' + error);
    }
});

meross.on('error', (deviceId, error) => {
    if(debug){
        console.log(deviceId + ' error: ' + error);
    }
});

meross.on('reconnect', (deviceId) => {
    if(debug){
        console.log(deviceId + ' reconnected');
    }
});

meross.on('data', (deviceId, payload) => {
    if(debug){
        console.log(deviceId + ' data: ' + JSON.stringify(payload));
    }
    
});

meross.connect((error) => {
    if(error){
        if(debug){
            console.log('connect error: ' + error);
        }
        meross.connect((error) => { });
    };
});

client.on('connect', function () {
    client.subscribe('domoticz/out', function () {
        client.on('message', function(topic, message, packet) {
        // message is Buffer
            var obj = JSON.parse(message);
            var dev = devices.filter( ob => { return (ob.dev.uuid === obj.description && obj.dtype === "Light/Switch" && obj.stype === "Switch") });

            if(dev && Array.isArray(dev) && dev.length > 0){
                dev = dev.pop();
                if(debug){
                    console.log(obj)
                    console.log(dev)
                }
                console.log("Sending state to Meross");
                try{
                    dev.controlToggleX(0,obj.nvalue);
                }
                catch(e){
                    dev.controlToggle(obj.nvalue);
                }
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
            if(element.dev.deviceType == "mss310"){
                element.getControlElectricity((err, res) => {
                    if (err) { return console.log(err); }
                    var dev = domodevices.result.filter( ob => { return (ob.Description === element.dev.uuid && ob.Type === "General") } );
                    if(dev && Array.isArray(dev) && dev.length > 0){
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
            }
        });
    });
}, 60000);

