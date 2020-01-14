const fs = require('fs')
const moment = require('moment')
const turf = require('@turf/turf')
const PathFinder = require('geojson-path-finder');
const geojsonTool = require('geojson-tools')

var program = require('commander')


// my stuff
const config = require('./sim-config')
const geojson = require('./geojson-structures')

program
    .version('1.0.0')
    .description('generates GeoJSON features for aircraft takeoff or landing')
    .option('-d, --debug', 'output extra debugging')
    .option('-o <file>, --output <file>', 'Save to file, default to out.json', "out.json")
    .requiredOption('-m, --aircraft <model>', 'aircraft model')
    .requiredOption('-r, --runway <runway>', 'name of runway')
    .requiredOption('-s, --airway <name>', 'SID or STAR name')
    .requiredOption('-p, --parking <parking>', 'name of parking')
    .option('-l, --landing', 'Perform landing rather than takeoff')
    .parse(process.argv)

debug(program.opts())

const NAUTICAL_MILE = 1852 // nautical mile

var airport = {}

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


airport.serviceroads.features.forEach(function(f) {
    if(f.geometry.type == "LineString")
        f.geometry.coordinates = geojsonTool.complexify(f.geometry.coordinates, 0.01); // 1=1 km. 0.01 = 10m (minimum)
});

airport.taxiways.features.forEach(function(f) {
    if(f.geometry.type == "LineString")
        f.geometry.coordinates = geojsonTool.complexify(f.geometry.coordinates, 0.01); // 1=1 km. 0.01 = 10m (minimum)
});



/* Produces debug based on program.debug option if it exist, otherwise constructor is supplied.
 * Function name must be part of valid list of functions to debug
 * Preceedes debug output with calling function name.
 */
function debug(...args) {
    //  const program = { "debug": true , "funcname": false }
    if (typeof(program) != "undefined" && program.debug) {
        const MAIN = "main()"
        var FUNCDEBUG = [
            "takeoff",
            "findFeature",
            "add_linestring",
            "", // always debug top-level
            MAIN // always debug functions with no name
        ]
        if (program.funcname)
            FUNCDEBUG.concat(program.funcname)
        var caller = debug.caller ? debug.caller : { "name": MAIN }

        if (FUNCDEBUG.indexOf(caller.name) >= 0)
            console.log(caller.name, args)
    }
}

function error(...args) {
    const caller = error.caller ? error.caller : { "name": "()" }
    console.log(caller.name, args)
}

function to_kmh(kn) {
    return kn * 1000 / NAUTICAL_MILE
}

function to_kn(km) {
    return kmh * NAUTICAL_MILE / 1000
}

function findAircraft(name) {
    return config.aircrafts[name]
}

function findFeature(name, fc, what) {
    var f = false
    var idx = 0
    while (!f && idx < fc.features.length) {
        if (fc.features[idx].properties && fc.features[idx].properties[what] && fc.features[idx].properties[what] == name)
            f = fc.features[idx]
        idx++
    }
    if (!f)
        debug("feature not found", name)
    return f
}


/* Find closest point to network of roads (FeatureCollectionof LineStrings)
 * Returns Point
 */
function findClosest(p, network) { // cache it as well in network structure
    if (typeof(network.mls) == "undefined") { // build suitable structure for nearestPointOnLine, cache it.
        network.mls = multilinestring(network)
    }
    return turf.nearestPointOnLine(network.mls, p)
}


/* Convert a FeatureCollection of LineString into a single MultiLineString geometry
 * as required for some turf functions.
 * Returns MultiLineString
 */
function multilinestring(fc) {
    var mls = []
    fc.features.forEach(function(f, idx) {
        if (f.geometry.type == "LineString")
            mls.push(f.geometry.coordinates)
    })
    return geojson.MultiLineString(mls)
}


/* Find route from p_from to p_to on network of roads.
 * Returns LineString or roads or direct path between the two points if no road found.
 */
function route(p_from, p_to, network) {
    // fs.writeFileSync('debug.json', JSON.stringify({"type":"FeatureCollection", "features": [p_from, p_to]}), { mode: 0o644 })
    const pathfinder = new PathFinder(network, {
        precision: 0.00005
    });

    const path = pathfinder.findPath(p_from, p_to);

    if (!path)
        debug("could not find route", p_from, p_to)

    return geojson.LineString(path ? path.path : [p_from, p_to])
}

