import * as geojson from "./geojson-util.js";
import * as aircraftData from "./aircraft.js";
import * as vehicle from "./device.js";
import * as debug from "./debug.js";
import * as config from "../data/sim-config.js";

debug.init(true, ["", "takeoff"])

// eslint-disable-next-line no-unused-vars
var _aircrafts = aircraftData.init(config.aircrafts)

/*
 * T A K E - O F F
 */
export const takeoff = function(airport, aircraft_name, aircraft_model, parking_name, runway_name, sid_name, flight_name, taxiholds) {
    var airplane = new vehicle.Device(aircraft_name, { "aircraft": aircraft_model })
    var p, p1, p2
    var p_name // point"s name
    var syncCount = 0

    const aircraft = aircraftData.find(airplane.getProp("aircraft"))
    if (!aircraft) {
        debug.error("cannot find aircraft model", aircraft_model)
        return false
    } else
        debug.print("aircraft", aircraft)

    // first point is parking position
    const parking = geojson.findFeature(parking_name, airport.parkings, "name")
    if (!parking) {
        console.log("parking not found", parking_name)
        return false
    }

    // start of ls
    airplane.addPointToTrack(parking, 0, 120) // waits 120 secs before pushback, gives a chance to be seen at parking

    airplane.addMarker(
        "pushback",
        parking,
        0,
        null,
        syncCount++,
        airplane.getProp("color"), {
            "device": airplane.name,
            "action": "pushback",
            "posname": parking.properties.name
        })

    // pushback to "pushback lane"
    p = geojson.findClosest(parking, airport.taxiways)
    if (p) {
        airplane.addPointToTrack(p, 0, 60) // 60 seconds to detach tow pushback
    } else {
        debug.error("cannot find pushback point", parking_name)
        return false
    }

    // route from pushback lane to taxiways
    airplane.addPointToTrack(p, 0, null) // 60 seconds to detach tow pushback

    // Do we have to wait at some taxihold position?
    var lastone
    if (taxiholds) {
        const TH = "QH:" + runway_name + ":"
        while (taxiholds.length > 0) {
            // taxi holding position in queue
            lastone = taxiholds.shift()
            p_name = TH + taxiholds.length // after the pop
            p1 = geojson.findFeature(p_name, airport.taxiways, "name")
            if (p1) {
                p2 = geojson.findClosest(p1, airport.taxiways)
            } else {
                console.log("could not find", p_name)
            }

            // we move to taxihold in queue
            let r = geojson.route(p, p2, airport.taxiways)
            airplane.addPathToTrack(r.coordinates, vehicle.to_kmh(aircraft.taxi_speed), null)
            // move to taxi hold point
            const totalhold = lastone.hold_time + lastone.takeoff_hold
            airplane.addPointToTrack(p2.geometry.coordinates, vehicle.to_kmh(aircraft.taxi_speed), totalhold)
            airplane.addMarker(
                "taxihold::"+taxiholds.length,
                p1,
                vehicle.to_kmh(aircraft.taxi_speed),
                lastone.hold_time,
                syncCount++,
                "purple",
                {
                    "device": airplane.name,
                    "flight": flight_name,
                    "action": "taxihold",
                    "posname": p_name,
                    "postime": lastone.hold_time
                })
            debug.print("holding at", p_name, taxiholds.length == 0 ? lastone.hold_time : totalhold)
            p = p2
        }
    }

    // route to taxi hold position
    p_name = "TH:" + runway_name
    p1 = geojson.findFeature(p_name, airport.taxiways, "name")
    p2 = geojson.findClosest(p1, airport.taxiways)

    if (p2) {
        var r = geojson.route(p, p2, airport.taxiways)
        airplane.addPathToTrack(r.coordinates, vehicle.to_kmh(aircraft.taxi_speed), null)
        // move to taxi hold point
        var hold = airport["taxi-hold"]
        var hold_time = hold[0] + Math.round(Math.random() * Math.abs(hold[1] - hold[0])) // 0-120 sec hold before T.O.
        airplane.addPointToTrack(p1.geometry.coordinates, vehicle.to_kmh(aircraft.taxi_speed), hold_time)

        airplane.addMarker(
            "taxihold",
            p1,
            vehicle.to_kmh(aircraft.taxi_speed),
            hold_time,
            syncCount++,
            airplane.getProp("color"), {
                "device": airplane.name,
                "flight": flight_name,
                "action": "taxihold",
                "posname": p_name,
                "postime": hold_time
            })

    } else {
        debug.error("cannot find taxihold point", p_name)
        return false
    }

    // route to take-off hold position
    // from taxi-hold to taxiways
    airplane.addPointToTrack(p2, vehicle.to_kmh(aircraft.taxi_speed), 0)
    p = p2
    p_name = "TOH:" + runway_name
    p1 = geojson.findFeature(p_name, airport.taxiways, "name")
    p2 = geojson.findClosest(p1, airport.taxiways)

    if (p1) {
        var r = geojson.route(p, p2, airport.taxiways)
        airplane.addPathToTrack(r.coordinates, vehicle.to_kmh(aircraft.taxi_speed), null)


        var hold_time = 0
        if (lastone) {
            hold_time = lastone.takeoff_hold
            console.log("extra holding at", p_name, lastone.takeoff_hold)
        } else {
            var hold = airport["takeoff-hold"]
            var hold_time = hold[0] + Math.round(Math.random() * Math.abs(hold[1] - hold[0])) // 0-120 sec hold before T.O.
        }


        // move to take-off hold
        airplane.addPointToTrack(p1, vehicle.to_kmh(aircraft.taxi_speed), hold_time)

        airplane.addMarker(
            "takeoffhold",
            p1,
            vehicle.to_kmh(aircraft.taxi_speed),
            hold_time,
            syncCount++,
            airplane.getProp("color"), {
                "device": airplane.name,
                "flight": flight_name,
                "action": "takeoffhold",
                "posname": p_name,
                "postime": hold_time
            })
    } else {
        debug.error("cannot find take-off hold point", p_name)
        return false
    }

    // take-off: Accelerate from 0 to vr from take-off hold to take-off position
    p = p1
    p_name = "TO:" + runway_name
    p = geojson.findFeature(p_name, airport.taxiways, "name")
    if (p) {
        airplane.addPointToTrack(p, vehicle.to_kmh(aircraft.v2), null)

        airplane.addMarker(
            "takeoff",
            p,
            vehicle.to_kmh(aircraft.v2),
            null,
            syncCount++,
            airplane.getProp("color"),
            {
                "device": airplane.name,
                "flight": flight_name,
                "action": "takeoff",
                "posname": p_name
            })
    } else {
        debug.error("cannot find take-off point", p_name)
        return false
    }

    // route to SID start postion for runway direction
    p_name = "SID:" + runway_name.substring(0, 2) // remove L or R, only keep heading
    p = geojson.findFeature(p_name, airport.airways, "name")
    if (p) {
        airplane.addMarker(
            "flight",
            p,
            vehicle.to_kmh(aircraft.climbspeed1),
            null,
            syncCount++,
            airplane.getProp("color"),
            {
                "device": airplane.name,
                "flight": flight_name,
                "action": "flight",
                "posname": p_name
            })

        airplane.addPointToTrack(p, vehicle.to_kmh(aircraft.climbspeed1), null)
    } else {
        debug.error("cannot find SID start", p_name)
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
        debug.error("cannot find SID", sid_name)
        return false
    }

    // should add a point when leaving airspace?
    airplane.addMarker(
        "away",
        last,
        null,
        null,
        syncCount++,
        airplane.getProp("color"),
        {
            "device": airplane.name,
            "flight": flight_name,
            "action": "away",
            "posname": p_name
        })

    return airplane
};

