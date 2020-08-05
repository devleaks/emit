import fs from "fs";
import program from "commander";
import * as debug from "./lib/debug.js";
import * as sender from "./lib/mqtt-post-lib.js";

/* COMMAND LINE PARAMETERS
 */
program
    .version("1.0.0")
    .description("Pushes data to MQTT queues")
    .option("-d, --debug", "output extra debugging")
    .option("-r, --rate <delay>", "Let that amount of time between events, 1 second, default", 1)
    .option("-s, --speed <factor>", "Increases time by that factor")
    .option("-w, --wait <time>", "Wait delay seconds before starting to emit", 5)
    .requiredOption("-f, --file <file>", "GeoJSON file to process")
    .parse(process.argv)

debug.init(program.debug, ["", "_post"])
debug.print(program.opts())


/* INPUT
 */
const file = fs.readFileSync(program.file, "utf8")
const records = file.split("\n");
debug.print("record 0", records[0])

/* MAIN
 */
var res = sender.post(records, program.opts())