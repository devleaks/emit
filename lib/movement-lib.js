const fs = require('fs')
const turf = require('@turf/turf')

const PathFinder = require('geojson-path-finder');
const geojsonTool = require('geojson-tools')

const geojson = require('../lib/geojson-util')
const common = require('../lib/common')
const debug = require('../lib/debug.js')

const config = require('../sim-config')

debug.init(true, [""], "main")


exports.readAirport = function(config, dirbase = './') {

    var airport = config.airport ? config.airport : {}

    var jsonfile = fs.readFileSync(dirbase + config.airport.parkings, 'utf8')
    airport.parkings = JSON.parse(jsonfile)

    jsonfile = fs.readFileSync(dirbase + config.airport.service, 'utf8')
    airport.serviceroads = JSON.parse(jsonfile)

    jsonfile = fs.readFileSync(dirbase + config.airport.pois, 'utf8')
    airport.pois = JSON.parse(jsonfile)

    jsonfile = fs.readFileSync(dirbase + config.airport.taxiways, 'utf8')
    airport.taxiways = JSON.parse(jsonfile)
    airport.taxiways._network_name = "taxiways"

    jsonfile = fs.readFileSync(dirbase + config.airport.airways, 'utf8')
    airport.airways = JSON.parse(jsonfile)

    var METAR = false
    if (airport.metar) {
        jsonfile = fs.readFileSync(dirbase + airport.metar, 'utf8')
        airport.METAR = JSON.parse(jsonfile)
    }

    geojson.complexify(airport.serviceroads)
    geojson.complexify(airport.taxiways)

    return airport
}

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

    wind_int = Math.round((parseInt(wind) + 5) / 10)
    var wind_ret = (wind_int > wmin && wind_int < wmax) ? runway_alt_txt : runway_heading_txt
    debug.print(wind, runway_heading, runway_alt, wmin, wmax, wind_int, wind_ret)
    return wind_ret // (wind_int > wmin && wind_int < wmax) ? runway_alt_txt : runway_heading_txt
}

// try to build random values from airport data
exports.makeDefaults = function(config, airport) {
    var defaults = {}

    defaults.landing = (Math.random() > 0.5)
    defaults.runway = airport.runways.length > 1 ? airport.runways[Math.floor(Math.random() * airport.runways.length)] : airport.runways[0]
    defaults.wind = airport.METAR ? airport.METAR["wind_dir_degrees"][0] : Math.round(Math.random() * 360)
    defaults.runway_inuse = computeRunway(defaults.runway, defaults.wind, airport.runways.length)
    defaults.runway_heading = airport.runways.length > 1 ? defaults.runway_inuse.substring(0, 2) : defaults.runway_inuse
    defaults.approach_paths = defaults.landing ? airport.star : airport.sid
    defaults.approach_default = defaults.approach_paths[defaults.runway_heading]
    defaults.approach = defaults.approach_default[Math.floor(Math.random() * defaults.approach_default.length)]
    defaults.parking = airport.parkings.features[Math.floor(Math.random() * airport.parkings.features.length)]

    defaults.aircrafts = Object.keys(config.aircrafts)
    defaults.aircraft = defaults.aircrafts[Math.floor(Math.random() * defaults.aircrafts.length)]

    return defaults
}

function findAircraft(name) {
    return config.aircrafts[name]
}

/*
 * T A K E - O F F
 */