/*
 * L A N D I N G
 */
export const land = function(airport, aircraft_name, aircraft_model, parking_name, runway_name, star_name, flight_name, holdingpatterns) {
    var airplane = new vehicle.Device(aircraft_name, { "aircraft": aircraft_model })
    var p, p1, p2
    var p_name // point"s name
    var syncCount = 0

    const aircraft = aircraftData.find(airplane.getProp("aircraft"))
    if (!aircraft) {
        debug.error("cannot find aircraft model", aircraft_model)
        return false
    } else
        debug.print("aircraft", aircraft)

    p_name = "STAR:" + star_name
    p = geojson.findFeature(p_name, airport.airways, "name")
    if (p) {
        var first = true
        p.geometry.coordinates.forEach(function(c, idx) {
            if (first) {
                first = false
                airplane.addPointToTrack(c, vehicle.to_kmh(aircraft.vinitialdescend), null)
                airplane.addMarker(
                    "enter",
                    c,
                    vehicle.to_kmh(aircraft.vinitialdescend),
                    null,
                    syncCount++,
                    airplane.getProp("color"),
                    {
                        "device": airplane.name,
                        "flight": flight_name,
                        "action": "enter",
                        "posname": p_name
                    })
            } else
                airplane.addPointToTrack(c, null, null)
        })
    } else {
        debug.error("cannot find STAR", p_name)
        return false
    }

    // add STAR rendez-vous (vehicle to all runways)
    p_name = "STAR:" + runway_name.substring(0, 2) // remove L or R, only keep heading
    p = geojson.findFeature(p_name, airport.airways, "name")
    if (p) {
        airplane.addPointToTrack(p, vehicle.to_kmh(aircraft.vapproach), null)
        airplane.addMarker(
            "star",
            p,
            vehicle.to_kmh(aircraft.vapproach),
            null,
            syncCount++,
            airplane.getProp("color"),
            {
                "device": airplane.name,
                "flight": flight_name,
                "action": "star",
                "posname": p_name
            })
    } else {
        debug.error("cannot find STAR end", p_name)
        return false
    }


    // Do we have to hold pattern?
    var lastone
    if (holdingpatterns) {
        p_name = "HP:" + runway_name    // there should be a holding pattern per STAR, not per runway
        p = geojson.findFeature(p_name, airport.airways, "name")
        if (p) {
            while (holdingpatterns.length > 0) {
                lastone = holdingpatterns.shift()
                const totalhold = lastone.hold_time
                airplane.addPathToTrack(p.geometry.coordinates, vehicle.to_kmh(aircraft.vhold), null)
                airplane.addMarker(
                    "holdingpattern::"+holdingpatterns.length,
                    p.geometry.coordinates[0], // marker on first point of holding pattern
                    vehicle.to_kmh(aircraft.vhold),
                    null,
                    syncCount++,
                    "purple", {
                        "device": airplane.name,
                        "flight": flight_name,
                        "action": "holdingpattern",
                        "posname": p_name
                    })
                debug.print("holding at", p_name, holdingpatterns.length == 0 ? lastone.hold_time : totalhold)
            }
        } else {
            console.log("cannot find holding pattern", p_name)
        }
    }



    // final approach
    p_name = "FINAL:" + runway_name
    p = geojson.findFeature(p_name, airport.airways, "name")
    if (p) {
        p.geometry.coordinates.forEach(function(c, idx) {
            airplane.addPointToTrack(c, null, null)
        })
        airplane.addMarker(
            "final",
            p.geometry.coordinates[0],
            vehicle.to_kmh(aircraft.vapproach),
            null,
            syncCount++,
            airplane.getProp("color"),
            {
                "device": airplane.name,
                "flight": flight_name,
                "action": "final",
                "posname": p_name
            })
    } else {
        debug.error("cannot find final approach", p_name)
        return false
    }

    // touchdown
    p_name = "TD:" + runway_name
    p = geojson.findFeature(p_name, airport.airways, "name")
    if (p) {
        airplane.addPointToTrack(p, vehicle.to_kmh(aircraft.vlanding), null)
        airplane.addMarker(
            "touchdown",
            p,
            vehicle.to_kmh(aircraft.vlanding),
            null,
            syncCount++,
            airplane.getProp("color"),
            {
                "device": airplane.name,
                "flight": flight_name,
                "action": "touchdown",
                "posname": p_name
            })
    } else {
        debug.error("cannot find touch down", p_name)
        return false
    }

    // slow down to exit runway
    p_name = "RX:" + runway_name
    p = geojson.findFeature(p_name, airport.airways, "name")
    if (p) {
        airplane.addPointToTrack(p, vehicle.to_kmh(aircraft.taxispeed), null)
        airplane.addMarker(
            "exitrunway",
            p,
            vehicle.to_kmh(aircraft.taxispeed),
            null,
            syncCount++,
            airplane.getProp("color"),
            {
                "device": airplane.name,
                "flight": flight_name,
                "action": "exitrunway",
                "posname": p_name
            })
    } else {
        debug.error("cannot find runway exit", p_name)
        return false
    }

    // taxi to parking
    // runway exit to taxiway
    p1 = geojson.findClosest(p, airport.taxiways)
    airplane.addPointToTrack(p1, vehicle.to_kmh(aircraft.taxispeed), null)

    // taxi to close to parking
    const parking = geojson.findFeature(parking_name, airport.parkings, "name")
    if (!parking) {
        debug.print("parking not found", parking_name)
        return false
    }
    p2 = geojson.findClosest(parking, airport.taxiways)

    var r = geojson.route(p1, p2, airport.taxiways)
    airplane.addPathToTrack(r.coordinates, vehicle.to_kmh(aircraft.taxi_speed), null)


    // last point is parking position (from taxiway to parking position)
    airplane.addPointToTrack(parking, 0, 120) // waits 120 secs before turning ADSB off (gives a chance to be seen at parking)
    airplane.addMarker(
        "park",
        parking,
        0,
        null,
        syncCount++,
        airplane.getProp("color"),
        {
            "device": airplane.name,
            "flight": flight_name,
            "action": "park",
            "posname": parking_name
        })

    return airplane
};