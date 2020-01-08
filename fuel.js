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
var parkings = JSON.parse(jsonfile)

var jsonfile = fs.readFileSync(config.airport.parkings, 'utf8')
var serviceroads = JSON.parse(jsonfile)

jsonfile = fs.readFileSync(config.airport.pois, 'utf8')
var airport = JSON.parse(jsonfile)


/* Produces debug based on program.debug option if it exist, otherwise constructor is supplied.
 * Function name must be part of valid list of functions to debug
 * Preceedes debug output with calling function name.
 */
function debug(...args) {
//  const program = { "debug": true , "funcname": false }
    if (typeof(program) != "undefined" && program.debug) {
        const MAIN = "main()"
        var FUNCDEBUG = [
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

function findClosest(p, network) { // cache it as well in network structure
    if(! network.mls)
        network.mls = multilinestring(network)
    return turf.nearestPointOnLine(network.mls, p)    
}

function route(p_from, p_to, network) {
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

    const path = pathfinder.findPath(p_from, p_to);

    return path ? {
        geometry: {
            type: "LineString",
            coordinates: path.path
        }
    } : false
}

const FUELTRUCK = {
    "full": 30000,
    "speed": 40,
    "slow": 20,
    "timetoload": 100
}

function normalise(f) {
    return (f.type == "Feature") ? f : {
        "type": "Feature",
        "geometry": f
    }
}

function refill(truck) {
    // get to service_road
    var p = findClosest(truck.position, service_roads)
    add_point(p, FUELTRUCK.slow, 30)
    // get to refill area
    var r = route(p, fuel, serviceroads) // assumes fuel1 is on service road...
    add_linestring(r.coordinates, FUELTRUCK.speed, null)
    // refill
    add_point(fuel, 0, (FUELTRUCK.speed - truck.load)/FUELTRUCK.timetoload)
    truck.position = fuel
    truck.load = FUELTRUCK.full
}

function service(truck, service) {
    // go to p
    // leave current position
    var p = findClosest(truck.position, serviceroads)
    add_point(p, FUELTRUCK.slow, 30)
    // get to parking
    var p1 = findClosest(service.parking, serviceroads)
    var r = route(p, p1, serviceroads)
    add_linestring(r.coordinates, FUELTRUCK.speed, null)
    // service
    add_point(service.parking, FUELTRUCK.slow, service.load / FUELTRUCK.timetoload)
    truck.load -= service.load
    truck.position = service.parking
}

function optimize(services) {
    return services
}

/*
 *
 */
var trip = []   // line string coordinates (only)
var speeds = [] // {idx: 3, speed: 20} km/h
var waits = []  // {idx: 3, pause: 60} seconds

function add_point(point, speed, wait) { // point = [lon, lat]
    trip.push(point)
    var c = trip.length - 1
    if (speed)
        speeds[c] = speed
    if (wait)
        waits[c] = wait
}

function add_linestring(ls, speed, wait) {
  ls.forEach(function(p, idx) {
    add_point(p, speed, wait)
  })
}



/*
 * R E F U E L
 */
function fuel(services) {
    const fuel1 = findFeature("FUEL1", airport, "name")
    var truck = {
        "name": "Fuel truck 1",
        "load": FUELTRUCK.full,
        "position": fuel1.coordinates
    }

    while( p = services.pop() ) {
        debug("doing..", p)
        if(p.need > truck.load) {
            refill(truck)
        }
        service(truck, p)
        services = optimize(services)
        debug("..done")
    }


}

var services = []
services.push({"position": '51', "load": 15000, "time": null, "priority": 3})

fuel(services)

fs.writeFileSync('out.json', JSON.stringify({
    "type":"Feature",
    "geometry": {
        "type": "LineString",
        "coordinates": trip
    }
}), { mode: 0o644 })
debug('out.json written')