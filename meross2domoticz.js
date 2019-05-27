/* jshint -W097 */
/* jshint -W030 */
/* jshint strict:true */
/* jslint node: true */
/* jslint esversion: 6 */
'use strict';


/* From domoticz/hardware/hardwaretypes.h */
const pTypeGeneral       = 0xF3;   //For Energy Device
const sTypeKwh           = 0x1D;   //For Energy Device

const pTypeGeneralSwitch   = 0xF4; //For Switch Device
const sSwitchGeneralSwitch = 0x49; //For Switch Device      

/* Regexp for supported or testing devices */
const SingleChannelSupportedDevices = RegExp("mss[1|2|3|7]1");
const MultiChannelSupportedDevices  = RegExp("mss[4|6]2");
const EnergyDevices                 = RegExp("mss310");


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

function LogToConsole(dbg,message){
    var d = new Date();
    if(dbg){
        console.log(d.toISOString() + " -- " + message);
    }
}

function FilterDomoDevices(obj,uuid,type,stype){
    return (obj.Description === uuid && obj.Type === type && obj.SubType === stype);
}

function CreateDomoDevice(name,uuid,type,stype,channel){
    request(base_url + "/json.htm?type=createdevice&idx=" + DummyHardwareId + "&sensorname=" + name+ "&devicetype=" + type + "&devicesubtype=" + stype,function(err, result, body) {
        var response = JSON.parse(body);
        if(response.status === "OK"){
            var url = base_url + "/json.htm?type=setused&idx="+ response.idx +"&description=" + uuid + "|" + channel + " &used=true&name=" + name;
            if(type == pTypeGeneral){ //Only for Energy => No channel & EnergyMeterMode
                var url = base_url + "/json.htm?type=setused&idx="+ response.idx +"&description=" + uuid + " &used=true&name=" + name + "&EnergyMeterMode=1";
            }

            request(url ,function(err, result, body) {
                var response2 = JSON.parse(body);
                if(response2.status === "OK"){
                    if(type == pTypeGeneral){
                        LogToConsole(true,"\tEnergy Device " + name + " created in Domoticz with id " + response.idx);
                    } else {
                        LogToConsole(true,"\tSwitch Device " + name + " created in Domoticz with id " + response.idx);
                    }
                }
            });
        }
    });
}

//We will try to find the hardware id for a Dummy hardware in order to autocreate devices
request(base_url + "/json.htm?type=hardware",function(err, result, body){ //We get all hardware
    if (err) { return console.log(err); }
    var domohardware = JSON.parse(body); //We get all hardware
    var hardware = domohardware.result.filter( ob => { return ob.Type == 15; });

    if(hardware && Array.isArray(hardware) && hardware.length > 0){
        hardware = hardware.pop();
        DummyHardwareId = hardware.idx;
        LogToConsole(debug,"Dummy hardware found (" + DummyHardwareId + "). Autocreate enabled");

    } else {
        autocreate = false;
        LogToConsole(debug,"No dummy hardware found. Autocreate disabled");
    }
});

