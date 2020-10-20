import WebSocket from "ws";
import * as debug from "./debug.js";
import * as config from "../data/ws-config.js";

let wss;


export const init = function() {
    wss = new WebSocket.Server(config.websocket);

    function heartbeat() {
        this.isAlive = true;
    }

    wss.on("connection", function connection(ws) {
        ws.isAlive = true;

        ws.on("pong", heartbeat);

        ws.on("message", function incoming(data) {
            // Broadcast to everyone else.
            debug.print("received: %s", data.substr(0, 50) + "...");
            wss.clients.forEach(function each(client) {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(data);
                }
            });
        });
    });
}

/*
const interval = setInterval(function ping() {
    wss.clients.forEach(function each(ws) {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping("", false, true);
    });
}, 30000);
*/


export const send = function(data, options) {
    wss.clients.forEach(function each(client) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}