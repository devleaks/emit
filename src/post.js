import fs from "fs";
import program from "commander";
import * as debug from "./lib/debug.js";
import moment from "moment";

import { post } from "./lib/post-lib.js";

import { send as wssender, init as wsinit }  from "./lib/ws-post-lib.js";
import { send as mqttsender, init as mqttinit } from "./lib/mqtt-post-lib.js";
import { send as kafkasender, init as kafkainit } from "./lib/kafka-post-lib.js";

/* COMMAND LINE PARAMETERS
 */
program
    .version("2.3.0")
    .description("Pushes messages to transport")
    .option("-d, --debug", "output extra debugging")
    .option("-r, --rate <delay>", "Let that amount of time between events, 1 second, default", 1)
    .option("-s, --speed <factor>", "Increases time by that factor")
    .option("-p, --pid <file>", "save current process in supplied file")
    .option("-a, --flat", "Flatten JavaScript Object before sending")
    .option("-w, --wait <time>", "Wait delay seconds before starting to emit", 5)
    .option("-n, --now <ISO8601-date-time>", "Start after supplied ISO8601 formatted date-time like '"+moment().toISOString(true)+"'. You can also use 'now' to set it to current date and time.")
    .option("-z, --forceSend", "Force emission of skipped message with no timing")
    .requiredOption("-t, --transport <transport-mode>", "Transport provider [ws|kafka|mqtt]")
    .requiredOption("-f, --file <file>", "GeoJSON file to process")
    .parse(process.argv)

debug.init(program.debug, ["", "_post", "post", "send"])
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
    if(program.pid) {
        fs.writeFileSync(program.pid, process.pid.toString(), { mode: 0o644 })
    }

    inits.forEach( (i) => i.call() )

    const file = fs.readFileSync(program.file, "utf8")
    const records = file.split("\n");
    debug.print("record 0", records[0])

    //for(let i = 0; i < records.length; i++)
    //    debug.print(i, records[i].split(",")[2])

    /* MAIN
     */
    post(senders, records, program.opts())
} else {
    console.log("no sender transport")
}