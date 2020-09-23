import * as debug from "./debug.js";
import * as config from "../data/kafka-config.js";

import pkg from "kafka-node";
const { Producer, KafkaClient } = pkg;


let client
let producer

export const init = function() {
    client = new KafkaClient(config.kafka_server);
    producer = new Producer(client);
}

export const send = function(record) {
    try {
        const kafka_topic = record.queue;
        let payloads = [{
            topic: kafka_topic,
            messages: record
        }];

        producer.on("ready", async function() {
            let push_status = producer.send(payloads, (err, data) => {
                if (err) {
                    debug.print("[kafka-producer -> " + kafka_topic + "]: broker update failed");
                } else {
                    debug.print("[kafka-producer -> " + kafka_topic + "]: broker update success");
                }
            });
        });

        producer.on("error", function(err) {
            debug.print(err);
            debug.print("[kafka-producer -> " + kafka_topic + "]: connection errored");
            throw err;
        });
    } catch (e) {
        debug.print(e);
    }
}