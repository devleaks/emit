const fs = require('fs')
const geojson = require('../lib/geojson-util')
const debug = require('../lib/debug')

const queue = require("../lib/queue")

var _airport

exports.init = function(config, dirbase = './') {

    var a = config.airport ? config.airport : {} /*config*/

    a.config = config

    var jsonfile = fs.readFileSync(dirbase + config.airport.parkings, 'utf8')
    a.parkings = JSON.parse(jsonfile)
    a.parkings._network_name = "parking"

    jsonfile = fs.readFileSync(dirbase + config.airport.service, 'utf8')
    a.serviceroads = JSON.parse(jsonfile)
    a.serviceroads._network_name = "serviceroads"

    jsonfile = fs.readFileSync(dirbase + config.airport.pois, 'utf8')
    a.pois = JSON.parse(jsonfile)
    a.pois._network_name = "pois"

    jsonfile = fs.readFileSync(dirbase + config.airport.taxiways, 'utf8')
    a.taxiways = JSON.parse(jsonfile)
    a.taxiways._network_name = "taxiways"

    jsonfile = fs.readFileSync(dirbase + config.airport.airways, 'utf8')
    a.airways = JSON.parse(jsonfile)
    a.airways._network_name = "airways"

    var METAR = false
    if (a.metar) {
        jsonfile = fs.readFileSync(dirbase + a.metar, 'utf8')
        a.METAR = JSON.parse(jsonfile)
    }

    geojson.complexify(a.serviceroads)
    geojson.complexify(a.taxiways)

    _airport = a

    return _airport
}

/* Compute runway in use from list of runways and wind direction (in degrees). If tied, default is selected.
 * Returns runway in use.
 *
 */
function computeRunway(runways, wind, rwys) {
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

exports.randomRunway = function(wind) {
    var runway = _airport.runways.length > 1 ? random(_airport.runways) : _airport.runways[0]
    return computeRunway(runway, wind, _airport.runways.length)
}

function random(a) {
    return a[Math.floor(Math.random() * a.length)]
}

exports.randomSID = function(runway) {
    const rh = runway.substring(0, 2)
    const sids = _airport.sid[rh]
    return random(sids)
}

exports.randomSTAR = function(runway) {
    const rh = runway.substring(0, 2)
    const stars = _airport.star[rh]
    return random(stars)
}

exports.randomApron = function(type = false) {
    var aprons = type ? _airport.aprons[type] : _airport.aprons["PAX"].concat(_airport.aprons["CARGO"])
    return random(aprons)
}

exports.randomParking = function(apron = false) {
    var ret = apron ? _airport.parkings.features.filter(f => f.properties.apron == apron) : _airport.parkings.features
    if (ret.length < 1) {
        debug.warning("no parking on apron '" + apron + "' found")
        ret = _airport.parkings.features
    }
    var p = random(ret)
    return p.properties.name
}

exports.play = function(scenario) {
    return false
}

exports.parkingFeature = function(name) {
    var ret = _airport.parkings.features.filter(f => f.properties.name == name)
    return (ret.length > 0) ? ret[0] : false
}



/**
 * Prototypes of resource booking/reservation function. Used for parking and for runways.
 * Could also be used for services (fuel trucks, etc.)
 * Limitation is that you need to book a resource between 2 times.
 * Both function do not live well with concurrency.
 */
exports.getAvailableRunway = function(runways, datefrom, dateto) {
    var possibilities = [] // runways is typically ["22L", "22R"]

    runways.forEach( (rwy) => { queue.create(rwy) } ) // init in case they were not

    runways.forEach( (rwy) => {
        possibilities.push({
            runway: rwy,
            nextavail: queue.resourceNextAvailable(rwy, datefrom, dateto)
        })
    })

    possibilities.sort( (a,b) => moment(a.nextavail).isSameOrAfter(moment(b.nextavail)) )

    return possibilities[0]
}


exports.getAvailableParking = function(apron = false, datefrom, dateto) {
    var allparking = apron ? _airport.parkings.features.filter(f => f.properties.apron == apron) : _airport.parkings.features
    var avail = false
    var p
    const MAXTRIES = 100
    var i = 0

    if (allparking.length < 1) {
        debug.warning("no parking on apron '" + apron + "' found")
        allparking = _airport.parkings.features
    }

    while (!avail && (i < MAXTRIES)) {
        i++
        p = random(allparking)
        var rsc = queue.create(p) // init a resource name
        if (queue.resourceAvailable(p, datefrom, dateto)) {
            queue.reserve(p, datefrom, dateto)
            avail = p
        }
    }
    if (i >= MAXTRIES) {
        console.warn("Queue::getAvailableParking: maximum tries reached", i, avail)
    }
    return avail
}