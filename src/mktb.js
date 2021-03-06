import fs from "fs";
import moment from "moment";
import program from "commander";
import * as debug from "./lib/debug.js";
import * as config from "./data/sim-config-transport.js";
import * as roadsData from "./lib/roads.js";
import * as trucksData from "./lib/truck.js";

let roads = roadsData.init(config)
let trucks = trucksData.init(config)


// round to next 5 minutes
const now = moment();
const now5 = moment(now).add(5 - (now.minute() % 5), "minutes").add(-now.second(), "seconds").add(-now.millisecond(), "milliseconds")

program
    .version("1.1.0")
    .description("generates tranport board")
    .option("-d, --debug", "output extra debugging")
    .option("-o, --output <file>", "save to file, default to out.csv", "out.csv")
    .option("-1, --first", "Add header line")
    .requiredOption("-c, --count <count>", "count of transports (arrival then departure")
    .option("-w, --warehouse <warehouse>", "name of handler warehouse")
    .option("-s, --start-date <date>", "start date of event reporting, default to now", now5.toISOString())
    .option("-0, --midnight", "Generates transports after midnight, next day")
    .parse(process.argv)

debug.init(program.debug, [""])
debug.print(program.opts())

function rndInt(n) {
    return Math.floor(Math.random() * n)
}

function nextTransport(n) {
    const p = config.simulation["time-between-transports"]
    return p[0] + 5 * rndInt(Math.round(Math.abs(p[1] - p[0]) / 5))
}

function turnAround() {
    const p = config.simulation["loading-time"]
    return p[0] + 5 * rndInt(Math.round(Math.abs(p[1] - p[0]) / 5))
}

function randomTruckboard(options) {
    let txt = options.first ? config.CSV["TRUCK"] + "\n" : ""
    let time = options.midnight ?
        moment(moment().add(1, "days").format("YYYY-MM-DDT00:00:00.000"))
        :
        (options.startDate ? moment(options.startDate) : moment())

    for (let i = 0; i < options.count; i++) {
        const handler = program.warehouse ? program.warehouse : roadsData.randomHandler()
        let truck = trucksData.randomTruckname()
        time.add(nextTransport(2), "m")

        // arrival
        let src = roadsData.randomHighway()

        // turnaround
        let time2 = moment(time)
        time2.add(turnAround(), "m")
        // departure
        let dest = roadsData.randomHighway()

        let parking = roadsData.findParking(time.toISOString(), time2.toISOString(), handler)
        if (parking) {
            roadsData.park(parking, time.toISOString(), time2.toISOString())
            // print arrival
            debug.print("arrival", handler, truck, src, time.format("HH:mm"), parking)
            txt += "arrival," + handler + "," + parking + "," + truck + "," + dest + ",," + time.format("HH:mm") + "\n"
            // truck = trucksData.randomTruckname() // leaves with same name otherwise too complicated
            // print departure
            txt += "departure," + handler + "," + parking + "," + truck + "," + dest + ",," + time2.format("HH:mm") + "\n"
            debug.print("departure", handler, truck, dest, time2.format("HH:mm"), parking)
        } else {
            debug.error("no parking available for ", handler)
        }

    }
    return txt
}

let s = randomTruckboard(program.opts())
fs.writeFileSync(program.output, s, { mode: 0o644 })
debug.print(program.output + " written")