const fs = require('fs')
const moment = require('moment')
const turf = require('@turf/turf')
const PathFinder = require('geojson-path-finder');
const geojsonTool = require('geojson-tools')
const config = require('./sim-config')

const geojson = require('./geojson-structures')

var program = require('commander')


const NAUTICAL_MILE = 1852 // nautical mile

program
    .version('1.0.0')
    .description('generates GeoJSON features for aircraft refueling')
    .option('-d, --debug', 'output extra debugging')
    .option('-o <file>, --output <file>', 'Save to file, default to out.json', "out.json")
    .parse(process.argv)

debug(program.opts())


var airport = {}

var jsonfile = fs.readFileSync(config.airport.parkings, 'utf8')
airport.parkings = JSON.parse(jsonfile)
airport.parkings.mlsname = "parking"

jsonfile = fs.readFileSync(config.airport.service, 'utf8')
airport.serviceroads = JSON.parse(jsonfile)
airport.serviceroads.mlsname = "serviceroads"

jsonfile = fs.readFileSync(config.airport.pois, 'utf8')
airport.pois = JSON.parse(jsonfile)
airport.pois.mlsname = "pois"


airport.serviceroads.features.forEach(function(f) {
    if(f.geometry.type == "LineString")
        f.geometry.coordinates = geojsonTool.complexify(f.geometry.coordinates, 0.01) // 1=1 km. 0.01 = 10m (minimum)
})

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
function findClosest(p, network) {
    if( typeof(p.nearestPointOnLine)=="undefined" || typeof(p.nearestPointOnLine[network.mlsname]) == "undefined") {
        p.nearestPointOnLine = p.nearestPointOnLine ? p.nearestPointOnLine : {}
        if( typeof(network.mls)=="undefined") { // build suitable structure for nearestPointOnLine, cache it.
            network.mls = multilinestring(network)
        }
        p.nearestPointOnLine[network.mlsname] = turf.nearestPointOnLine(network.mls, p)    
    } 
    return p.nearestPointOnLine[network.mlsname]
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
    // get to service_road
    var p = findClosest(truck.position, airport.serviceroads)
    add_point(truck, p, config.serviceTrucks.fuel.slow, 30) // move truck from where it is to service road

    // get closest point to fuel on serviceroad
    var p1 = findClosest(fuel, airport.serviceroads)
    //debug("closest to fuel", fuel, p1)

    // get to refill area
    var r = route(p, p1, airport.serviceroads)

    add_linestring(truck, r.coordinates, config.serviceTrucks.fuel.speed, null)
    // refill

    add_point(truck, fuel, 0, config.serviceTrucks.fuel.serviceTime(config.serviceTrucks.fuel.capacity - truck.load)) // move truck from serviceroad to refill station + refill
    truck.position = fuel.geometry.coordinates
    truck.load = config.serviceTrucks.fuel.capacity
}


function service(truck, service) {
    // get from truck position to service road, move there slowly
    var p = findClosest(truck.position, airport.serviceroads)
    //debug("closest to truck", truck.position, p)
    add_point(truck, p, config.serviceTrucks.fuel.slow, 30) // truck moves to serviceroad

    // get to parking on service road at full speed
    var parking = findFeature(service.parking, airport.parkings, "ref")
    debug(parking)
    if(! parking) {
        debug("not found", "ref", service.parking)
        return
    }
    var p1 = findClosest(parking, airport.serviceroads)
    //debug("closest to parking", parking, p1)

    var r = route(p, p1, airport.serviceroads)
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
    // at the end, truck goes safely back to refueling area for parking
    refill(truck, fuel1)
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


var plist = ["120","42C","L15","L17"]
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
