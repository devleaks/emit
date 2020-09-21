import fs from "fs";
import program from "commander";
import * as debug from "./lib/debug.js";

import * as wssender from "./lib/ws-post-lib.js";
import * as mqttsender from "./lib/mqtt-post-lib.js";
import * as kafkasender from "./lib/kafka-post-lib.js";

/* COMMAND LINE PARAMETERS
 */
program
    .version("1.3.0")
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

let sender

switch (program.transport) {
    case "ws":
        sender = wssender
        break
    case "kafka":
        sender = kafkasender
        break
    case "mqtt":
        sender = mqttsender
        break
    default:
        console.log("no transport named", program.transport)
}


/* INPUT
 */
if (sender) {
    const file = fs.readFileSync(program.file, "utf8")
    const records = file.split("\n");
    debug.print("record 0", records[0])

    /* MAIN
     */
    //sender.init()
    var res = sender.post(records, program.opts())
} else {
    console.log("no sender transport")
}