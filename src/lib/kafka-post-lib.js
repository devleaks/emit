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

const TOPIC_PREFIX = "gipsim_"

// comment out to send message to GIP queues
// config.TEST_TOPIC = "test"
// Local global :-D
let producer

export const init = function() {
    debug.print(config)
    const kafka = new Kafka({
        brokers: ["ordralfabetix.gip4.com:9192"],
        clientId: "emit",
    })
    producer = kafka.producer()
}

export const send = function(data, options) {
    const dest = JSON.parse(data) // dest.type is the topic
    producer.connect().then(() => {
        const topic = TOPIC_PREFIX + (config.TEST_TOPIC ? config.TEST_TOPIC : dest[options.topic])
        debug.print("kpost::send: sending..",topic)
        producer.send({
            topic,
            messages: [{
                key: dest.type,
                value: data
            }],
        })
        .then(debug.print("kpost::send: ..sent"))
        .catch(e => console.error(`kpost::send: ${e.message}`, e))
    })
}