meross.on('deviceInitialized', (deviceId, deviceDef, device) => {
    device.on('connected', () => {
        devices.push(device);
        LogToConsole(true,device.dev.uuid + " (" + device.dev.devName + ") connected. It is a " + device.dev.deviceType);
        if(autocreate){
            //We will try to autocreate the devices if not present in the Domoticz configuration
            request(base_url + "/json.htm?type=devices&filter=all&used=true&order=Name",function(err, result, body){ //We get all devices
                if (err) { return console.log(err); }
                var domodevices = JSON.parse(body); //We get all the domoticz devices
                if(domodevices.result == undefined){
                    domodevices.result = Array(); //If no devices are found.
                }

                if(EnergyDevices.test(device.dev.deviceType)){
                    //We will try to create the energy device
                    var dev = domodevices.result.filter( ob => { return (  ob.Description === device.dev.uuid && ob.Type === "General" && ob.SubType === "kWh")  } );
                    if(dev && Array.isArray(dev) && dev.length == 0){
                        //No device found, we will create one.
                        CreateDomoDevice(device.dev.devName,device.dev.uuid,pTypeGeneral,sTypeKwh);
                    } else {
                        LogToConsole(true,"\tEnergy Device " +  device.dev.devName + " already exists in Domoticz");
                    }
                }

                //if(device.dev.deviceType == "mss310" || device.dev.deviceType == "mss210" || device.dev.deviceType.indexOf("mss42") != -1){
                if(MultiChannelSupportedDevices.test(device.dev.deviceType) || SingleChannelSupportedDevices.test(device.dev.deviceType)){ //For any devices
                    //We will try to create the switch device
                    var dev = domodevices.result.filter( ob => { return (  ob.Description === (device.dev.uuid+"|"+0) && ob.Type === "Light/Switch" && ob.SubType === "Switch")  } );
                    if(dev && Array.isArray(dev) && dev.length == 0){
                        //No device found, we will create one
                        CreateDomoDevice(device.dev.devName,device.dev.uuid,pTypeGeneralSwitch,sSwitchGeneralSwitch,0);
                    } else {
                        LogToConsole(true,"\tSwitch Device " +  device.dev.devName + " already exists in Domoticz");
                    }
                }

                if(MultiChannelSupportedDevices.test(device.dev.deviceType)){ //For Multi channel devices
                    var i=0;
                     for(i=1;i<device.dev.channels.length;i++){
                         var dev = domodevices.result.filter( ob => { return (  ob.Description === (device.dev.uuid+"|"+i) && ob.Type === "Light/Switch" && ob.SubType === "Switch")  } );
                         if(dev && Array.isArray(dev) && dev.length == 0){
                           //No device found, we will create one
                            CreateDomoDevice(device.dev.channels[i].devName,device.dev.uuid,pTypeGeneralSwitch,sSwitchGeneralSwitch,i);
                         } else {
                            LogToConsole(true,"\tSwitch Device " +  device.dev.channels[i].devName + " already exists in Domoticz");
                         }
                     }
                }
           });
        }
    });

    device.on('close', (error) => {
        LogToConsole(debug,'DEV: ' + deviceId + ' closed: ' + error);
    });

    device.on('error', (error) => {
        LogToConsole(debug,'DEV: ' + deviceId + ' error: ' + error);
    });

    device.on('reconnect', () => {
        LogToConsole(debug,'DEV: ' + deviceId + ' reconnected');
    });

    device.on('data', (namespace, payload) => {
        var nvalue  = 0;
        var channel = 0;

        if(namespace == "Appliance.Control.Toggle"){
            nvalue  = payload.toggle.onoff;
        } else {
            if(payload.togglex != undefined){
                if(Array.isArray(payload.togglex)){
                    channel = payload.togglex[0].channel;
                    nvalue  = payload.togglex[0].onoff;
                } else {
                    channel = payload.togglex.channel;
                    nvalue  = payload.togglex.onoff;
                }
            } else {
                return;
            }
        }

        request(base_url + "/json.htm?type=devices&filter=light&used=true&order=Name",function(err, res, body){
              if (err) { return console.log(err); }
              var domodevices = JSON.parse(body);

              var dev = domodevices.result.filter( ob => { return (ob.Description === (deviceId + "|" + channel) && ob.Type === "Light/Switch" && ob.SubType === "Switch") } ); 
              
              if(dev && Array.isArray(dev) && dev.length > 0){
                dev = dev.pop();
                var status = nvalue ? "On" : "Off";
                if(dev && dev.Status != status){

                    var msg = {
                        "idx": parseInt(dev.idx),
                        "command": "switchlight",
                        "switchcmd": nvalue ? "On" : "Off"
                    };
                    
                    LogToConsole(true,"Sending state to Domoticz");
                    client.publish('domoticz/in', JSON.stringify(msg));
                }
              }
        });
    });

});

meross.on('connected', (deviceId) => {
    LogToConsole(debug,deviceId + ' connected');
});

meross.on('close', (deviceId, error) => {
    LogToConsole(debug,deviceId + ' closed: ' + error);
});

meross.on('error', (deviceId, error) => {
    LogToConsole(debug,deviceId + ' error: ' + error);
});

meross.on('reconnect', (deviceId) => {
    LogToConsole(debug,deviceId + ' reconnected');
});

meross.on('data', (deviceId, payload) => {
    LogToConsole(debug,deviceId + ' data: ' + JSON.stringify(payload));
});

meross.connect((error) => {
    if(error){
        LogToConsole(debug,'connect error: ' + error);
        meross.connect((error) => { });
    };
});

client.on('connect', function () {
    client.subscribe('domoticz/out', function () {
        client.on('message', function(topic, message, packet) {
            // message is Buffer
            var channel = 0;

            var obj = JSON.parse(message);
            var dev = devices.filter( ob => { return (String(obj.description).indexOf(ob.dev.uuid)!=-1 && obj.dtype === "Light/Switch" && obj.stype === "Switch") });

            if(dev && Array.isArray(dev) && dev.length > 0){
                var settings = obj.description.split("|");
                if(settings.length > 1){
                    channel = settings[1];
                }

                dev = dev.pop();
                dev.getSystemAbilities((err, res) => { //We check for the right command to send
                   if( res.ability["Appliance.Control.Toggle"] != undefined){
                        LogToConsole(true,"Sending state to Meross with Appliance.Control.Toggle");
                        dev.controlToggle(obj.nvalue);
                   }
                   if( res.ability["Appliance.Control.ToggleX"] != undefined){
                        LogToConsole(true,"Sending state to Meross with Appliance.Control.ToggleX");
                        dev.controlToggleX(channel,obj.nvalue);
                   }
                });
             }
        });
    });
});

client.on('error',function(){
    client.reconnect();
});

setInterval(function(){
    LogToConsole(true,"Updating power consumption");
    request(base_url + "/json.htm?type=devices&filter=utility&used=true&order=Name",function(err, result, body){
        if (err) { return console.log(err); }
        var domodevices = JSON.parse(body); //We get all the domoticz devices
        devices.forEach(function(element){
            if(EnergyDevices.test(element.dev.deviceType)){
                element.getControlElectricity((err, res) => {
                    if (err) { return console.log(err); }
                    var dev = domodevices.result.filter( ob => { return (ob.Description == element.dev.uuid && ob.Type === "General") } );
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

