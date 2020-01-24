const fs = require('fs')
const moment = require('moment')
const turf = require('@turf/turf')

var program = require('commander')

const PathFinder = require('geojson-path-finder');
const geojsonTool = require('geojson-tools')

const config = require('./sim-config')
const geojson = require('./geojson-util')
const common = require('./common')
const debug = require('./debug.js')


debug.init(true, [""], "main")

var airport = config.airport ? config.airport : {}

var jsonfile = fs.readFileSync(config.airport.parkings, 'utf8')
airport.parkings = JSON.parse(jsonfile)

jsonfile = fs.readFileSync(config.airport.service, 'utf8')
airport.serviceroads = JSON.parse(jsonfile)

jsonfile = fs.readFileSync(config.airport.pois, 'utf8')
airport.pois = JSON.parse(jsonfile)

jsonfile = fs.readFileSync(config.airport.taxiways, 'utf8')
airport.taxiways = JSON.parse(jsonfile)

jsonfile = fs.readFileSync(config.airport.airways, 'utf8')
airport.airways = JSON.parse(jsonfile)

var METAR = false
if (airport.metar) {
    jsonfile = fs.readFileSync(airport.metar, 'utf8')
    METAR = JSON.parse(jsonfile)
}


airport.serviceroads.features.forEach(function(f) {
    if (f.geometry.type == "LineString")
        f.geometry.coordinates = geojsonTool.complexify(f.geometry.coordinates, 0.01); // 1=1 km. 0.01 = 10m (minimum)
});

airport.taxiways.features.forEach(function(f) {
    if (f.geometry.type == "LineString")
        f.geometry.coordinates = geojsonTool.complexify(f.geometry.coordinates, 0.01); // 1=1 km. 0.01 = 10m (minimum)
});

/* Compute runway in use from list of runways and wind direction (in degrees). If tied, default is selected.
 * Returns runway in use.
 *
 */
function computeRunway(runways, wind, rwys, dft = 0) {
    const r0 = rwys > 1 ? runways[0].substring(0, 2) : runways[0]
    const r1 = rwys > 1 ? runways[1].substring(0, 2) : runways[1]
    const runway_heading = r0 < r1 ? r0 : r1 // keep the smallest heading value
    const runway_alt = r0 < r1 ? r1 : r0 // keep the smallest heading value

    const runway_heading_txt = r0 < r1 ? runways[0] : runways[1] // keep the smallest heading value
    const runway_alt_txt = r0 < r1 ? runways[1] : runways[0] // keep the smallest heading value

    var wmin = runway_heading - 9
    if (wmin < 0) wmin += 36
    var wmax = runway_heading + 9
    if (wmax > 36) wmax -= 36

    if (wmin > wmax) { // switch them
        var t = wmax
        wmax = wmin
        wmin = t
    }

    wind_int = Math.round((wind + 5) / 10)
    return (wind_int > wmin && wind_int < wmax) ? runway_alt_txt : runway_heading_txt
}

// try to build random values from airport data

const landing = (Math.random() > 0.5)
const runway = airport.runways.length > 1 ? airport.runways[Math.floor(Math.random() * airport.runways.length)] : airport.runways[0]
const wind = METAR ? METAR["wind_dir_degrees"] : Math.round(Math.random()*360)
const runway_inuse = computeRunway(runway, wind, airport.runways.length)
const runway_heading = airport.runways.length > 1 ? runway_inuse.substring(0, 2) : runway_inuse
const approach_paths = landing ? airport.star : airport.sid
const approach_default = approach_paths[runway_heading]
const approach = approach_default[Math.floor(Math.random() * approach_default.length)]
const parking = airport.parkings.features[Math.floor(Math.random() * airport.parkings.features.length)]

const aircrafts = Object.keys(config.aircrafts)
const aircraft = aircrafts[Math.floor(Math.random() * aircrafts.length)]

program
    .version('1.0.0')
    .description('generates GeoJSON features for aircraft takeoff or landing')
    .option('-d, --debug', 'output extra debugging')
    .option('-o <file>, --output <file>', 'Save to file, default to out.json', "out.json")
    .option('-m, --aircraft <model>', 'aircraft model', aircraft)
    .option('-r, --runway <runway>', 'name of runway', runway_inuse)
    .option('-s, --airway <name>', 'SID or STAR name', approach)
    .option('-p, --parking <parking>', 'name of parking', parking.properties.ref)
    .option('-l, --landing', 'Perform landing rather than takeoff', landing)
    .option('-w, --wind <wind>', 'Wind direction in degrees', wind)
    .parse(process.argv)

debug.print(program.opts())

const NAUTICAL_MILE = 1.852 // nautical mile in meters

function to_kmh(kn) {
    return kn / NAUTICAL_MILE
}

function to_kn(km) {
    return kmh * NAUTICAL_MILE
}

function findAircraft(name) {
    return config.aircrafts[name]
}

