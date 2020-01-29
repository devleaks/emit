const fs = require('fs')
var program = require('commander')
const moment = require('moment')

const geojson = require('./geojson-util')
const debug = require('./debug.js')

debug.init(true, [""], "main")

program
    .version('1.0.0')
    .description('Convert data from FeatureCollection of Point to CSV')
    .option('-d, --debug', 'output extra debugging')
    .option('-n, --name <name>', 'device name', "device")
    .option('-s, --start-date <date>', 'Start date of event reporting, default to now', moment().toISOString())
    .option('-e, --event <event>', 'Event name to sync date [p]pushback/parking or [t]takeoff/touchdown', 'p')
    .option('-r, --random <delay>', 'Add or substract random delay to start-date', 0)
    .option('-o <file>, --output <file>', 'Save to file, default to out.csv', "out.csv")
    .requiredOption('-f, --file <file>', 'GeoJSON file to process')
    .parse(process.argv)

debug.init(program.debug, ["","justDoIt"], "main")
debug.print(program.opts())

function tocsv(f, sd) {
    var s = program.name
    s += ',' + moment(sd).add(f.properties.elapsed, 's').toISOString(true) // rebase time
    s += ',' + f.geometry.coordinates[1] + ',' + f.geometry.coordinates[0]
    if (f.geometry.coordinates.length > 2) // alt
        s += ',' + f.geometry.coordinates[2]
    s += ',' + f.properties.speed
    s += ',' + f.properties.bearing
    debug.print(s)
    return s
}

function justDoIt(fc, startdate) {
    var events = []
    var last_event = false
    var contact = false
    var ls = false

    fc.features.forEach(function(f, idx) {
        if (f.type == "Feature" && f.geometry.type == "Point") {
            if (f.properties && f.properties.hasOwnProperty("emit") && f.properties.emit) {
                events.push(f)
                last_event = f
            }
            if (f.properties && f.properties.hasOwnProperty("marker") && f.properties.marker) {
                if (!contact && f.properties.note) {
                    var subnote = f.properties.note.substr(0, 3)
                    if (subnote == 'TO:' || subnote == 'TD:') {
                        contact = f
                        debug.print("contact", contact)
                    }
                }
            }
        } else if (f.type == "Feature" && f.geometry.type == "LineString") {
            ls = f
        }
    })
    debug.print("last_event", last_event)

    if (!contact) {
        debug.error("could not find contact point")
        return false
    }

    // synchronize event
    var timeshift = 0
    if (program.event == 'p') { // need to find takeoff or landing
        if (contact.properties.note.substr(0, 3) == "TD:") { // TouchDown = Arrival, TakeOff = Departure
            timeshift = -last_event.properties.elapsed
        } // for takeoff, timeshift = 0, time of pushback
    } else { // need to shift for takeoff or touchdown event
        // contact.properties.idx is the orignal's vertex number in the original line string.
        // we keep that index number in the new LineString under the "vertex" property.
        // so we need to find the index of the event that was emited at or around that vertex index.
        const point = geojson.findFeature(contact.properties.idx, geojson.FeatureCollection(events), "vertex")
        debug.print("events", events.length, contact.properties.idx, point)
        timeshift = -point.properties.elapsed
    }

    // add/remove random delay (seconds)
    var delay = 0
    if (program.random > 0) {
        delay = Math.round(Math.random() * program.random)
        delay *= Math.random() > 0.5 ? 1 : -1
    }
    debug.print("timeshift", timeshift, delay)

    timeshift += delay

    startdate.add(timeshift, 's')
    debug.print("startdate", startdate.toISOString())

    var strbuf = "name,timestamp,lat,lon,speed,heading\n"
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