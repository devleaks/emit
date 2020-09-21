import fs from "fs";
import * as simulator from "./lib/movement-lib.js";
import program from "commander";
import PathFinder from "geojson-path-finder";
import geojsonTool from "geojson-tools";
import * as geojson from "./lib/geojson-util.js";
import * as debug from "./lib/debug.js";
import * as config from "./data/sim-config.js";
import * as airportData from "./lib/airport.js";
import * as aircraftData from "./lib/aircraft.js";

debug.init(true, [""])

var airport = airportData.init(config)
var aircraft = aircraftData.init(config.aircrafts)

const wind = airport.METAR ? airport.METAR["wind_dir_degrees"][0] : Math.round(Math.random() * 360)
const isLanding = (Math.random() > 0.5)
const runway = airportData.randomRunway(wind)

program
    .version("2.3.0")
    .description("generates GeoJSON features for one aircraft takeoff or landing")
    .option("-d, --debug", "output extra debugging")
    .option("-o, --output <file>", "Save to file, default to out.json", "out.json")
    .option("-n, --numero <name>", "aircraft name", aircraftData.randomAircraftICAO())
    .option("-m, --aircraft <model>", "aircraft model", aircraftData.randomAircraftModel())
    .option("-r, --runway <runway>", "name of runway", runway)
    .option("-s, --airway <name>", "SID or STAR name", isLanding ? airportData.randomSTAR(runway) : airportData.randomSID(runway))
    .option("-p, --parking <parking>", "name of parking", airportData.randomParking())
    .option("-l, --landing", "Perform landing rather than takeoff", isLanding)
    .parse(process.argv)

debug.init(program.debug, [""])
debug.print(program.opts())


var airplane = program.landing ?
    simulator.land(airport, program.name, program.aircraft, program.parking, program.runway, program.airway, "PM999") :
    simulator.takeoff(airport, program.name, program.aircraft, program.parking, program.runway, program.airway, "PM001")

if (airplane) {
    fs.writeFileSync(program.output, JSON.stringify(geojson.FeatureCollection(airplane.getFeatures(true))), { mode: 0o644 })
    var fn = (program.landing ? "L-" : "T-") + program.aircraft + "-" + program.runway + "-" + program.airway + "-" + program.parking
    debug.print("wind: " + wind + "; " + program.name + (program.landing ? " landed " : " takeoff ") + program.aircraft + " on " + program.runway + " via " + program.airway + (program.landing ? " to " : " from ") + program.parking)
    debug.print(program.output + " written")
} else {
    debug.print(program.opts())
    debug.print("no file written")
}