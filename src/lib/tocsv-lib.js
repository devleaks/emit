import moment from "moment";
import turf from "@turf/turf";
import * as geojson from "./geojson-util.js";
import * as debug from "./debug.js";
import * as config from "../data/sim-config.js";

function mkcsv(f, sd, options) {
    function quote(s) {
        return "'" + s + "'"
    }
    var s = options.queue + "," + (options.hasOwnProperty("name") ? options.name : (f.properties.hasOwnProperty("device") ? f.properties.device : "device-name"))
    s += "," + moment(sd).add(f.properties.elapsed, "s").toISOString(true) // rebase time
    s += "," + f.geometry.coordinates[1] + "," + f.geometry.coordinates[0] + ","
    if (f.geometry.coordinates.length > 2) // alt
        s += f.geometry.coordinates[2]
    s += "," + geojson.rn(f.properties.speed, 2)
    s += "," + f.properties.bearing
    s += ","
    if (options.payload) {
        s += quote(JSON.stringify(f.properties))
    }
    debug.print(s)
    return s
}

export const tocsv = function(fc, startdate, options) {
    var events = []
    var all_sync_events = []
    var first_event = false
    var last_event = false
    var sync_event = false

    fc.features.forEach(function(f, idx) {
        if (f.type == "Feature" && f.geometry.type == "Point") {
            if (f.properties && f.properties.hasOwnProperty("emit") && f.properties.emit) {
                if (!first_event) first_event = f
                events.push(f)
                last_event = f
            }
            if (f.properties.hasOwnProperty("sync")) {
                all_sync_events[f.properties.sync] = f
            }
            if (!sync_event && f.properties && f.properties.hasOwnProperty("emit") && f.properties.hasOwnProperty("sync") && f.properties.sync == options.event) {
                sync_event = f
                debug.print("located requested sync event", f)
            }
        }
    })

    const cols = config.CSV.DEVICE
    var strbuf = (options.first ? (options.payload ? cols + ",payload" : cols) + "\n" : "")

    // synchronize event
    var timeshift = 0
    sync_event = options.event == "last" ? last_event : options.event == "first" ? first_event : sync_event
    if (sync_event) {
        timeshift = -sync_event.properties.elapsed
    } else if (options.event && !sync_event) {
        console.log("could not find sync event '" + options.event + "', starting from begining")
    }

    // add/remove random delay (seconds)
    var randomdelay = 0
    if (options.random > 0) {
        randomdelay = Math.round(Math.random() * options.random * 60)
        randomdelay *= Math.random() > 0.5 ? 1 : -1
    }
    debug.print("timeshift", timeshift, moment.duration(timeshift, "seconds").humanize(), randomdelay, moment.duration(randomdelay, "seconds").humanize())

    timeshift += randomdelay

    debug.print("total timeshift", timeshift, moment.duration(timeshift, "seconds").humanize())
    startdate.add(timeshift, "s")
    debug.print("startdate", startdate.toISOString())

    strbuf = events.reduce((s, f) => s + mkcsv(f, startdate, options) + "\n", "")

    var retsyncevents = {}
    all_sync_events.forEach(function(f, idx) {
        retsyncevents[f.properties.sync] = moment(startdate).add(f.properties.elapsed, "seconds").toISOString(true)
        debug.print("syncevent", f.properties.sync, retsyncevents[f.properties.sync])
    })

    return { csv: strbuf, syncevents: retsyncevents }
};

// tries to 
export const tocsv_sync_all = function(fc, startdate, options) {
    var events = []
    var trips = {}

    fc.features.forEach(function(f, idx) { // search for sync events
        if (f.type == "Feature" && f.geometry.type == "Point" && f.properties && f.properties.hasOwnProperty("emit")) {
            events.push(f)
            if (f.properties.hasOwnProperty("sync") && f.properties.hasOwnProperty("device")) {
                const device = f.properties.device
                const sync = f.properties.sync
                trips[device] = trips.hasOwnProperty(device) ? trips[device] : {}
                trips[device][sync] = trips[device].hasOwnProperty(sync) ? trips[device][sync] : []
                trips[device][sync] = f
                debug.print("found", device, sync, trips[device][sync].properties.sequence, trips[device][sync].properties.elapsed, trips[device][sync].properties.scheduled)
            }
        }
    })

    const cols = config.CSV.DEVICE
    var strbuf = (options.first ? (options.payload ? cols + ",payload" : cols) + "\n" : "")
    var last_seq = -1

    events.sort((a, b) => (a.properties.sequence > b.properties.sequence) ? 1 : -1)
    for (var device in trips) {
        debug.print(device)
        const devicetrip = trips[device]
        for (var sync in devicetrip) {
            const event = trips[device][sync]
            debug.print("doing", device, sync, event.properties.sequence, event.properties.elapsed)
            const startdate = moment(event.properties.scheduled).add(-event.properties.elapsed, "seconds")
            events.forEach(function(f, idx) {
                // modified 05-AUG-2020 to make sure we generate more csv lines after the service, when the service truck
                // moves back to the service road and leaves the airplane's parking. (we add a "point" for that after the service
                // in service-lib.js.)
                // BEFORE: f.properties.sequence <= event.properties.sequence
                // NOW: f.properties.vertex <= (event.properties.vertex + 2): There are 2 vertices after the service,
                // one to move back to the service road, one to "wait" on the service road (set to 120sec, so that the truck emits
                // outside of the parking area for a "buffer out" of the parking space.)
                // Note: After that truck may "jump" from that place to its next service road if wait is less than 120 secs.
                if (f.properties.sequence > last_seq && f.properties.vertex <= (event.properties.vertex + 2)) {
                    strbuf += mkcsv(f, startdate, options) + "\n"
                    debug.print("added", f.properties.sequence, f.properties.elapsed)
                }
            })
            last_seq = event.properties.sequence
        }
    }
    return { csv: strbuf, syncevents: trips }
};