exports.takeoff = function(airport, aircraft_model, parking_name, runway_name, sid_name) {
    var airplane = new common.Device(aircraft_model + ":" + parking_name, { "aircraft": aircraft_model })
    var p, p1, p2
    var p_name // point's name
    var syncCount = 0

    const aircraft = findAircraft(airplane.getProp("aircraft"))
    if (!aircraft) {
        deug.error("cannot find aircraft model", aircraft_model)
        return false
    } else
        debug.print("aircraft", aircraft)

    // first point is parking position
    const parking = geojson.findFeature(parking_name, airport.parkings, "name")
    if (!parking) {
        debug.print("parking not found", parking_name)
        return false
    }

    // start of ls
    airplane.addPointToTrack(parking, 0, null)
    airplane.addMarker(parking, 0, null, "parking " + parking.properties.name, syncCount++)

    // pushback to "pushback lane"
    p = geojson.findClosest(parking, airport.taxiways)
    if (p) {
        airplane.addPointToTrack(p, 0, 60) // 60 seconds to detach tow pushback
    } else {
        deug.error("cannot find pushback point", parking_name)
        return false
    }

    // route from pushback lane to taxiways
    p1 = geojson.findClosest(p, airport.taxiways)
    airplane.addPointToTrack(p1, 0, null) // 60 seconds to detach tow pushback

    // route to taxi hold position
    p_name = 'TH:' + runway_name
    p1 = geojson.findFeature(p_name, airport.taxiways, "name")
    p2 = geojson.findClosest(p1, airport.taxiways)

    if (p2) {
        var r = geojson.route(p, p2, airport.taxiways)
        airplane.addPathToTrack(r.coordinates, common.to_kmh(aircraft.taxi_speed), null)
        // move to taxi hold point
        var hold = config.airport["taxi-hold"]
        var hold_time = hold[0] + Math.round(Math.random() * Math.abs(hold[1] - hold[0])) // 0-120 sec hold before T.O.
        airplane.addPointToTrack(p1.geometry.coordinates, common.to_kmh(aircraft.taxi_speed), hold_time)
        airplane.addMarker(p1, common.to_kmh(aircraft.taxi_speed), hold_time, p_name + "(hold: " + hold_time + ")", syncCount++)
    } else {
        deug.error("cannot find taxihold point", p_name)
        return false
    }

    // route to take-off hold position
    // from taxi-hold to taxiways
    airplane.addPointToTrack(p2, common.to_kmh(aircraft.taxi_speed), 0)
    p = p2
    p_name = 'TOH:' + runway_name
    p1 = geojson.findFeature(p_name, airport.taxiways, "name")
    p2 = geojson.findClosest(p1, airport.taxiways)

    if (p1) {
        var r = geojson.route(p, p2, airport.taxiways)
        airplane.addPathToTrack(r.coordinates, common.to_kmh(aircraft.taxi_speed), null)
        var hold = config.airport["takeoff-hold"]
        var hold_time = hold[0] + Math.round(Math.random() * Math.abs(hold[1] - hold[0])) // 0-120 sec hold before T.O.
        // move to take-off hold
        airplane.addPointToTrack(p1, common.to_kmh(aircraft.taxi_speed), hold_time)
        airplane.addMarker(p1, common.to_kmh(aircraft.taxi_speed), hold_time, p_name + "(hold: " + hold_time + ")", syncCount++)
    } else {
        deug.error("cannot find take-off hold point", p_name)
        return false
    }

    // take-off: Accelerate from 0 to vr from take-off hold to take-off position
    p = p1
    p_name = 'TO:' + runway_name
    p = geojson.findFeature(p_name, airport.taxiways, "name")
    if (p) {
        airplane.addPointToTrack(p, common.to_kmh(aircraft.v2), null)
        airplane.addMarker(p, common.to_kmh(aircraft.v2), null, p_name, syncCount++)
    } else {
        deug.error("cannot find take-off point", p_name)
        return false
    }

    // route to SID start postion for runway direction
    p_name = 'SID:' + runway_name.substring(0, 2) // remove L or R, only keep heading
    p = geojson.findFeature(p_name, airport.airways, "name")
    if (p) {
        airplane.addPointToTrack(p, common.to_kmh(aircraft.climbspeed1), 300)
        airplane.addMarker(p, common.to_kmh(aircraft.climbspeed1), null, p_name, syncCount++)
    } else {
        deug.error("cannot find SID start", p_name)
        return false
    }

    //@todo: acceleration to 250kn (and beyond if allowed)

    // SID
    p_name = "SID:" + sid_name
    p = geojson.findFeature(p_name, airport.airways, "name")
    var last = false
    if (p) { // @todo: Add line string?
        p.geometry.coordinates.forEach(function(c, idx) {
            if (idx == 2) { // simulates acceleration to 250kn
                airplane.addPointToTrack(c, aircraft.climbspeed2, null)
            } else if (idx == 4) { // simulate acceleration to cruse speed
                airplane.addPointToTrack(c, aircraft.climbspeed3, null)
            } else { // keep going
                airplane.addPointToTrack(c, null, null)
            }
            last = c
        })
    } else {
        deug.error("cannot find SID", sid_name)
        return false
    }
    // should add a point when leaving airspace?
    airplane.addMarker(last, null, null, p_name, syncCount++)

    return airplane
}


/*
 * L A N D I N G
 */
exports.land = function(airport, aircraft_model, parking_name, runway_name, star_name) {
    var airplane = new common.Device(aircraft_model + ":" + parking_name, { "aircraft": aircraft_model })
    var p, p1, p2
    var p_name // point's name
    var syncCount = 0

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
                airplane.addPointToTrack(c, common.to_kmh(aircraft.vinitialdescend), null)
                airplane.addMarker(c, common.to_kmh(aircraft.vinitialdescend), null, p_name, syncCount++)
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
        airplane.addPointToTrack(p, common.to_kmh(aircraft.vapproach), null)
        airplane.addMarker(p, common.to_kmh(aircraft.vapproach), null, p_name, syncCount++)
    } else {
        deug.error("cannot find STAR end", p_name)
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
        airplane.addPointToTrack(p, common.to_kmh(aircraft.vlanding), null)
        airplane.addMarker(p, common.to_kmh(aircraft.vlanding), null, p_name, syncCount++)
    } else {
        deug.error("cannot find touch down", p_name)
        return false
    }

    // slow down to exit runway
    p_name = 'RX:' + runway_name
    p = geojson.findFeature(p_name, airport.airways, "name")
    if (p) {
        airplane.addPointToTrack(p, common.to_kmh(aircraft.taxispeed), null)
        airplane.addMarker(p, common.to_kmh(aircraft.taxispeed), null, p_name, syncCount++)
    } else {
        deug.error("cannot find runway exit", p_name)
        return false
    }

    // taxi to parking
    // runway exit to taxiway
    p1 = geojson.findClosest(p, airport.taxiways)
    airplane.addPointToTrack(p1, common.to_kmh(aircraft.taxispeed), null)

    // taxi to close to parking
    const parking = geojson.findFeature(parking_name, airport.parkings, "name")
    if (!parking) {
        debug.print("parking not found", parking_name)
        return false
    }
    p2 = geojson.findClosest(parking, airport.taxiways)

    var r = geojson.route(p1, p2, airport.taxiways)
    airplane.addPathToTrack(r.coordinates, common.to_kmh(aircraft.taxi_speed), null)


    // last point is parking position (from taxiway to parking position)
    airplane.addPointToTrack(parking, 0, null)
    airplane.addMarker(parking, 0, null, parking_name, syncCount++)

    return airplane
}