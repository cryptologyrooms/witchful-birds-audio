#!/usr/bin/env node

import dotenv from 'dotenv';
dotenv.config();

import os from 'os';
import * as Mqtt from 'mqtt';
import MQTTPattern from 'mqtt-pattern';
import axios from 'axios';
axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';

import moment from 'moment-timezone';
import momentDurationFormatSetup from 'moment-duration-format';

momentDurationFormatSetup(moment);
typeof moment.duration.fn.format === 'function';
typeof moment.duration.format === 'function';

import Play from 'play-sound';
let player = new Play({'player':'mpg123'});
var audio = undefined;

import ziggyJs from 'ziggy-js';

async function loadZiggy() {
  console.log('Loading Ziggy data');
  try {
    const response = await axios.get(process.env.APP_URL + '/api/ziggy');
    return await response.data;
  } catch (error) {
    console.error(error);
  }
}

const Ziggy = await loadZiggy();
let route = (name, params, absolute, config = Ziggy) => ziggyJs(name, params, absolute, config);

const roomSlug = process.env.ROOM_SLUG;
const roomScreenName = process.env.ROOM_SCREEN_NAME;
const defaultVolume = process.env.DEFAULT_VOLUME;
const motorPin = process.env.MOTOR_PIN;

const birdsAudioPath = process.env.BIRDS_AUDIO_URL;
const birdsAudioAlternatePath = process.env.BIRDS_AUDIO_ALTERNATE_URL;
const birdsEvent = process.env.BIRDS_EVENT;
const birdsAlternateEvent = process.env.BIRDS_ALTERNATE_EVENT;
const birdsStopEvent = process.env.BIRDS_STOP_EVENT;
const birdsPauseEvent = process.env.BIRDS_PAUSE_EVENT;
const birdsResumeEvent = process.env.BIRDS_RESUME_EVENT;

console.log('Room Slug: ' + roomSlug);
console.log('Room ScreenName: ' + roomScreenName);
console.log('Default volume: ' + defaultVolume);
console.log('birdsAudioPath: ' + birdsAudioPath);
console.log('birdsAudioAlternatePath: ' + birdsAudioAlternatePath);
console.log('birdsEvent: ' + birdsEvent);
console.log('birdsAlternateEvent: ' + birdsAlternateEvent);
console.log('birdsStopEvent: ' + birdsStopEvent);
console.log('birdsPauseEvent:' + birdsPauseEvent);
console.log('birdsResumeEvent:' + birdsResumeEvent);


let defaultData = {
  room: null,
  clues: null,
  events: null,
  roomState: null,
  duration: null,
  start: null,
  gameState: null,
  currentTimeInterval: null,
  currentTime: moment(),
  escapeTime: null,
  failTime: null,
  clueTimeout: null,
  clueHtml: null,
  audioPath: null,
  playAudio: false,
};

let currentData = JSON.parse(JSON.stringify(defaultData));
currentData.currentTime = moment();

async function loadRoomData() {
  console.log('Loading Room Data');
  await axios.get(route('api.rooms.show', roomSlug))
      .then(response => {
        if (response.status == 200) {
          currentData.room = response.data;
          console.log('Loaded Room Data');
        }
      })
      .catch(error => {
        console.log('fetchRoom: Error', error);
      });

  const request = {
    key_by_id: 1,
  };

  await axios.get(route('api.rooms.clues.index', roomSlug), {params: request})
      .then(response => {
        if (response.status == 200) {
          currentData.clues = response.data;
          console.log('Loaded Clues');
        }
      })
      .catch(error => {
        console.log('fetchClues: Error', error);
      });

  await axios.get(route('api.rooms.game-events.index', roomSlug), {params: request})
      .then(response => {
        if (response.status == 200) {
          currentData.events = response.data;
          console.log('Loaded GameEvents');
        }
      })
      .catch(error => {
        console.log('fetchGameEvents: Error', error);
      });
}

await loadRoomData();

// let clientId = mqtt.options.clientId;
const clientId = 'mqttjs_' + Math.random().toString(16).substr(2, 8);
const localIp = Object.values(os.networkInterfaces()).flat().find(i => i.family == 'IPv4' && !i.internal).address;
const presenceTopic = 'tempus/room/' + roomSlug + '/presence/' + clientId;
const presencePayload = {
    component: roomScreenName,
    state: 'WILL',
};
const puzzleLogTopic = 'tempus/room/' + roomSlug + '/puzzle/' + roomScreenName + '/log';

const mqttOptions = {
    will:{
        topic: presenceTopic,
        payload: undefined,
        retain: true,
        qos: 0,
    },
};

const mqttClient  = Mqtt.connect('mqtt://' + process.env.MQTT_HOST + ':' + process.env.MQTT_PORT, mqttOptions);
// 'ws://' + process.env.MIX_MQTT_HOST + ':' + process.env.MIX_MQTT_PORT +'/mqtt'

