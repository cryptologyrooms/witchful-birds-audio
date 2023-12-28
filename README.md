# Witchful Birds Audio

## Notes
```
sudo apt-get update
sudo apt-get install build-essential software-properties-common vim git curl apt-transport-https lsb-release ca-certificates dirmngr unzip
sudo apt-get install avahi-daemon avahi-discover avahi-utils libnss-mdns

# https://github.com/nodesource/distributions#debian-and-ubuntu-based-distributions

sudo npm install typescript rimraf node-gyp -g
sudo npm install ts-node -g
sudo apt-get -y install mpg321
```

was IQAduIO is now owned by foundation  
https://www.raspberrypi.com/documentation/accessories/audio.html
https://pinout.xyz/pinout/pi_digiamp  

`dtoverlay=iqaudio-digiampplus,unmute_amp`
`#dtparam=audio=on`

used pins

2   i2c
3   i2c
18  i2s
22  mute/unmute
23  ? rotray
24  ? rotray
25  ? IR Sendor
19  i2s
20  i2s
21  i2s


```
var player = require('play-sound')(opts = {})

player.play('http://staging-tempus.local/audio/rameseize/anticlock.mp3', { mpg123: ['-g', 10] }, function(err) {
  if (err) throw err
})
```

TODO: use puzzle data for default volume control?
some way to remote restart the process
some way to remote reload the data
internally catch no network at startup and retry nicely

