const moment = require('moment')

const WebSocket = require('ws');

const debug = require('../lib/debug')
const simview = require('../lib/simview')
const config = require('../sim-config')

const wss = new WebSocket.Server(config.websocket);

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
    if (records.length > 0) {
        const r = records.shift()
        const obj = simview.convert(r, options)
        if (obj) {
            if (Array.isArray(obj)) {
                obj.forEach(function(msg) {
                    send(JSON.stringify(msg))
                })
            } else {
                send(JSON.stringify(obj))
            }
            //debug.print("sent", obj)
        }
        if (records.length > 0) {
            const n = records[0].split(',')
            const p = r.split(',')
            var w = options.rate
            if (options.speed) {
                const f = parseFloat(options.speed)
                if (f > 0) {
                    var duration = moment(n[2], moment.ISO_8601).diff(moment(p[2], moment.ISO_8601))
                    w = moment.duration(duration).asSeconds() / f
                }
            }
            debug.print( p[0],p[1])
            debug.print( /*p[0],p[1],*/ "waiting " + (Math.round(w * 100) / 100) + " secs...", records.length + " left")
            setTimeout(_post, w * 1000, records, options)
        } else {
            console.log("finished")
        }
    }
}



exports.post = function(records, options) {
    const r = records.pop() // last line may be empty
    if (r != '') {
        records.push(r)
    }
    const dt = simview.getDateTime(records[0])
    const siminfo = "siminfo,sync,"+dt+","+ options.speed+","+ options.rate+","+ options.wait
    console.log(siminfo)
    records.unshift(siminfo)
    const i = options.wait
    console.log("starting in "+i+" seconds")
    setTimeout(_post, i*1000, records, options)
    // _post(records, options)
}