const moment = require('moment')
const turf = require('@turf/turf')

const geojson = require('../lib/geojson-util')
const debug = require('../lib/debug.js')

debug.init(true, [""], "main")

function mkcsv(f, sd, options) {
    function quote(s) {
        return "'"+s+"'"
    }
    var s = options.queue+','+options.name
    s += ',' + moment(sd).add(f.properties.elapsed, 's').toISOString(true) // rebase time
    s += ',' + f.geometry.coordinates[1] + ',' + f.geometry.coordinates[0]
    if (f.geometry.coordinates.length > 2) // alt
        s += ',' + f.geometry.coordinates[2]
    s += ',' + geojson.rn(f.properties.speed, 2)
    s += ',' + f.properties.bearing
    if(options.payload) {
        s += ',' + quote(JSON.stringify(f.properties))
    }
    debug.print(s)
    return s
}

exports.tocsv = function(fc, startdate, options) {
    var events = []
    var last_event = false
    var first_event = false
    var sync_event = false
    var ls = false

    fc.features.forEach(function(f, idx) {
        if (f.type == "Feature" && f.geometry.type == "Point") {
            if (f.properties && f.properties.hasOwnProperty("emit") && f.properties.emit) {
                if(! first_event) first_event = f
                events.push(f)
                last_event = f
            }
            if (!sync_event && f.properties && f.properties.hasOwnProperty("sync") && f.properties.marker) {
                if (f.properties.sync == options.event) {
                    sync_event = f
                    debug.print("sync event", f)
                }
            }
        } else if (f.type == "Feature" && f.geometry.type == "LineString") {
            ls = f
        }
    })


    // synchronize event
    var timeshift = 0
    if (sync_event) {
        const point = turf.nearestPoint(sync_event, geojson.FeatureCollection(events))
        if(point) {
            debug.print("events", events.length, sync_event.properties.idx, point, turf.distance(point, sync_event))
            timeshift = -point.properties.elapsed
        } else {
            debug.warning("sync point not found", events.length, sync_event.properties.idx)
        }
    } else if (options.event && !sync_event) {
        debug.warning("could not find sync point, using default")
    }

    // add/remove random delay (seconds)
    var delay = 0
    if (options.random > 0) {
        delay = Math.round(Math.random() * options.random * 60)
        delay *= Math.random() > 0.5 ? 1 : -1
    }
    debug.print("timeshift", timeshift, moment.duration(timeshift, "seconds").humanize(), delay, moment.duration(delay, "seconds").humanize())

    timeshift += delay

    debug.print("total timeshift", timeshift, moment.duration(timeshift, "seconds").humanize())
    startdate.add(timeshift, 's')
    debug.print("startdate", startdate.toISOString())

    const cols =  "queue,name,timestamp,lat,lon,speed,heading"
    var strbuf = (options.first ? (options.payload ? cols + ",payload" : cols) : "") + "\n"
    events.forEach(function(f, idx) {
        strbuf += mkcsv(f, startdate, options) + "\n"
    })
    return strbuf
}