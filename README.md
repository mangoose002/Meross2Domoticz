# Meross2Domoticz
NodeJS bridge between Meross IOT and Domoticz<br />
Works with MSS310/MSS420/MSS425<br />
Needs to be tested with MSS110/MSS210/MSS710/MSS620<br />

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
P.S. I am not able to test with MSS110/MSS210/MSS520 & MSS710.
I assumed it was working exactly the same way as the MSS310/MSS425. I hope it works this way
