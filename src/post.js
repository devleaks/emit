import fs from "fs";
import program from "commander";
import * as debug from "./lib/debug.js";

import { post } from "./lib/post-lib.js";

import { send as wssender, init as wsinit }  from "./lib/ws-post-lib.js";
import { send as mqttsender, init as mqttinit } from "./lib/mqtt-post-lib.js";
import { send as kafkasender, init as kafkainit } from "./lib/kafka-post-lib.js";

/* COMMAND LINE PARAMETERS
 */
program
    .version("2.0.0")
    .description("Pushes messages to websocket")
    .option("-d, --debug", "output extra debugging")
    .option("-r, --rate <delay>", "Let that amount of time between events, 1 second, default", 1)
    .option("-s, --speed <factor>", "Increases time by that factor")
    .option("-w, --wait <time>", "Wait delay seconds before starting to emit", 5)
    .requiredOption("-t, --transport <transport-mode>", "Transport provider [ws|kafka|mqtt]")
    .requiredOption("-f, --file <file>", "GeoJSON file to process")
    .parse(process.argv)

debug.init(program.debug, ["", "_post"])
debug.print(program.opts())

let transports = program.transport.split(",")
let senders = []
let inits = []

transports.forEach(t => {
    switch (t) {
        case "ws":
            senders.push(wssender)
            inits.push(wsinit)
            break
        case "kafka":
            senders.push(kafkasender)
            inits.push(kafkainit)
            break
        case "mqtt":
            senders.push(mqttsender)
            inits.push(mqttinit)
            break
        default:
            console.log("no transport named", program.transport)
    }
})


/* INPUT
 */
if (senders.length > 0) {
    inits.forEach( (i) => i.call() )

    const file = fs.readFileSync(program.file, "utf8")
    const records = file.split("\n");
    debug.print("record 0", records[0])

    /* MAIN
     */
    post(senders, records, program.opts())
} else {
    console.log("no sender transport")
}