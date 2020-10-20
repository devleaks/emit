import mqtt from "mqtt";
import * as debug from "./debug.js";
import * as config from "../data/mqtt-config.js";

let client


export const init = function() {
    client = mqtt.connect(config.mqtt);
}


export const send = function(data, options) {
    const dest = JSON.parse(data)
    client.publish(dest[options.topic], data)
}