# Meross2Domoticz
NodeJS bridge between Meross IOT and Domoticz<br />
Works with MSS310/MSS210/MSS425<br />

## Credits
It is based on the Meross-Cloud work by Apollon77
https://github.com/Apollon77/meross-cloud

## Setup in Domoticz
No setup needed. Everything is created by the script in Domoticz (if new devices is authorized)<br />
Switch devices are automaticaly created using the name provided in the Meross config.<br />
Energy devices are automaticaly created using the name provided in the Meross config.<br />
<br />
Just need to complete the config.json file with your credentials and MQTT and Domoticz IP/ports <br />

<br />
P.S. I am not able to test with the MSS210. I assumed it was working exactly the same way as the MSS310 without
the power measurement. I hope it works this way

P.S. If you were using this script before it supports MSS425. You have two options:<br />
1 - Delete the switch you previously created and let the script recreate them
2 - Edit the description of you switches and add |0 at the end of the uuid. It will tell the system to use the channel 0