function add_point(device, point, speed, wait) { // point = [lon, lat]
    debug(add_point.caller.name, geojson.coords(point))
    device.trip.push(geojson.coords(point))
    var c = device.trip.length - 1
    device.stops.push(geojson.Feature(geojson.Point(geojson.coords(point)), {
        "idx": c,
        "point": point.name ? point.name : null
    }))
    if (speed)
        device.speeds.push({ "idx": c, "speed": speed })
    if (wait)
        device.waits.push({ "idx": c, "pause": wait })
}

function add_linestring(device, trip, speed, wait) {
    debug("adding..")
    trip.forEach(function(p, idx) {
        add_point(device, p, speed, wait)
    })
    debug("..added")
}

/*
 * T A K E - O F F
 */
function takeoff(aircraft_model, parking_name, runway_name, sid_name) {
    var airplane = {
        "aircraft": aircraft_model,
        "trip": [],
        "stops": [],
        "speeds": [],
        "waits": [],
        "position": null
    }
    var p, p1, p2
    var p_name // point's name

    const aircraft = findAircraft(airplane.aircraft)
    if(!aircraft) {
        error("cannot find aircraft model", aircraft_model)
        return false
    } else
        debug("aircraft", aircraft)

    // first point is parking position
    const parking = findFeature(parking_name, airport.parkings, "ref")
    if (!parking) {
        debug("parking not found", parking_name)
        return false
    }
    aircraft.position = parking.geometry.coordinates

    // start of ls
    add_point(airplane, parking, 0, null)

    // pushback to "pushback lane"
    p = findClosest(parking, airport.taxiways)
    if (p) {
        add_point(airplane, p, 0, 60) // 60 seconds to detach tow pushback
    } else {
        error("cannot find pushback point", parking_name)
        return false
    }

    // route from pushback lane to taxiways
    p1 = findClosest(p, airport.taxiways)
    add_point(airplane, p1, 0, null) // 60 seconds to detach tow pushback

    // route to taxi hold position
    p_name = 'TH:' + runway_name
    p1 = findFeature(p_name, airport.taxiways, "name")
    p2 = findClosest(p1, airport.taxiways)

    if (p2) {
        var r = route(p, p2, airport.taxiways)
        add_linestring(airplane, r.coordinates, aircraft.taxi_speed, null)
        // move to taxi hold point
        var hold = config.airport["taxi-hold"]
        var takeoffhold_time = hold[0] + Math.round(Math.random() * Math.abs(hold[0]-hold[0])) // 0-120 sec hold before T.O.
        add_point(airplane, p1.geometry.coordinates, aircraft.taxi_speed, taxihold_time)
    } else {
        error("cannot find taxihold point", p_name)
        return false
    }

    // route to take-off hold position
    // from taxi-hold to taxiways
    add_point(airplane, p2, aircraft.taxi_speed, 0)
    p = p2
    p_name = 'TOH:' + runway_name
    p1 = findFeature(p_name, airport.taxiways, "name")
    p2 = findClosest(p1, airport.taxiways)

    if (p1) {
        var r = route(p, p2, airport.taxiways)
        add_linestring(airplane, r.coordinates, aircraft.taxi_speed, null)
        var hold = config.airport["takeoff-hold"]
        var takeoffhold_time = hold[0] + Math.round(Math.random() * Math.abs(hold[0]-hold[0])) // 0-120 sec hold before T.O.
        // move to take-off hold
        add_point(airplane, p1, aircraft.taxi_speed, takeoffhold_time)
    } else {
        error("cannot find take-off hold point", p_name)
        return false
    }

    // take-off: Accelerate from 0 to vr from take-off hold to take-off position
    p = p1
    p_name = 'TO:' + runway_name
    p = findFeature(p_name, airport.taxiways, "name")
    if (p) {
        add_point(airplane, p, aircraft.v2, null)
    } else {
        error("cannot find take-off point", p_name)
        return false
    }

    // route to SID start postion for runway direction
    p_name = 'SID:' + runway_name.substring(0, 2) // remove L or R, only keep heading
    p = findFeature(p_name, airport.airways, "name")
    if (p) {
        add_point(airplane, p, aircraft.climbspeed1, null)
    } else {
        error("cannot find SID start", p_name)
        return false
    }

    //@todo: acceleration to 250kn (and beyond if allowed)

    // SID
    p = findFeature("SID:" + sid_name, airport.airways, "name")
    if (p) { // @todo: Add line string?
        p.geometry.coordinates.forEach(function(c, idx) {
            add_point(airplane, c, null, null)
        })
    } else {
        error("cannot find SID", sid_name)
        return false
    }

    return airplane
}


