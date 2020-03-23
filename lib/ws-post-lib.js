const moment = require('moment')

const WebSocket = require('ws');

const debug = require('../lib/debug')
const simview = require('../lib/simview')

const wss = new WebSocket.Server({
    host: 'localhost',
    port: 8051
});

/*
const interval = setInterval(function ping() {
    wss.clients.forEach(function each(ws) {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping('', false, true);
    });
}, 30000);
*/

function heartbeat() {
    this.isAlive = true;
}

wss.on('connection', function connection(ws) {
    ws.isAlive = true;

    ws.on('pong', heartbeat);

    ws.on('message', function incoming(data) {
        // Broadcast to everyone else.
        debug.print('received: %s', data.substr(0, 50) + '...');
        wss.clients.forEach(function each(client) {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(data);
            }
        });
    });
});


function send(data) {
    wss.clients.forEach(function each(client) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}


function _post(records, options) {
    if (records.length < 1)
        return false;
    const r = records.shift()
    const obj = simview.convert(r)
    if(obj) {
        send(JSON.stringify(obj))
        debug.print("sent", obj)
    }
    if (records.length > 0) {
        const n = records[0].split(',')
        const p = r.split(',')
        var w = options.rate
        if (options.speed) {
            const f = parseFloat(options.speed)
            if (f > 0) {
                var duration = moment(n[2], moment.ISO_8601).diff(moment(p[2], moment.ISO_8601))
                w = moment.duration(duration).seconds() / f
            }
        }
        debug.print("waiting " + w + " secs...", records.length + " left")
        setTimeout(_post, w * 1000, records, options)
    }
}



exports.post = function(records, options) {
    _post(records, options)
}