const fs = require('fs')
const simulator = require('./lib/movement-lib.js')

var program = require('commander')

const PathFinder = require('geojson-path-finder');
const geojsonTool = require('geojson-tools')

const geojson = require('./lib/geojson-util')
const debug = require('./lib/debug')

const config = require('./sim-config')
const airportData = require('./lib/airport.js')
const aircraftData = require('./lib/aircraft')

debug.init(true, [""], "main")

var airport = airportData.init(config)
var aircraft = aircraftData.init(config.aircrafts)

const wind = airport.METAR ? airport.METAR["wind_dir_degrees"][0] : Math.round(Math.random() * 360)
const isLanding = (Math.random() > 0.5)
const runway = airportData.randomRunway(wind)

program
    .version('2.1.0')
    .description('generates GeoJSON features for one aircraft takeoff or landing')
    .option('-d, --debug', 'output extra debugging')
    .option('-o, --output <file>', 'Save to file, default to out.json', "out.json")
    .option('-m, --aircraft <model>', 'aircraft model', aircraftData.randomAircraft())
    .option('-r, --runway <runway>', 'name of runway', runway)
    .option('-s, --airway <name>', 'SID or STAR name', isLanding ? airportData.randomSTAR(runway) : airportData.randomSID(runway))
    .option('-p, --parking <parking>', 'name of parking', airportData.randomParking())
    .option('-l, --landing', 'Perform landing rather than takeoff', isLanding)
    .parse(process.argv)

debug.init(program.debug, [""], "main")
debug.print(program.opts())


var airplane = program.landing ?
    simulator.land(airport, program.aircraft, program.parking, program.runway, program.airway) :
    simulator.takeoff(airport, program.aircraft, program.parking, program.runway, program.airway)

if (airplane) {
    fs.writeFileSync(program.output, JSON.stringify(geojson.FeatureCollection(airplane.getFeatures(true))), { mode: 0o644 })
    var fn = (program.landing ? "L-" : "T-") + program.aircraft + "-" + program.runway + "-" + program.airway + "-" + program.parking
    console.log("wind: " + wind + ": " + (program.landing ? "landed " : "takeoff ") + program.aircraft + " on " + program.runway + " via " + program.airway + (program.landing ? " to " : " from ") + program.parking)
    console.log(program.output + ' written')
} else {
    console.log(program.opts())
    console.log('no file written')
}