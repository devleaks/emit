import fs from "fs";
import program from "commander";
import parse from "csv-parse/lib/sync.js";
import * as config from "./data/sim-config.js";
import * as debug from "./lib/debug.js";
import * as kpost from "./lib/kafka-post-lib.js";

/* COMMAND LINE PARAMETERS
 */
program
    .version("1.3.0")
    .description("Convert data from FeatureCollection of Point to CSV")
    .option("-d, --debug", "output extra debugging")
    .option("-k, --kafka", "send to kafka")
    .option("-p, --payload", "csv has payload column")
    .option("-r, --rate <delay>", "Let that amount of time between events, 1 second, default", 1)
    .option("-s, --speed <factor>", "Increases time by that factor")
    .option("-o, --output <file>", "Save to file, default to out.csv", "out.csv")
    .requiredOption("-f, --file <file>", "GeoJSON file to process")
    .parse(process.argv)

debug.init(program.debug, ["", "_post", "ksend"])
debug.print(program.opts())


/* INPUT
 */
const csvstring = fs.readFileSync(program.file, "utf8")

const cols = config.CSV.DEVICE + (program.payload ? ",payload" : "")

var records = parse(csvstring, { columns: cols.split(",") })
debug.print("record 0", records[0])
records = records.sort((a, b) => (a.timestamp > b.timestamp) ? 1 : -1)


/* MAIN
 */
var res = kpost.post(records, program.opts())
