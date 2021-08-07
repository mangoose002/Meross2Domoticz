/* jshint -W097 */
/* jshint -W030 */
/* jshint strict:true */
/* jslint node: true */
/* jslint esversion: 6 */
'use strict';


/* From domoticz/hardware/hardwaretypes.h */
const pTypeGeneral = 0xF3;   //For Energy Device
const pTypeColorSwitch = 0xF1;   //For Color Switch Device
const pTypeGeneralSwitch = 0xF4; //For Light/Switch Device

const sSwitchGeneralSwitch = 0x49; //For Switch Device
const sTypeKwh = 0x1D;   //For Energy Device
const sTypeColor_RGB_W = 0x01;   //For Light Switch Device (RGB + White)
const sTypeColor_RGB = 0x02; //(RGB Only)
const sTypeColor_White = 0x03; //(White Only)
const sTypeColor_RGB_CW_WW = 0x04; //(RGB + Cold and Warm White)
const sTypeDoorContact = 0x0B; // For Door Contact

/* Regexp for supported or testing devices */
const SingleChannelSupportedDevices = RegExp("mss[1|2|3|7]1|mss550l");
const MultiChannelSupportedDevices = RegExp("mss[4|6]2");
const EnergyDevices = RegExp("mss310");
const RGBLightDevices = RegExp("msl420")
const RGBWLightDevices = RegExp("msl120d|msl430")
const GarageDevices = RegExp("msg100")

const mqtt = require('mqtt');
const MerossCloud = require('meross-cloud');
const request = require('request');
const options = require("./config.json");
const debug = true;

var autocreate = true;
var devices = Array();
var DummyHardwareId = -1;

const meross = new MerossCloud(options.meross);
const client = mqtt.connect('mqtt://' + options.mqtt.server);
const base_url = "http://" + options.domoticz.server + ":" + options.domoticz.port;

function IntToRGB(rgb) {
    var red = (rgb & 16711680) >> 16;
    var green = (rgb & 65280) >> 8;
    var blue = (rgb & 255);

    return [red, green, blue];
}

function RGBToInt(rgb) {
    if (rgb && Array.isArray(rgb) && rgb.length == 3) {
        var red = rgb[0] << 16;
        var green = rgb[1] << 8;
        var blue = rgb[2];

        return red + green + blue;
    }
}

//Temp = in Domoticz 0(Cold)/255(Warm), Meross : 0(Cold)/100(Warm)
function TemperatureToInt(temp) {
    return Math.round(100 - ((temp / 255) * 99));
}

function IntToTemperature(value) {
    return Math.round(255 * ((100 - value) / 99));
}

function LogToConsole(dbg, message) {
    var d = new Date();
    if (dbg) {
        console.log(d.toISOString() + " -- " + message);
    }
}

function FilterDomoDevices(obj, uuid, type, stype) {
    return (obj.Description === uuid && obj.Type === type && obj.SubType === stype);
}

function CreateDomoDevice(name, uuid, type, stype, channel) {
    var correctedsType = stype;
    if (correctedsType == sTypeDoorContact) correctedsType = sSwitchGeneralSwitch;
    request(base_url + "/json.htm?type=createdevice&idx=" + DummyHardwareId + "&sensorname=" + name + "&devicetype=" + type + "&devicesubtype=" + correctedsType, function (err, result, body) {
        var response = JSON.parse(body);
        if (response.status === "OK") {
            var url = base_url + "/json.htm?type=setused&idx=" + response.idx + "&description=" + uuid + "|" + channel + " &used=true&name=" + name;
            if (type == pTypeGeneral) { //Only for Energy => No channel & EnergyMeterMode
                var url = base_url + "/json.htm?type=setused&idx=" + response.idx + "&description=" + uuid + " &used=true&name=" + name + "&EnergyMeterMode=1";
            }
            if (type == pTypeColorSwitch) {
                var url = base_url + "/json.htm?type=setused&idx=" + response.idx + "&description=" + uuid + " &used=true&name=" + name;
            }
            if (stype == sTypeDoorContact) {
                var url = base_url + "/json.htm?type=setused&idx=" + response.idx + "&description=" + uuid + " &used=true&name=" + name + "&switchtype=11&customimage=0";
            }

            request(url, function (err, result, body) {
                var response2 = JSON.parse(body);
                if (response2.status === "OK") {
                    if (type == pTypeGeneral) {
                        LogToConsole(true, "\tEnergy Device " + name + " created in Domoticz with id " + response.idx);
                    } else if (type == pTypeGeneralSwitch) {
                        LogToConsole(true, "\tSwitch or Contact Device " + name + " created in Domoticz with id " + response.idx);
                    } else if (type == pTypeColorSwitch) {
                        LogToConsole(true, "\tColor Switch Device " + name + " created in Domoticz with id " + response.idx);
                    }
                }
            });
        }
    });
}

