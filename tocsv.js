const fs = require('fs')
var program = require('commander')
const moment = require('moment')
const turf = require('@turf/turf')

const geojson = require('./lib/geojson-util')
const debug = require('./lib/debug.js')

debug.init(true, [""], "main")

program
    .version('1.0.0')
    .description('Convert data from FeatureCollection of Point to CSV')
    .option('-d, --debug', 'output extra debugging')
    .option('-n, --name <name>', 'device name', "device")
    .option('-q, --queue <name>', 'Kafka queue name', "queue")
    .option('-1, --first', 'Add header line')
    .option('-p, --payload', 'Add payload column with all properties')
    .option('-s, --start-date <date>', 'Start date of event reporting, default to now', moment().toISOString())
    .option('-e, --event <event>', 'Sync event number to sync date on', 0)
    .option('-r, --random <delay>', 'Add or substract random delay to start-date in minutes', 0)
    .option('-o <file>, --output <file>', 'Save to file, default to out.csv', "out.csv")
    .requiredOption('-f, --file <file>', 'GeoJSON file to process')
    .parse(process.argv)

debug.init(program.debug, ["","justDoIt"], "main")
debug.print(program.opts())

function tocsv(f, sd) {
    function quote(s) {
        return "'"+s+"'"
    }
    var s = program.queue+','+program.name
    s += ',' + moment(sd).add(f.properties.elapsed, 's').toISOString(true) // rebase time
    s += ',' + f.geometry.coordinates[1] + ',' + f.geometry.coordinates[0]
    if (f.geometry.coordinates.length > 2) // alt
        s += ',' + f.geometry.coordinates[2]
    s += ',' + geojson.rn(f.properties.speed, 2)
    s += ',' + f.properties.bearing
    if(program.payload) {
        s += ',' + quote(JSON.stringify(f.properties))
    }
    debug.print(s)
    return s
}

function justDoIt(fc, startdate) {
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
                if (f.properties.sync == program.event) {
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
    } else if (program.event && !sync_event) {
        debug.warning("could not find sync point, using default")
    }

    // add/remove random delay (seconds)
    var delay = 0
    if (program.random > 0) {
        delay = Math.round(Math.random() * program.random * 60)
        delay *= Math.random() > 0.5 ? 1 : -1
    }
    debug.print("timeshift", timeshift, moment.duration(timeshift, "seconds").humanize(), delay, moment.duration(delay, "seconds").humanize())

    timeshift += delay

    debug.print("total timeshift", timeshift, moment.duration(timeshift, "seconds").humanize())
    startdate.add(timeshift, 's')
    debug.print("startdate", startdate.toISOString())

    const cols =  "queue,name,timestamp,lat,lon,speed,heading"
    var strbuf = (program.first ? (program.payload ? cols + ",payload" : cols) : "") + "\n"
    events.forEach(function(f, idx) {
        strbuf += tocsv(f, startdate) + "\n"
    })
    return strbuf
}

const jsonstring = fs.readFileSync(program.file, 'utf8')
const startdate = moment(program.startDate)

if (!startdate.isValid()) {
    debug.print('start date is not valid', startdate)
    return false
}

var res = justDoIt(JSON.parse(jsonstring), startdate)

if (res) {
    fs.writeFileSync(program.O, res, { mode: 0o644 })
    console.log(program.O + ' written')
} else {
    console.log('nothing saved')
}