/* Find closest point to network of roads (FeatureCollectionof LineStrings)
 * Returns Point
 */
function findClosest(p, network) {
    if (typeof(p.nearestPointOnLine) == "undefined" || typeof(p.nearestPointOnLine[network._network_name]) == "undefined") {
        p.nearestPointOnLine = p.nearestPointOnLine ? p.nearestPointOnLine : {}
        if (typeof(network.mls) == "undefined") { // build suitable structure for nearestPointOnLine, cache it.
            network.mls = geojson.multilinestring(network)
        }
        p.nearestPointOnLine[network._network_name] = turf.nearestPointOnLine(network.mls, p)
    }
    return p.nearestPointOnLine[network._network_name]
}


/* Find route from p_from to p_to on network of roads.
 * Returns LineString or roads or direct path between the two points if no road found.
 */
function route(p_from, p_to, network) {
    // fs.writeFileSync('debug.json', JSON.stringify({"type":"FeatureCollection", "features": [p_from, p_to]}), { mode: 0o644 })
    const pathfinder = new PathFinder(network, {
        precision: 0.0005
    });

    const path = pathfinder.findPath(p_from, p_to);

    if (!path)
        debug.print("could not find route", p_from, p_to)

    return geojson.LineString(path ? path.path : [p_from, p_to])
}


/*
 * T A K E - O F F
 */
function takeoff(aircraft_model, parking_name, runway_name, sid_name) {
    var airplane = new common.Device(aircraft_model+":"+parking_name, {"aircraft": aircraft_model})
    var p, p1, p2
    var p_name // point's name

    const aircraft = findAircraft(airplane.getProp("aircraft"))
    if (!aircraft) {
        deug.error("cannot find aircraft model", aircraft_model)
        return false
    } else
        debug.print("aircraft", aircraft)

    // first point is parking position
    const parking = geojson.findFeature(parking_name, airport.parkings, "ref")
    if (!parking) {
        debug.print("parking not found", parking_name)
        return false
    }

    // start of ls
    airplane.addPointToTrack(parking, 0, null)

    // pushback to "pushback lane"
    p = findClosest(parking, airport.taxiways)
    if (p) {
        airplane.addPointToTrack(p, 0, 60) // 60 seconds to detach tow pushback
    } else {
        deug.error("cannot find pushback point", parking_name)
        return false
    }

    // route from pushback lane to taxiways
    p1 = findClosest(p, airport.taxiways)
    airplane.addPointToTrack(p1, 0, null) // 60 seconds to detach tow pushback

    // route to taxi hold position
    p_name = 'TH:' + runway_name
    p1 = geojson.findFeature(p_name, airport.taxiways, "name")
    p2 = findClosest(p1, airport.taxiways)

    if (p2) {
        var r = route(p, p2, airport.taxiways)
        airplane.addPathToTrack(r.coordinates, to_kmh(aircraft.taxi_speed), null)
        // move to taxi hold point
        var hold = config.airport["taxi-hold"]
        var takeoffhold_time = hold[0] + Math.round(Math.random() * Math.abs(hold[0] - hold[0])) // 0-120 sec hold before T.O.
        airplane.addPointToTrack(p1.geometry.coordinates, to_kmh(aircraft.taxi_speed), takeoffhold_time)
    } else {
        deug.error("cannot find taxihold point", p_name)
        return false
    }

    // route to take-off hold position
    // from taxi-hold to taxiways
    airplane.addPointToTrack(p2, to_kmh(aircraft.taxi_speed), 0)
    p = p2
    p_name = 'TOH:' + runway_name
    p1 = geojson.findFeature(p_name, airport.taxiways, "name")
    p2 = findClosest(p1, airport.taxiways)

    if (p1) {
        var r = route(p, p2, airport.taxiways)
        airplane.addPathToTrack(r.coordinates, to_kmh(aircraft.taxi_speed), null)
        var hold = config.airport["takeoff-hold"]
        var takeoffhold_time = hold[0] + Math.round(Math.random() * Math.abs(hold[0] - hold[0])) // 0-120 sec hold before T.O.
        // move to take-off hold
        airplane.addPointToTrack(p1, to_kmh(aircraft.taxi_speed), takeoffhold_time)
    } else {
        deug.error("cannot find take-off hold point", p_name)
        return false
    }

    // take-off: Accelerate from 0 to vr from take-off hold to take-off position
    p = p1
    p_name = 'TO:' + runway_name
    p = geojson.findFeature(p_name, airport.taxiways, "name")
    if (p) {
        airplane.addPointToTrack(p, to_kmh(aircraft.v2), null)
    } else {
        deug.error("cannot find take-off point", p_name)
        return false
    }

    // route to SID start postion for runway direction
    p_name = 'SID:' + runway_name.substring(0, 2) // remove L or R, only keep heading
    p = geojson.findFeature(p_name, airport.airways, "name")
    if (p) {
        airplane.addPointToTrack(p, to_kmh(aircraft.climbspeed1), null)
    } else {
        deug.error("cannot find SID start", p_name)
        return false
    }

    //@todo: acceleration to 250kn (and beyond if allowed)

    // SID
    p = geojson.findFeature("SID:" + sid_name, airport.airways, "name")
    if (p) { // @todo: Add line string?
        p.geometry.coordinates.forEach(function(c, idx) {
            airplane.addPointToTrack(c, null, null)
        })
    } else {
        deug.error("cannot find SID", sid_name)
        return false
    }

    return airplane
}