//We will try to find the hardware id for a Dummy hardware in order to autocreate devices
request(base_url + "/json.htm?type=hardware", function (err, result, body) { //We get all hardware
    if (err) { return console.log(err); }
    var domohardware = JSON.parse(body); //We get all hardware
    if (domohardware.result == undefined) {
        autocreate = false;
        LogToConsole(debug, "No dummy hardware found. Autocreate disabled");
        return;
    }

    var hardware = domohardware.result.filter(ob => { return ob.Type == 15; });
    if (hardware && Array.isArray(hardware) && hardware.length > 0) {
        hardware = hardware.pop();
        DummyHardwareId = hardware.idx;
        LogToConsole(debug, "Dummy hardware found (" + DummyHardwareId + "). Autocreate enabled");

    } else {
        autocreate = false;
        LogToConsole(debug, "No dummy hardware found. Autocreate disabled");
    }
});

meross.on('deviceInitialized', (deviceId, deviceDef, device) => {
    device.on('connected', () => {
        var found;
        found = false;
        devices.forEach(function (element) {
            if (element.dev.uuid == device.dev.uuid) {
                found = true;
            }
        });
        if (found == false) { // It is a new device
            devices.push(device);
            LogToConsole(true, device.dev.uuid + " (" + device.dev.devName + ") connected. It is a " + device.dev.deviceType + ". It has " + device.dev.channels.length + " channel" + ((device.dev.channels.length > 1) ? "s" : ""));
            if (autocreate) {
                //We will try to autocreate the devices if not present in the Domoticz configuration
                request(base_url + "/json.htm?type=devices&filter=all&used=true&order=Name", function (err, result, body) { //We get all devices
                    if (err) { return console.log(err); }
                    var domodevices = JSON.parse(body); //We get all the domoticz devices
                    if (domodevices.result == undefined) {
                        domodevices.result = Array(); //If no devices are found.
                    }

                    if (EnergyDevices.test(device.dev.deviceType)) {
                        //We will try to create the energy device
                        var dev = domodevices.result.filter(ob => { return (ob.Description === device.dev.uuid && ob.Type === "General" && ob.SubType === "kWh"); });
                        if (dev && Array.isArray(dev) && dev.length == 0) {
                            //No device found, we will create one.
                            CreateDomoDevice(device.dev.devName, device.dev.uuid, pTypeGeneral, sTypeKwh);
                        } else {
                            LogToConsole(true, "\tEnergy Device " + device.dev.devName + " already exists in Domoticz");
                        }
                    }

                    if (RGBLightDevices.test(device.dev.deviceType)) {
                        //We will try to create the color switch device
                        var dev = domodevices.result.filter(ob => { return (ob.Description === device.dev.uuid && ob.Type === "Color Switch" && ob.SubType === "RGB"); });
                        if (dev && Array.isArray(dev) && dev.length == 0) {
                            //No device found, we will create one.
                            CreateDomoDevice(device.dev.devName, device.dev.uuid, pTypeColorSwitch, sTypeColor_RGB);
                        } else {
                            LogToConsole(true, "\tColor Switch Device " + device.dev.devName + " already exists in Domoticz");
                        }
                    }

                    if (RGBWLightDevices.test(device.dev.deviceType)) {
                        //We will try to create the color switch device
                        var dev = domodevices.result.filter(ob => { return (ob.Description === device.dev.uuid && ob.Type === "Color Switch" && ob.SubType === "RGBWW"); });
                        if (dev && Array.isArray(dev) && dev.length == 0) {
                            //No device found, we will create one.
                            CreateDomoDevice(device.dev.devName, device.dev.uuid, pTypeColorSwitch, sTypeColor_RGB_CW_WW);
                        } else {
                            LogToConsole(true, "\tColor and White Switch Device " + device.dev.devName + " already exists in Domoticz");
                        }
                    }

                    if (GarageDevices.test(device.dev.deviceType)) {

                        //We will try to create the garage door switch device
                        var dev = domodevices.result.filter(ob => { return (ob.Description === device.dev.uuid && ob.Type === "Light/Switch" && ob.SwitchType === "Door Contact"); });
                        if (dev && Array.isArray(dev) && dev.length == 0) {
                            //No device found, we will create one.
                            LogToConsole(true, "Creating Garage Door Device")
                            CreateDomoDevice(device.dev.devName, device.dev.uuid, pTypeGeneralSwitch, sTypeDoorContact);
                        } else {
                            LogToConsole(true, "\tDoor Contact Device " + device.dev.devName + " already exists in Domoticz");
                        }
                    }

                    if (MultiChannelSupportedDevices.test(device.dev.deviceType) || SingleChannelSupportedDevices.test(device.dev.deviceType)) { //For any devices
                        var i = 0;
                        var DeviceName = "";
                        for (i = 0; i < device.dev.channels.length; i++) {
                            if (i == 0) {
                                DeviceName = device.dev.devName;
                            } else {
                                DeviceName = device.dev.channels[i].devName;
                            }
                            //We will try to create the switch device
                            var dev = domodevices.result.filter(ob => { return (ob.Description === (device.dev.uuid + "|" + i) && ob.Type === "Light/Switch" && ob.SubType === "Switch"); });
                            if (dev && Array.isArray(dev) && dev.length == 0) {
                                //No device found, we will create one
                                CreateDomoDevice(DeviceName, device.dev.uuid, pTypeGeneralSwitch, sSwitchGeneralSwitch, i);
                            } else {
                                LogToConsole(true, "\tSwitch Device " + DeviceName + " already exists in Domoticz");
                            }
                        }
                    }
                });
            }
        }
    });

    device.on('close', (error) => {
        LogToConsole(debug, 'DEV: ' + deviceId + ' closed: ' + error);
    });

    device.on('error', (error) => {
        LogToConsole(debug, 'DEV: ' + deviceId + ' error: ' + error);
    });

    device.on('reconnect', () => {
        LogToConsole(debug, 'DEV: ' + deviceId + ' reconnected');
    });

    device.on('data', (namespace, payload) => {
        var nvalue = 0;
        var channel = 0;
        var rgb = 0;
        var temperature = 0;
        var luminance = 0;
        var capacity = 0;

        if (namespace == "Appliance.Control.Toggle") {
            nvalue = payload.toggle.onoff;
        } else if (namespace == "Appliance.Control.ToggleX") {
            if (payload.togglex != undefined) {
                if (Array.isArray(payload.togglex)) {
                    channel = payload.togglex[0].channel;
                    nvalue = payload.togglex[0].onoff;
                } else {
                    channel = payload.togglex.channel;
                    nvalue = payload.togglex.onoff;
                }
            } else {
                return;
            }
        } else if (namespace == "Appliance.Control.Light") {
            LogToConsole(true, "Light State Updated : " + JSON.stringify(payload));
            rgb = IntToRGB(payload.light.rgb);
            channel = payload.light.channel;
            temperature = payload.light.temperature;
            luminance = payload.light.luminance;
            capacity = payload.light.capacity;

        } else if (namespace == "Appliance.GarageDoor.State") {
            LogToConsole(true, "Garage Door State Updated : " + JSON.stringify(payload));
            if (payload.state != undefined) {
                if (Array.isArray(payload.state)) {
                    channel = payload.state[0].channel;
                    nvalue = payload.state[0].open;
                }
                else {
                    channel = payload.state.channel;
                    nvalue = payload.state.open;
                }
            }
        }

        request(base_url + "/json.htm?type=devices&filter=light&used=true&order=Name", function (err, res, body) {
            if (err) { return console.log(err); }
            var domodevices = JSON.parse(body);
            var dev = Array();

            //On/Off Switch
            dev = domodevices.result.filter(ob => { return (ob.Description === (deviceId + "|" + channel) && ob.Type === "Light/Switch" && ob.SubType === "Switch"); });
            if (channel == 0 && device.dev.channels.length > 1) { //For Multichannel
                dev = domodevices.result.filter(ob => { return (ob.Description.indexOf(deviceId) != -1 && ob.Type === "Light/Switch" && ob.SubType === "Switch"); });
            }
            if (dev && Array.isArray(dev) && dev.length > 0) {
                dev.forEach(function (element) {
                    var status = nvalue ? "On" : "Off";
                    if (element && element.Status != status) {
                        var msg = {
                            "idx": parseInt(element.idx),
                            "command": "switchlight",
                            "switchcmd": status
                        };

                        LogToConsole(true, "Sending state to Domoticz");
                        client.publish('domoticz/in', JSON.stringify(msg));
                    }
                });
            }

            //RGB Color Light
            dev = domodevices.result.filter(ob => { return (ob.Description === deviceId && ob.Type === "Color Switch" && ob.SubType === "RGB"); });
            if (dev && Array.isArray(dev) && dev.length > 0) {
                dev.forEach(function (element) {
                    var status = nvalue ? "On" : "Off";
                    var color = JSON.parse(element.Color);

                    if (element && (namespace == "Appliance.Control.ToggleX" || namespace == "Appliance.Control.Toggle") &&
                        element.Status != status) {
                        var msg = {
                            "idx": parseInt(element.idx),
                            "command": "switchlight",
                            "switchcmd": status
                        };
                        LogToConsole(true, "Sending On/Off state to Domoticz");
                        client.publish('domoticz/in', JSON.stringify(msg));
                    }

                    //RGB Color Only
                    if (element && namespace == "Appliance.Control.Light" &&
                        (color.r != rgb[0] ||
                            color.g != rgb[1] ||
                            color.b != rgb[2] ||
                            element.Level != luminance)) {
                        var msg = {
                            "command": "setcolbrightnessvalue",
                            "idx": parseInt(element.idx),
                            "color": { "m": 3, "t": 0, "r": rgb[0], "g": rgb[1], "b": rgb[2], "cw": 0, "ww": 0 },
                            "brightness": luminance
                        };
                        LogToConsole(true, "Sending color state to Domoticz");
                        client.publish('domoticz/in', JSON.stringify(msg));
                    }

                });
            }

            //RGBWW Color Light
            dev = domodevices.result.filter(ob => { return (ob.Description === deviceId && ob.Type === "Color Switch" && ob.SubType === "RGBWW"); });
            if (dev && Array.isArray(dev) && dev.length > 0) {
                dev.forEach(function (element) {
                    var status = nvalue ? "On" : "Off";
                    var color = JSON.parse(element.Color);

                    if (element && (namespace == "Appliance.Control.ToggleX" || namespace == "Appliance.Control.Toggle") &&
                        element.Status != status) {
                        var msg = {
                            "idx": parseInt(element.idx),
                            "command": "switchlight",
                            "switchcmd": status
                        };
                        LogToConsole(true, "Sending On/Off state to Domoticz");
                        client.publish('domoticz/in', JSON.stringify(msg));
                    }

                    //RGB Color Only
                    if (element && namespace == "Appliance.Control.Light" &&
                        capacity == 5 &&
                        (color.r != rgb[0] ||
                            color.g != rgb[1] ||
                            color.b != rgb[2] ||
                            element.Level != luminance)) {
                        var msg = {
                            "command": "setcolbrightnessvalue",
                            "idx": parseInt(element.idx),
                            "color": { "m": 3, "t": 0, "r": rgb[0], "g": rgb[1], "b": rgb[2], "cw": 0, "ww": 0 },
                            "brightness": luminance
                        };
                        LogToConsole(true, "Sending color state to Domoticz");
                        client.publish('domoticz/in', JSON.stringify(msg));
                    }

                    //White Temp Only
                    if (element && namespace == "Appliance.Control.Light" &&
                        capacity == 6 &&
                        (color.t != IntToTemperature(temperature) ||
                            element.Level != luminance)) {
                        var msg = {
                            "command": "setcolbrightnessvalue",
                            "idx": parseInt(element.idx),
                            "color": { "m": 2, "t": IntToTemperature(temperature), "r": 0, "g": 0, "b": 0, "cw": 0, "ww": 0 },
                            "brightness": luminance
                        };
                        LogToConsole(true, "Sending white color temperature state to Domoticz");
                        client.publish('domoticz/in', JSON.stringify(msg));
                    }
                });
            }

            //Door Contact
            dev = domodevices.result.filter(ob => { return (ob.Description === deviceId && ob.Type === "Light/Switch" && ob.SwitchType === "Door Contact"); });
            if (dev && Array.isArray(dev) && dev.length > 0) {
                dev.forEach(function (element) {
                    var status = nvalue ? "Open" : "Closed";
                    var switchmd = nvalue ? "On" : "Off";
                    if (element && element.Status != status) {
                        var msg = {
                            "idx": parseInt(element.idx),
                            "command": "switchlight",
                            "switchcmd": switchmd
                        };

                        LogToConsole(true, "Sending state to Domoticz");
                        client.publish('domoticz/in', JSON.stringify(msg));
                    }
                });
            }
        });
    });

});