const mqttTopics = {
  'tempus/room/+roomSlug/room-state' (data, packet, topic) {
    if (topic != 'tempus/room/' + roomSlug + '/room-state') {
      return;
    }

    let payload = data.length ? JSON.parse(data) : null;
    console.log('room-state', payload);
    currentData.roomState = payload;
  },

  'tempus/room/+roomSlug/duration' (data, packet, topic) {
    if (topic != 'tempus/room/' + roomSlug + '/duration') {
      return;
    }

    let payload = data.length ? JSON.parse(data) : null;
    console.log('duration', payload);
    currentData.duration = payload;
  },

  'tempus/room/+roomSlug/start' (data, packet, topic) {
    if (topic != 'tempus/room/' + roomSlug + '/start') {
      return;
    }

    let payload = data.length ? JSON.parse(data) : null;
    console.log('start', payload);
    currentData.start = payload;
  },

  'tempus/room/+roomSlug/game-state' (data, packet, topic) {
    if (topic != 'tempus/room/' + roomSlug + '/game-state') {
      return;
    }

    let payload = data.length ? JSON.parse(data) : null;
    console.log('game-state', payload);
    currentData.gameState = payload;
    gameStateChanged();
  },

  'tempus/room/+roomSlug/clue' (data, packet, topic) {
    if (topic != 'tempus/room/' + roomSlug + '/clue') {
      return;
    }

    let payload = data.length ? JSON.parse(data) : null;
    console.log('clue', payload);

    clueReceived(payload);
  },

  'tempus/room/+roomSlug/event' (data, packet, topic) {
    if (topic != 'tempus/room/' + roomSlug + '/event') {
      return;
    }

    let payload = data.length ? JSON.parse(data) : null;
    console.log('event', payload);

    eventReceived(payload);
  },

  'tempus/room/+roomSlug/music' (data, packet, topic) {
    if (topic != 'tempus/room/' + roomSlug + '/music') {
      return;
    }

    let payload = data.length ? JSON.parse(data) : null;
    console.log('music', payload);
  },
};

mqttClient.on('connect', function () {
  console.log('MQTT: Connect');
  presencePayload.state = 'ONLINE';
  presencePayload.ip = localIp;
  mqttClient.publish(presenceTopic, JSON.stringify(presencePayload), {retain: true});

  mqttClient.subscribe(
    Object.keys(mqttTopics).map(topic => MQTTPattern.fill(topic, {roomSlug: roomSlug}))
  );
});

mqttClient.on('message', function (topic, message, packet) {
  // message is Buffer
  Object.keys(mqttTopics).forEach(pattern => {
    if (MQTTPattern.matches(pattern, topic)) {
      mqttTopics[pattern](message, packet, topic);
    }
  });
})

function endTime() {
  if (currentData.start == null || currentData.duration == null) {
    return null;
  }

  return moment(currentData.start.start).add(currentData.duration.duration, 'minutes');
}

function countdownTime() {
  currentData.endTime = endTime();
  let countdownTime = 'TIME GOES HERE';
  if (currentData.start && currentData.gameState && currentData.duration) {
    switch (currentData.gameState.state) {
      case 'R':
        countdownTime = 'Ready To Start';
        break;
      case 'SS':
        countdownTime = 'Briefing';
        break;
      case 'S':
        let duration = moment.duration(currentData.endTime.diff(currentData.currentTime));
        if (duration < 0) {
          countdownTime = '-' + moment.duration(currentData.currentTime.diff(currentData.endTime)).format('mm:ss', 1) + ' GAME OVER';
        } else if (duration > 600000) {
          countdownTime = duration.format('mm:ss');
        } else {
          countdownTime = duration.format('mm:ss', 1);
        }

        break;
      case 'E':
        countdownTime = moment.duration(currentData.endTime.diff(currentData.escapeTime)).format('mm:ss', 1) + ' GAME OVER';
        break;
      case 'F':
        countdownTime = moment.duration(currentData.endTime.diff(currentData.failTime)).format('mm:ss', 1) + ' GAME OVER';
        break;
      default:
        break;
    }
  }

  return countdownTime;
}

// Ticking Clock
currentData.currentTimeInterval = setInterval(() => {
  currentData.currentTime = moment();
}, 100);

function gameStateChanged() {
  if (currentData.gameState == null) {
    stopAudio();
    currentData.audioPath = birdsAudioPath;

    return;
  }

  switch (currentData.gameState.state) {
      case 'R':
        stopAudio();
        currentData.audioPath = birdsAudioPath;
        break;
      case 'SS':
        stopAudio();
        currentData.audioPath = birdsAudioPath;
        break;
      case 'S':
        stopAudio();
        currentData.audioPath = birdsAudioPath;
        break;
      case 'E':
        stopAudio();
        break;
      case 'F':
        stopAudio();
        break;
      default:
        break;
    }
}

