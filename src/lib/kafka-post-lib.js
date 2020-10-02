import * as debug from "./debug.js";
import config from "../data/kafka-config.js";
/* Kafka config:

export default {
    clientId: "gip-simulator",
    brokers: ["kafkahostname:9092"]
};

*/
import KafkaImport from "kafkajs";
const { Kafka } = KafkaImport;

let producer

export const init = function() {
    debug.print(config)
    let client = new Kafka(config)
    producer = client.producer()
//  await producer.connect()
}

export const send = async function(data) {
    const dest = JSON.parse(data)
    await producer.connect()
    await producer.send({
        topic: dest.type,
        messages: [
            data
        ],
    })
}