meross.on('connected', (deviceId) => {
    LogToConsole(debug, deviceId + ' connected');
});

meross.on('close', (deviceId, error) => {
    LogToConsole(debug, deviceId + ' closed: ' + error);
});

meross.on('error', (deviceId, error) => {
    LogToConsole(debug, deviceId + ' error: ' + error);
});

meross.on('reconnect', (deviceId) => {
    LogToConsole(debug, deviceId + ' reconnected');
});

meross.on('data', (deviceId, payload) => {
    LogToConsole(debug, deviceId + ' data: ' + JSON.stringify(payload));
});

meross.connect((error) => {
    if (error) {
        LogToConsole(debug, 'connect error: ' + error);
        meross.connect((error) => { });
    }
});

client.on('connect', function () {
    client.subscribe('domoticz/out', function () {
        client.on('message', function (topic, message, packet) {
            // message is Buffer
            var channel = 0;

            //Switch
            var obj = JSON.parse(message);
            var merossDevice = devices.filter(ob => { return (String(obj.description).indexOf(ob.dev.uuid) != -1 && obj.dtype === "Light/Switch" && obj.stype === "Switch"); });
            if (merossDevice && Array.isArray(merossDevice) && merossDevice.length > 0) {
                var settings = obj.description.split("|");
                if (settings.length > 1) {
                    channel = settings[1];
                }

                merossDevice = merossDevice.pop();
                merossDevice.getSystemAbilities(function (err, res) {
                    if (res.ability["Appliance.Control.Toggle"] != undefined) {
                        LogToConsole(true, "Sending state " + obj.nvalue + " to Meross with Appliance.Control.Toggle");
                        merossDevice.controlToggle(obj.nvalue);
                    }
                    if (res.ability["Appliance.Control.ToggleX"] != undefined) {
                        LogToConsole(true, "Sending state " + obj.nvalue + " to Meross with Appliance.Control.ToggleX for channel " + channel);
                        merossDevice.controlToggleX(channel, obj.nvalue);
                    }
                });
            }

            //RGB Light
            var dev = devices.filter(ob => { return (String(obj.description).indexOf(ob.dev.uuid) != -1 && obj.dtype === "Color Switch" && obj.stype === "RGB"); });
            if (dev && Array.isArray(dev) && dev.length > 0) {
                var settings = obj.description.split("|");
                if (settings.length > 1) {
                    channel = settings[1];
                }

                dev = dev.pop();
                dev.getSystemAbilities(function (err, res) {
                    if (obj.nvalue != 0 && res.ability["Appliance.Control.Light"] != undefined) {
                        LogToConsole(true, "Sending state to Meross with Appliance.Control.Light");
                        var light = { "channel": 0, "gradual": 0, "rgb": RGBToInt([obj.Color.r, obj.Color.g, obj.Color.b]), "luminance": obj.Level, "capacity": 5 };
                        dev.controlLight(light);
                    }
                    if (obj.nvalue == 0 && res.ability["Appliance.Control.Toggle"] != undefined) {
                        LogToConsole(true, "Sending state to Meross with Appliance.Control.Toggle");
                        dev.controlToggle(obj.nvalue);
                    }
                    else if (obj.nvalue == 0 && res.ability["Appliance.Control.ToggleX"] != undefined) {
                        LogToConsole(true, "Sending state to Meross with Appliance.Control.ToggleX for channel " + channel);
                        dev.controlToggleX(channel, obj.nvalue);
                    }
                });
            }

            //RGBWW Light
            var rgbwwDevice = devices.filter(ob => { return (String(obj.description).indexOf(ob.dev.uuid) != -1 && obj.dtype === "Color Switch" && obj.stype === "RGBWW"); });
            if (rgbwwDevice && Array.isArray(rgbwwDevice) && rgbwwDevice.length > 0) {
                var settings = obj.description.split("|");
                if (settings.length > 1) {
                    channel = settings[1];
                }

                rgbwwDevice = rgbwwDevice.pop();
                rgbwwDevice.getSystemAbilities(function (err, res) {
                    if (obj.nvalue != 0 && res.ability["Appliance.Control.Light"] != undefined) {
                        var light;
                        if (obj.Color.m == 3) {
                            light = { "channel": 0, "gradual": 0, "rgb": RGBToInt([obj.Color.r, obj.Color.g, obj.Color.b]), "luminance": obj.Level, "capacity": 5 };
                            LogToConsole(true, "Sending color state to Meross with Appliance.Control.Light : " + JSON.stringify(light));
                        }
                        if (obj.Color.m == 2) {
                            light = { "channel": 0, "gradual": 0, "temperature": TemperatureToInt(obj.Color.t), "luminance": obj.Level, "capacity": 6 };
                            LogToConsole(true, "Sending white temperature state to Meross with Appliance.Control.Light : " + JSON.stringify(light));
                        }
                        rgbwwDevice.controlLight(light);
                    }
                    if (obj.nvalue == 0 && res.ability["Appliance.Control.Toggle"] != undefined) {
                        LogToConsole(true, "Sending state to Meross with Appliance.Control.Toggle");
                        rgbwwDevice.controlToggle(obj.nvalue);
                    }
                    else if (obj.nvalue == 0 && res.ability["Appliance.Control.ToggleX"] != undefined) {
                        LogToConsole(true, "Sending state to Meross with Appliance.Control.ToggleX for channel " + channel);
                        rgbwwDevice.controlToggleX(channel, obj.nvalue);
                    }
                });
            }
        });
    });
});

client.on('error', function () {
    client.reconnect();
});

setInterval(function () {
    LogToConsole(true, "Updating power consumption");
    request(base_url + "/json.htm?type=devices&filter=utility&used=true&order=Name", function (err, result, body) {
        if (err) { return console.log(err); }
        var domodevices = JSON.parse(body); //We get all the domoticz devices
        devices.forEach(function (element) {
            if (EnergyDevices.test(element.dev.deviceType)) {
                element.getControlElectricity((err, res) => {
                    if (err) { return console.log(err); }
                    var dev = domodevices.result.filter(ob => { return (ob.Description == element.dev.uuid && ob.Type === "General"); });
                    if (dev && Array.isArray(dev) && dev.length > 0) {
                        dev = dev.pop();
                        if (dev) {
                            var msg = {
                                "idx": parseInt(dev.idx),
                                "nvalue": 0,
                                "svalue": "" + (parseInt(res.electricity.power) / 1000.0) + ";0"
                            };
                            client.publish('domoticz/in', JSON.stringify(msg));
                        }
                    }
                });
            }
        });
    });
}, options.powerUpdate * 1000);

process.on('SIGINT', () => {
    LogToConsole(true, 'Process ended');
})