# Meross2Domoticz
NodeJS bridge between Meross IOT and Domoticz<br />
Only works with MSS310/MSS210 for the moment<br />

## Credits
It is based on the Meross-Cloud work by Apollon77
https://github.com/Apollon77/meross-cloud

## Setup in Domoticz
No setup needed. Everything is created by the script in Domoticz (if new devices is authorized)<br />
Switch devices are automaticaly created using the name provided in the Meross config.<br />
Energy devices are automaticaly created using the name provided in the Meross config.<br />
<br />
Just need to complete the config.json file with your credentials and MQTT and Domoticz IP/ports <br />

## Todo
Update code to work with MSS425.<br />
<br />
P.S. I am not able to test with the MSS210. I assumed it was working exactly the same way as the MSS310 without
the power measurement. I hope it works this way
