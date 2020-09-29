import fs from "fs";
import program from "commander";
import moment from "moment";
import * as debug from "./lib/debug.js";
import * as tocsv from "./lib/tocsv-lib.js";

/* COMMAND LINE PARAMETERS
 */
debug.init(true, [""])

program
    .version("1.3.0")
    .description("Convert data from FeatureCollection of Point to CSV")
    .option("-d, --debug", "output extra debugging")
    .option("-n, --device <name>", "device name")
    .option("-q, --queue <name>", "Kafka queue name", "queue")
    .option("-1, --first", "Add header line")
    .option("-p, --payload", "Add payload column with all properties")
    .option("-s, --start-date <date>", "Start date of event reporting, default to now", moment().toISOString())
    .option("-e, --event <event>", "Sync event number to sync date on", "first")
    .option("-r, --random <delay>", "Add or substract random delay to start-date in minutes", 0)
    .option("-o, --output <file>", "Save to file, default to out.csv", "out.csv")
    .requiredOption("-f, --file <file>", "GeoJSON file to process")
    .parse(process.argv)

debug.init(program.debug, [""])
debug.print(program.opts())


/* INPUT
 */
const jsonstring = fs.readFileSync(program.file, "utf8")

const startdate = moment(program.startDate)
if (!startdate.isValid()) {
    debug.print("start date is not valid", startdate)
} else {

    /* MAIN
     */
    let res = (program.event == "*") ?
        tocsv.tocsv_sync_all(JSON.parse(jsonstring), startdate, program) :
        tocsv.tocsv(JSON.parse(jsonstring), startdate, program)


    /* OUTPUT
     */
    if (res) {
        fs.writeFileSync(program.output, res.csv, { mode: 0o644 })
        debug.print(program.output + " written")
    } else {
        debug.print("nothing saved")
    }

}