import fs from "fs";
import moment from "moment";
import program from "commander";
import * as debug from "./lib/debug.js";
import * as config from "./data/sim-config.js";
import * as airportData from "./lib/airport.js";
import * as aircraftData from "./lib/aircraft.js";

let airport = airportData.init(config)

import * as airports from "./data/airport/airports.js";

// round to next 5 minutes
const now = moment();
const now5 = moment(now).add(5 - (now.minute() % 5), "minutes").add(- now.second(), "seconds").add(- now.millisecond(), "milliseconds")

program
    .version("1.1.0")
    .description("generates random flightboard")
    .option("-d, --debug", "output extra debugging")
    .option("-o, --output <file>", "Save to file, default to out.csv", "out.csv")
    .requiredOption("-c, --count <count>", "count of arrival/departure pairs")
    .option("-s, --start-date <date>", "start date of event reporting, default to now", now5.toISOString())
    .option("-t, --type <type>", "type of flights [PAX|CARGO]")
    .parse(process.argv)

debug.init(program.debug, [""])
debug.print(program.opts())

function rndInt(n) {
    return Math.floor(Math.random() * n)
}

function nextFlight(n) {
    const p = config.simulation["time-between-flights"]
    const m = config.simulation["min-flight-distance"]
    if (!m) {
        m = 5
    }
    let t = p[0] + m * rndInt(Math.round(Math.abs(p[1]-p[0]) / m))
    if (t < m) {
        t = m
    }
    return t
}

function turnAround(type = false) {
    const p = config.simulation["turnaround-time"]
    return p[0] + 5 * rndInt(Math.round(Math.abs(p[1]-p[0]) / 5))
}

function randomFlightboard(cnt, startdate, type = false) {
    let txt = "move,flight,airport,date,time,plane,parking,comment\n"
    let time = startdate ? moment(startdate) : moment()

    for (let i = 0; i < cnt; i++) {
        let ltype = type ? type : (Math.random() > config.simulation["paxratio"] ? "CARGO" : "PAX")
        let parking = airportData.randomParking(airportData.randomApron(ltype))
        let aircraft = aircraftData.randomAircraftICAO()
        let airport = airports.randomAirport()
        time.add(nextFlight(2), "m")
        let flightname = aircraftData.randomFlightname(ltype, false)
        // arrival
        debug.print("arrival", flightname, airport, time.format("HH:mm"), aircraft, parking)
        txt += "arrival," + flightname + "," + airport + "," + time.format("YYYY-MM-DD") + "," + time.format("HH:mm") + "," + aircraft + "," + parking + ",\n"
        // turnaround
        let time2 = moment(time)
        time2.add(turnAround(), "m")
        // departure
        airport = airports.randomAirport()
        flightname = aircraftData.randomFlightname(ltype, true, flightname)
        debug.print("departure", flightname, airport, time2.format("HH:mm"), aircraft, parking)
        txt += "departure," + flightname + "," + airport + "," + time2.format("YYYY-MM-DD") + "," + time2.format("HH:mm") + "," + aircraft + "," + parking + ",\n"
    }
    return txt
}

let s = randomFlightboard(program.count, program.startDate, program.type)
fs.writeFileSync(program.output, s, { mode: 0o644 })
debug.print(program.output + " written")