/*
 * L A N D I N G
 */
function land(aircraft_model, parking_name, runway_name, star_name) {
    var airplane = {
        "aircraft": aircraft_model,
        "trip": [],
        "stops": [],
        "speeds": [],
        "waits": [],
        "position": null
    }
    var p, p1, p2
    var p_name // point's name

    const aircraft = findAircraft(airplane.aircraft)
    if(!aircraft) {
        error("cannot find aircraft model", aircraft_model)
        return false
    } else
        debug("aircraft", aircraft)

    p_name = 'STAR:' + star_name
    p = findFeature(p_name, airport.airways, "name")
    if (p) {
        var first = true
        p.geometry.coordinates.forEach(function(c, idx) {
            if(first) {
                first = false
                add_point(airplane, c, aircraft.vinitialdescend, null)
            } else
                add_point(airplane, c, null, null)
        })
    } else {
        error("cannot find START", p_name)
        return false
    }

    // add STAR rendez-vous (common to all runways)
    p_name = 'STAR:' + runway_name.substring(0, 2) // remove L or R, only keep heading
    p = findFeature(p_name, airport.airways, "name")
    if (p) {
        add_point(airplane, p, aircraft.vapproach, null)
    } else {
        error("cannot find SID start", p_name)
        return false
    }

    // final approach
    p_name = 'FINAL:' + runway_name
    p = findFeature(p_name, airport.airways, "name")
    if (p) {
        p.geometry.coordinates.forEach(function(c, idx) {
            add_point(airplane, c, null, null)
        })
    } else {
        error("cannot find final approach", p_name)
        return false
    }

    // touchdown
    p_name = 'TD:' + runway_name
    p = findFeature(p_name, airport.airways, "name")
    if (p) {
        add_point(airplane, p, aircraft.vlanding, null)
    } else {
        error("cannot find touch down", p_name)
        return false
    }

    // slow down to exit runway
    p_name = 'RX:' + runway_name
    p = findFeature(p_name, airport.airways, "name")
    if (p) {
        add_point(airplane, p, aircraft.taxispeed, null)
    } else {
        error("cannot find runway exit", p_name)
        return false
    }

    // taxi to parking
    // runway exit to taxiway
    p1 = findClosest(p, airport.taxiways)
    add_point(airplane, p1, aircraft.taxispeed, null)

    // taxi to close to parking
    const parking = findFeature(parking_name, airport.parkings, "ref")
    if (!parking) {
        debug("parking not found", parking_name)
        return false
    }
    p2 = findClosest(parking, airport.taxiways)

    var r = route(p1, p2, airport.taxiways)
    add_linestring(airplane, r.coordinates, aircraft.taxi_speed, null)


    // last point is parking position (from taxiway to parking position)
    add_point(airplane, parking, 0, null)

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
 land(program.aircraft, program.parking, program.runway, program.airway)
 :
 takeoff(program.aircraft, program.parking, program.runway, program.airway)

if ( airplane ) {
    var features = []
    features.push({
        "type": "Feature",
        "geometry": {
            "type": "LineString",
            "coordinates": airplane.trip
        },
        "properties": {
            "speedsAtVertices": airplane.speeds,
            "waitsAtVertices": airplane.waits
        }
    })

    if (airplane.stops.length > 0)
        features.concat(airplane.stops)

    fs.writeFileSync(program.O, JSON.stringify(geojson.FeatureCollection(features)), { mode: 0o644 })
    console.log(program.O + ' written')
} else {
    console.log('no file written')
}