function clueReceived(clue) {
  console.log('clueReceived(clue)', clue);
}

function eventReceived(event) {
  console.log('eventReceived(event)', event);
  switch (event.event) {
    case birdsEvent:
      currentData.audioPath = birdsAudioPath;
      currentData.playAudio = true;
      playAudioLoop();
      break;
    case birdsAlternateEvent:
      currentData.audioPath = birdsAudioAlternatePath;
      currentData.playAudio = true;
      break;
    case birdsResumeEvent:
      currentData.playAudio = true;
      playAudioLoop();
      break;
    case birdsStopEvent:
    case birdsPauseEvent:
      stopAudio();
      break;
    default:
      break;
  }
}

function recoverStateFromGame() {
  log('recoverStateFromGame()');
  let eventGameTimelines = currentData.game.game_timelines.filter(gameTimeline => gameTimeline.game_event_id != null)
  // console.log('recoverStateFromGame()', eventGameTimelines);

  eventGameTimelines.forEach(gameTimeline => {
    switch (gameTimeline.game_event.event) {
      case birdsEvent:
        currentData.audioPath = birdsAudioPath;
        currentData.playAudio = true;
        playAudioLoop();
        break;
      case birdsAlternateEvent:
        currentData.audioPath = birdsAudioAlternatePath;
        currentData.playAudio = true;
        playAudioLoop();
        break;
      case birdsResumeEvent:
        currentData.playAudio = true;
        playAudioLoop();
        break;
      case birdsStopEvent:
      case birdsPauseEvent:
        stopAudio();
        break;
      default:
        break;
    }
  });
}

function fetchGame(gameId) {
  log('fetchGame(gameId)', gameId);

  axios.get(route('api.games.show', gameId))
    .then(response => {
      if (response.status == 200) {
        currentData.game = response.data;
        recoverStateFromGame();
      }
    })
    .catch(error => {
      // flash('Error fetching Game', 'danger');
      if (error.response) {
        // if HTTP_UNPROCESSABLE_ENTITY some validation error laravel or us
        if (error.response.status == 422) {
          console.log('fetchGame: laravel validation error', error.response.data);
        }
        // else if HTTP_CONFLICT
        // else if HTTP_FORBIDDEN on enough permissions
        if (error.response.status == 401) {
          // else if HTTP_UNAUTHORIZED not authorized
          console.log('fetchGame:401', error.response.data);
        }
        console.log('fetchGame: Response error', error.response.data, error.response.status, error.response.headers);
      } else if (error.request) {
        // The request was made but no response was received
        // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
        // http.ClientRequest in node.js
        console.error('fetchGame: Request error', error.request);
      } else {
        // Something happened in setting up the request that triggered an Error
        console.error('fetchGame: Error', error.message);
      }
    });
}

function sendEvent(eventCode, options = {}) {
  log('sendEvent(eventCode, options)', eventCode, options);
  let event = Object.values(currentData.events).find(event => event.event == eventCode);

  if (event == null) {
    log('sendEvent: code ' + eventCode + ' not found!');

    return;
  }

  let eventPayload = {
    timestamp: moment(),
    eventId: event.id,
    event: event.event,
    message: event.description,
    options: {
      source: 'auto',
      bypass: false,
      ...options,
    },
  };

  mqttClient.publish('tempus/room/' + this.room.slug + '/event', JSON.stringify(eventPayload));
}

function playAudioLoop() {
  console.log('playAudio()');

  if (currentData.playAudio == false) {
    return;
  }

  try {
    audio.kill();
  } catch (error) {
    //
  }

  let volume =  defaultVolume;
  log('Playing (looped) : ' + currentData.audioPath + ' at volume: ' + volume);

  audio = player.play(
    currentData.audioPath,
    { mpg123: ['-g', volume] },
    function(err) {
      log('Playing ended: ' + currentData.audioPath);
      playAudioLoop()
      if (err) {
        log("Play Error:", err);
      } else {
      }
    }
  );
}

function playAudio(clue) {
  console.log('playAudio(clue)');
  try {
    audio.kill();
  } catch (error) {
    //
  }

  let audioPath = route('index') + clue.audioPath;
  let volume = clue.options.volume ?? defaultVolume;
  log('Playing : ' + audioPath + ' at volume: ' + volume);

  audio = player.play(
    audioPath,
    { mpg123: ['-g', volume] },
    function(err) {
      log('Playing ended: ' + audioPath);
      if (err) {
        log("Play Error:", err);
      } else {
      }
    }
  );
}

function stopAudio() {
  console.log('stopAudio())');
  currentData.playAudio = false;
  try {
    audio.kill();
  } catch (error) {
    //
  }
}

function log(...args) {
  console.log(...args);
  if (mqttClient.connected) {
    mqttClient.publish(puzzleLogTopic, JSON.stringify(args));
  }
}
