import config from "../data/kafka-config.js";
/* Kafka config:

export default {
    clientId: "gip-simulator",
    brokers: ["kafkahostname:9092"]
};

*/
import KafkaImport from "kafkajs";
const { Kafka } = KafkaImport;

let client
let producer

export const init = function() {
    console.log(config)
    client = new Kafka(config)
    producer = client.producer()
}

export const send = async function(record) {
    await producer.connect()
    await producer.send({
        topic: record.queue,
        messages: [
            record
        ],
    })
}