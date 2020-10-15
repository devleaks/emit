import pkg from "kafkajs";
const { Kafka, logLevel } = pkg;

const kafka = new Kafka({
  logLevel: logLevel.INFO,
  brokers: ["ordralfabetix.gip4.com:9192"],
  clientId: "gipsim-consumer",
})

const topic = "test"
const consumer = kafka.consumer({ groupId: "emit-group" })

const run = async () => {
  await consumer.connect()
  await consumer.subscribe({ topic, fromBeginning: true })
  await consumer.run({
    // eachBatch: async ({ batch }) => {
    //   console.log(batch)
    // },
    eachMessage: async ({ topic, partition, message }) => {
      const prefix = `${topic}[${partition} | ${message.offset}] / ${message.timestamp}`
      console.log(`- ${prefix} ${message.key}: ${message.value}`)
    },
  })
}

run().catch(e => console.error(`[example/consumer] ${e.message}`, e))

const errorTypes = ["unhandledRejection", "uncaughtException"]
const signalTraps = ["SIGTERM", "SIGINT", "SIGUSR2"]

errorTypes.map(type => {
  process.on(type, async e => {
    try {
      console.log(`process.on ${type}`)
      console.error(e)
      await consumer.disconnect()
      process.exit(0)
    } catch (_) {
      process.exit(1)
    }
  })
})

signalTraps.map(type => {
  process.once(type, async () => {
    try {
      await consumer.disconnect()
    } finally {
      process.kill(process.pid, type)
    }
  })
})