/*
 * L A N D I N G
 */
function land(aircraft_model, parking_name, runway_name, star_name) {
    var airplane = new common.Device(aircraft_model+":"+parking_name, {"aircraft": aircraft_model})

    var p, p1, p2
    var p_name // point's name

    const aircraft = findAircraft(airplane.getProp("aircraft"))
    if (!aircraft) {
        deug.error("cannot find aircraft model", aircraft_model)
        return false
    } else
        debug.print("aircraft", aircraft)

    p_name = 'STAR:' + star_name
    p = geojson.findFeature(p_name, airport.airways, "name")
    if (p) {
        var first = true
        p.geometry.coordinates.forEach(function(c, idx) {
            if (first) {
                first = false
                airplane.addPointToTrack(c, to_kmh(aircraft.vinitialdescend), null)
            } else
                airplane.addPointToTrack(c, null, null)
        })
    } else {
        deug.error("cannot find START", p_name)
        return false
    }

    // add STAR rendez-vous (common to all runways)
    p_name = 'STAR:' + runway_name.substring(0, 2) // remove L or R, only keep heading
    p = geojson.findFeature(p_name, airport.airways, "name")
    if (p) {
        airplane.addPointToTrack(p, to_kmh(aircraft.vapproach), null)
    } else {
        deug.error("cannot find SID start", p_name)
        return false
    }

    // final approach
    p_name = 'FINAL:' + runway_name
    p = geojson.findFeature(p_name, airport.airways, "name")
    if (p) {
        p.geometry.coordinates.forEach(function(c, idx) {
            airplane.addPointToTrack(c, null, null)
        })
    } else {
        deug.error("cannot find final approach", p_name)
        return false
    }

    // touchdown
    p_name = 'TD:' + runway_name
    p = geojson.findFeature(p_name, airport.airways, "name")
    if (p) {
        airplane.addPointToTrack(p, to_kmh(aircraft.vlanding), null)
    } else {
        deug.error("cannot find touch down", p_name)
        return false
    }

    // slow down to exit runway
    p_name = 'RX:' + runway_name
    p = geojson.findFeature(p_name, airport.airways, "name")
    if (p) {
        airplane.addPointToTrack(p, to_kmh(aircraft.taxispeed), null)
    } else {
        deug.error("cannot find runway exit", p_name)
        return false
    }

    // taxi to parking
    // runway exit to taxiway
    p1 = findClosest(p, airport.taxiways)
    airplane.addPointToTrack(p1, to_kmh(aircraft.taxispeed), null)

    // taxi to close to parking
    const parking = geojson.findFeature(parking_name, airport.parkings, "ref")
    if (!parking) {
        debug.print("parking not found", parking_name)
        return false
    }
    p2 = findClosest(parking, airport.taxiways)

    var r = route(p1, p2, airport.taxiways)
    airplane.addPathToTrack(r.coordinates, to_kmh(aircraft.taxi_speed), null)


    // last point is parking position (from taxiway to parking position)
    airplane.addPointToTrack(parking, 0, null)

    return airplane
}

/* tests date for EBLG
    "sid": {
        "04": [
            "BUB7R",
            "CIV3R",
            "LNO8R"
        ],
        "22": [
            "BUB7S",
            "CIV3S",
            "LNO5E",
            "LNO7S"
        ]
    },
    "star": {
        "04": [
            "LNO4D",
            "GESLO4D",
            "CIV5D",
            "KOK5D",
            "NIK5D"
        ],
        "22": [
            "LNO4X",
            "GESLO4X",
            "CIV5X",
            "KOK5X",
            "NIK5X"
        ]
    }
*/
var airplane = program.landing ?
    land(program.aircraft, program.parking, program.runway, program.airway) :
    takeoff(program.aircraft, program.parking, program.runway, program.airway)

if (airplane) {
    fs.writeFileSync(program.O, JSON.stringify(geojson.FeatureCollection(airplane.getFeatures())), { mode: 0o644 })
    var fn = (program.landing ? "L-" : "T-") + program.aircraft + "-" + program.runway + "-" + program.airway + "-" + program.parking
    console.log("wind: " + program.wind + ": " + (program.landing ? "landed " : "takeoff ") + program.aircraft + " on " + program.runway + " via " + program.airway + (program.landing ? " to " : " from ") + program.parking)
    console.log(program.O + ' written')
} else {
    console.log(program.opts())
    console.log('no file written')
}