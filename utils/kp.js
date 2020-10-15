import pkg from "kafkajs";
const { Kafka, logLevel } = pkg;

const kafka = new Kafka({
  logLevel: logLevel.INFO,
  brokers: ["ordralfabetix.gip4.com:9192"],
  clientId: "gipsim-producer",
})

const topic = "test"
const producer = kafka.producer()

const getRandomNumber = () => Math.round(Math.random(10) * 1000)
const createMessage = num => ({
  key: `key-${num}`,
  value: `value-${num}-${new Date().toISOString()}`,
})

const sendMessage = () => {
  let msg = Array(1)
        .fill()
        .map(_ => createMessage(getRandomNumber()))
  console.log("sending...",msg)
  return producer
    .send({
      topic,
      messages: msg,
    })
    .then(console.log("..sent"))
    .catch(e => console.error(`[example/producer] ${e.message}`, e))
}

const run = async () => {
  await producer.connect()
  setInterval(sendMessage, 3000)
}

run().catch(e => console.error(`[example/producer] ${e.message}`, e))

const errorTypes = ["unhandledRejection", "uncaughtException"]
const signalTraps = ["SIGTERM", "SIGINT", "SIGUSR2"]

errorTypes.map(type => {
  process.on(type, async () => {
    try {
      console.log(`process.on ${type}`)
      await producer.disconnect()
      process.exit(0)
    } catch (_) {
      process.exit(1)
    }
  })
})

signalTraps.map(type => {
  process.once(type, async () => {
    try {
      await producer.disconnect()
    } finally {
      process.kill(process.pid, type)
    }
  })
})