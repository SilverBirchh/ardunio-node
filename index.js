"use strict";

// Require
const serialport = require('serialport');
const WebSocketServer = require('ws').Server;
const http = require('http');
const Hapi = require('hapi');
const nano = require('nano')('http://localhost:5984/eye_health');

// Time elapsed
const time = {
  previous: 0,
  elapsed: 0,
  makeSound: false,
  userDefinedTime: 60,
}

// ----------------------------------------------
// Set up hapi Server
// ----------------------------------------------

const server = Hapi.server({
  host: 'localhost',
  port: 8000
});

server.route({
  method: 'POST',
  path: '/breakTime',
  handler: function(request, h) {
    const breakTime = JSON.parse(request.payload).breakTime;

    myPort.write(`${breakTime * 60}`);

    const data = {
      key: 'value'
    }
    return h.response(data).code(200)
  },
  config: {
    cors: {
      origin: ['*'],
      additionalHeaders: ['cache-control', 'x-requested-with']
    }
  },
});

server.route({
  method: 'GET',
  path: '/history',
  handler: async function(request, h) {
    const body = await nano.list({
      include_docs: true
    })
    return h.response(body.rows[body.rows.length - 1].doc.contact).code(200)
  },
  config: {
    cors: {
      origin: ['*'],
      additionalHeaders: ['cache-control', 'x-requested-with']
    }
  },
});

async function startHapi() {
  try {
    await server.start();
    const body = await nano.list({
      include_docs: true
    })
    time.rev = body.rows[0].value.rev;
    time.contact = body.rows[0].doc.contact;
  } catch (err) {
    console.log(err);
    process.exit(1);
  }

  console.log('Server running at:', server.info.uri);
};


// ----------------------------------------------
// Set up ws
// ----------------------------------------------
const wss = new WebSocketServer({
  port: 40510
})

wss.on('connection', function(ws) {
  ws.on('message', function(message) {
    console.log(`received: ${message}`);
  });

  setInterval(function() {
      sendTime(ws)
    },
    1000);
});

function sendTime(ws) {
  if (time.previous !== time.elapsed) {
    ws.send(time.elapsed);
  }

  if (time.makeSound) {
    ws.send('MAKE_SOUND');
    time.makeSound = false;
  }
}

// ----------------------------------------------
// Set up Serial
// ----------------------------------------------
const portName = process.argv[2];

const myPort = new serialport(portName, {
  baudRate: 9600,
});

myPort.on('open', onOpen);
myPort.on('data', onData);

function onOpen() {
  console.log('Open connection');
}

function onData(data) {
  console.log(`${data}`);
  data = `${data}`;

  if (data.includes('MAKE_SOUND')) {
    time.makeSound = true;
  } else if (data.includes('TIME')) {
    time.previous = time.elapsed;
    time.elapsed = data.substring(data.indexOf(':') + 1, data.length);
  }

  if (time.previous > 2 && time.elapsed == 0) {
    time.contact.push(+time.previous);
    console.log(time.contact);
    nano.insert({
      "contact": time.contact
    }).then((r) => console.log(r));
  }
}


startHapi();
