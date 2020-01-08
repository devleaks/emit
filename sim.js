const fs = require('fs')
const moment = require('moment')
const turf = require('@turf/turf')
const PathFinder = require('geojson-path-finder');

const config = require('./sim-config')

var program = require('commander')


const NAUTICAL_MILE = 1852 // nautical mile

var program = {
    "debug": true
}

var jsonfile = fs.readFileSync(config.airport.parkings, 'utf8')
const parkings = JSON.parse(jsonfile)

jsonfile = fs.readFileSync(config.airport.taxiways, 'utf8')
const taxiways = JSON.parse(jsonfile)

jsonfile = fs.readFileSync(config.airport.airways, 'utf8')
const airways = JSON.parse(jsonfile)

jsonfile = fs.readFileSync(config.airport.file, 'utf8')
const airport = JSON.parse(jsonfile)


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
            "findPushback",
            "", // always debug top-level
            MAIN// always debug functions with no name
        ]
        if(program.funcname)
            FUNCDEBUG.concat(program.funcname)
        var caller = debug.caller ? debug.caller : {"name": MAIN}

        if (FUNCDEBUG.indexOf(caller.name) >= 0)
            console.log(caller.name, args)
    }
}



function to_kmh(kn) {
    return kn * 1000 / NAUTICAL_MILE
}

function to_kn(km) {
    return kmh * NAUTICAL_MILE / 1000
}

function findAircraft(name) {
    const plane = config.airplanes[name]
    return config.aircrafts[plane.model]
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

function findPushback(f) {
    if (f.properties && f.properties.ID_Apron_z) {
        var apron_id = f.properties.ID_Apron_z
        var ls = findFeature("B" + apron_id, airport, "name") // name like "PB:n", PB=Pushback, n=Apron Identifier
        if (!ls) {
            debug('cannot find pushback for APRON', apron_id)
            return false
        }
        return turf.nearestPointOnLine(ls, f)
    }
    return false
}

function route(from, to, network) {
    const pathfinder = new PathFinder(network, {
        precision: 0.00005,
        weightFn: function(a, b, props) {
            var dx = a[0] - b[0];
            var dy = a[1] - b[1];
            var d = Math.sqrt(dx * dx + dy * dy);
            if (props && props.name && props.name.indexOf('LT_') == 0 && props.direction) { // Landing track, only goes in one direction
                return props.direction == 1 ? { forward: d, backward: null } : { forward: null, backward: d };
            }
            return d;
        }
    });

    const path = pathfinder.findPath(from, to);

    return path ? {
        geometry: {
            type: "LineString",
            coordinates: path.path
        }
    } : false
}

// convert a FeatureCollection of LineString into a single MultiLineString geometry
// as required for some turf functions.
function multilinestring(fc) {
    var mls = []
    fc.features.forEach(function(f, idx) {
        if (f.geometry.type == "LineString")
            mls.push(f.geometry.coordinates)
    })
    return {
        "type": "MultiLineString",
        "coordinates": mls
    }
}

/*
 * T A K E - O F F
 */
function takeoff(airplane_name, parking_name, runway_name, sid_name, datetime) {
    var ls = []
    var speeds = []
    var waits = []
    var counter = 0 // ls point counter
    var p_name // next point's name
    var p // next point

    function add_point(point, speed, wait) {
        ls.push(point)
        if (speed)
            speeds[counter] = speed
        if (wait)
            waits[counter] = wait
        counter++
    }

    function add_linestring(ls, speed, wait) {
      ls.forEach(function(p, idx) {
        add_point(p, speed, wait)
      })
    }

    const aircraft = findAircraft(airplane_name)
    debug("aircraft", aircraft)

    // first point is parking position
    const parking = findFeature(parking_name, parkings, "ID_Parking")
    if (!parking) {
        debug("parking not found", parking_name)
        return false
    }
    // start of ls
    add_point(parking.geometry.coordinates, 0, null)

    // pushback to "pushback lane"
    p = findPushback(parking)
    if (p) {
        add_point(p, 0, 60) // 60 seconds to detach tow pushback
    } else {
        debug("cannot find pushback point", parking_name)
        return false
    }

    // route from pushback lane to taxiways
    var tw = multilinestring(taxiways)
    p = turf.nearestPointOnLine(tw, p)
    add_point(p, 0, null) // 60 seconds to detach tow pushback

    // route to taxi hold position
    p_name = 'TH:' + runway_name
    var p1 = findFeature(p_name, taxiways, "name")


    if (p1) {
        var r = route(p, p1, taxiways)
        if(r) {
          add_linestring(r.coordinates, aircraft.taxi_speed, null)
          var taxihold_time = Math.round(Math.random() * 120) // 0-120 sec hold before T.O.
          add_point(p1, aircraft.taxi_speed, taxihold_time)
        } else {
          debug("cannot find taxi route from pushback to taxi hold ", p_name)
          return false
        }
    } else {
        debug("cannot find taxihold point", p_name)
        return false
    }

    // route to take-off hold position
    p = p1
    p_name = 'TOH:' + runway_name
    p1 = findFeature(p_name, taxiways, "name")
    if (p1) {
        var r = route(p, p1, taxiways)
        if(r) {
          add_linestring(r.coordinates, aircraft.taxi_speed, null)
          var takeoffhold_time = Math.round(Math.random() * 60) // 0-120 sec hold before T.O.
          add_point(p, aircraft.taxi_speed, takeoffhold_time)
        } else {
          debug("cannot find taxi route from taxi hold to take-off hold ", p_name)
          return false
        }
    } else {
        debug("cannot find take-off hold point", p_name)
        return false
    }

    // take-off: Accelerate from 0 to vr from take-off hold to take-off position
    p_name = 'TO:' + runway_name
    p = findFeature(p_name, taxiways, "name")
    if (p) {
        add_point(p, aircraft.v2, null)
    } else {
        debug("cannot find take-off point", p_name)
        return false
    }

    // route to SID start postion for runway direction
    p_name = 'SID:' + runway_name.substring(0, 1) // remove L or R, only keep heading
    p = findFeature(p_name, taxiways, "name")
    if (p) {
        add_point(p, aircraft.climbspeed1, null)
    } else {
        debug("cannot find SID merge point", p_name)
        return false
    }

    //@todo: acceleration to 250kn (and beyond if allowed)

    // SID
    var sid = findFeature(sid_name, airport, "name")
    if (p) {
        sid.geometry.coordinates.forEach(function(c, idx) {
            add_point(c, null, null)
        })
    } else {
        debug("cannot find SID", sid_name)
        return false
    }

    return {
        "type": "Feature",
        "geometry": {
            "type": "LineString",
            "geometry": ls,
            "properties": {
                "speedsAtVertices": speeds,
                "waitsAtVertices": waits
            }
        }
    }
}


/*
 * L A N D I N G
 */
function land(aircraft_name, parking_name, runway_name, sid_name, datetime) {

}

var f = takeoff("OO810", "51", "22L", "CIV5S", moment().toISOString())
// var f = land("OO810", "51", "22L", "CIV5S", moment().toISOString())
if (f) {
    fs.writeFileSync('out.json', JSON.stringify(f), { mode: 0o644 })
    console.log('out.json written')
} else {
    console.log('no file written')
}