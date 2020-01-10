const fs = require('fs')
const moment = require('moment')
const turf = require('@turf/turf')
const PathFinder = require('geojson-path-finder');
const geojsonTool = require('geojson-tools')
const config = require('./sim-config')

const geojson = require('./geojson-structures')

var program = require('commander')


const NAUTICAL_MILE = 1852 // nautical mile

var program = {
    "debug": true
}

var airport = {}

var jsonfile = fs.readFileSync(config.airport.parkings, 'utf8')
airport.parkings = JSON.parse(jsonfile)

jsonfile = fs.readFileSync(config.airport.service, 'utf8')
airport.serviceroads = JSON.parse(jsonfile)

jsonfile = fs.readFileSync(config.airport.pois, 'utf8')
airport.pois = JSON.parse(jsonfile)


airport.serviceroads.features.forEach(function(f) {
    f.geometry.coordinates = geojsonTool.complexify(f.geometry.coordinates, 0.01); // 1=1 km. 0.01 = 10m (minimum)
});

//fs.writeFileSync('segmented.json', JSON.stringify(airport.serviceroads), { mode: 0o644 })

/* Produces debug based on program.debug option if it exist, otherwise constructor is supplied.
 * Function name must be part of valid list of functions to debug
 * Preceedes debug output with calling function name.
 */
function debug(...args) {
//  const program = { "debug": true , "funcname": false }
    if (typeof(program) != "undefined" && program.debug) {
        const MAIN = "main()"
        var FUNCDEBUG = [
//            "fuel",
//            "route",
//            "refill",
//            "service",
            "add_point",
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



/*  Find feature such as fc.features[].properties.what == name
 *  Returns Feature
 */
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

/* Find closest point to network of roads (FeatureCollectionof LineStrings)
 * Returns Point
 */
function findClosest(p, network) { // cache it as well in network structure
    if( typeof(network.mls)=="undefined") { // build suitable structure for nearestPointOnLine, cache it.
        network.mls = multilinestring(network)
    }
    return turf.nearestPointOnLine(network.mls, p)    
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

    if(!path)
        debug("could not find route", p_from, p_to)

    return geojson.LineString( path ? path.path : [p_from, p_to] )
}

/*
 * Service functional function
 */
/* Refill: Move truck from its position to refueling station (fuel)
 * Augment truck trip line string.
 * Return nothing.
 */
function refill(truck, fuel) {
    debug("searching...", truck.position)
    // get to service_road
    var p = findClosest(truck.position, airport.serviceroads)
    add_point(truck, p, config.serviceTrucks.fuel.slow, 30)
    // get to refill area
    var r = route(p, fuel, airport.serviceroads) // assumes fuel1 is on service road...
    add_linestring(truck, r.coordinates, config.serviceTrucks.fuel.speed, null)
    // refill
    add_point(truck, fuel, 0, config.serviceTrucks.fuel.serviceTime(config.serviceTrucks.fuel.capacity - truck.load))
    truck.position = fuel.geometry.coordinates
    truck.load = config.serviceTrucks.fuel.capacity
}


function service(truck, service) {
    debug("searching...", truck.position)
    // get from truck position to service road, move there slowly
    var p = findClosest(truck.position, airport.serviceroads)
    //debug("closest to truck", truck.position, p)
    add_point(truck, p, config.serviceTrucks.fuel.slow, 30)

    // get to parking on service road at full speed
    var parking = findFeature(service.parking, airport.parkings, "ref")
    debug(parking)
    if(! parking) {
        debug("not found", "ref", service.parking)
        return
    }
    var p1 = findClosest(parking, airport.serviceroads)
    //debug("closest to parking", parking, p1)

    var r = route(p1, p, airport.serviceroads)
    if(r)
        add_linestring(truck, r.coordinates, config.serviceTrucks.fuel.speed, null)
    else
        debug("route not found", p, p1)

    // get from service road to parking slowly and service plane
    // service
    add_point(truck, parking, config.serviceTrucks.fuel.slow, config.serviceTrucks.fuel.serviceTime(service.load))
    truck.load -= service.load
    truck.position = parking.geometry.coordinates
}

/* Hook to place your fuel truck delivery optimization function. Called after each service.
 * The first array element will be poped out of the returning array.
 */
function optimize(truck, services) {
    return services
}

/* Build truck line string
 *
 */
function add_stop(truck, point, speed, wait, note) { // point = [lon, lat]
    point.properties = point.properties ? point.properties : {}
    point.properties.speed = speed
    point.properties.wait = wait
    point.properties.note = note
    truck.stops.push(point)
}

function add_point(truck, point, speed, wait) { // point = [lon, lat]
    debug(point, point.geometry, geojson.coords(point))
    truck.trip.push(geojson.coords(point))
    var c = truck.trip.length - 1
    if (speed)
        truck.speeds.push({"idx": c, "speed": speed})
    if (wait)
        truck.waits.push({"idx": c, "pause": wait})
}

function add_linestring(truck, trip, speed, wait) {
    debug("adding..")
  trip.forEach(function(p, idx) {
    add_point(truck, p, speed, wait)
  })
    debug("..added")
}



/*
 * R E F U E L
 */
function fuel(truck, services) {
    // init truck, set start position & load
    const fuel1 = findFeature("FUEL1", airport.pois, "name")
    truck.position = fuel1.geometry.coordinates
    // start with full, comment out to start with empty truck
    truck.load = config.serviceTrucks.fuel.capacity

    while( p = services.pop() ) {
        debug("doing..", p)
        if(p.load > truck.load) {
            refill(truck, fuel1)
        }
        service(truck, p)
        services = optimize(truck, services)
        debug("..done")
    }
}


var truck = {
    "name": "Fuel truck 1",
    "load": 0,
    "trip": [],
    "stops": [],
    "speeds": [],
    "waits": [],
    "position": null
}

var services = []
services.push({"parking": '51', "load": 25000, "time": null, "priority": 3})
services.push({"parking": '46', "load": 10000, "time": null, "priority": 3})
services.push({"parking": '112', "load": 10000, "time": null, "priority": 3})
services.push({"parking": 'G3', "load": 10000, "time": null, "priority": 3})


var plist = ["120","42C","L15","L17","G2","G5","20","62","40","40C","26","2","54","54","50","63","K12","40A","118","42","59","45","K11","58","29D","L16","42B","46","G3","29"]
plist.forEach(function (n) {
    services.push({"parking": n, "load": 16000, "time": null, "priority": 3})
})


fuel(truck, services)

var features = []
features.push({
    "type":"Feature",
    "geometry": {
        "type": "LineString",
        "coordinates": truck.trip
    },
    "properties": {
        "speedsAtVertices": truck.speeds,
        "waitsAtVertices": truck.waits
    }
})

if(truck.stops.length > 0)
    features.push(truck.stops)

fs.writeFileSync('out.json', JSON.stringify(geojson.FeatureCollection(features)), { mode: 0o644 })
debug('out.json written')
