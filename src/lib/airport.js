import fs from 'fs';
import * as geojson from './geojson-util.js';
import * as debug from './debug.js';
import * as queue from './queue.js';

let _airport

export const init = function(config, dirbase = './') {

    let a = config.airport ? config.airport : {} /*config*/

    a.config = config

    let jsonfile = fs.readFileSync(dirbase + config.airport.parkings, 'utf8')
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

    let METAR = false
    if (a.metar) {
        jsonfile = fs.readFileSync(dirbase + a.metar, 'utf8')
        a.METAR = JSON.parse(jsonfile)
    }

    geojson.complexify(a.serviceroads)
    geojson.complexify(a.taxiways)

    _airport = a

    return _airport
};

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

    let wmin = runway_heading - 9
    if (wmin < 0) wmin += 36
    let wmax = runway_heading + 9
    if (wmax > 36) wmax -= 36

    if (wmin > wmax) { // switch them
        let t = wmax
        wmax = wmin
        wmin = t
    }

    let wind_int = Math.round((parseInt(wind) + 5) / 10)
    let wind_ret = (wind_int > wmin && wind_int < wmax) ? runway_alt_txt : runway_heading_txt
    debug.print(wind, runway_heading, runway_alt, wmin, wmax, wind_int, wind_ret)
    return wind_ret // (wind_int > wmin && wind_int < wmax) ? runway_alt_txt : runway_heading_txt
}

export const randomRunway = function(wind) {
    let runway = _airport.runways.length > 1 ? random(_airport.runways) : _airport.runways[0]
    return computeRunway(runway, wind, _airport.runways.length)
};

function random(a) {
    return a[Math.floor(Math.random() * a.length)]
}

function randomWeight(a, w) {
    let num = Math.random(),
        s = 0,
        lastIndex = w.length - 1,
        wtot = w.reduce((acc, curr) => acc + curr),
        weights = w.map((x) => x / wtot)

    for (let i = 0; i < lastIndex; ++i) {
        s += weights[i]
        if (num < s) {
            return a[i]
        }
    }
    return a[lastIndex]
}

export const randomSID = function(runway) {
    const rh = runway.substring(0, 2)
    const sids = _airport.sid[rh]
    return random(sids)
};

export const randomSTAR = function(runway) {
    const rh = runway.substring(0, 2)
    const stars = _airport.star[rh]
    return random(stars)
};

export const randomApron = function(type = false) {
    let aprons = type ? _airport.aprons[type] : _airport.aprons["PAX"].concat(_airport.aprons["CARGO"])
    return random(aprons)
};

export const randomParking = function(apron = false) {
    let ret = apron ? _airport.parkings.features.filter(f => f.properties.apron == apron) : _airport.parkings.features
    if (ret.length < 1) {
        debug.warning("no parking on apron '" + apron + "' found")
        ret = _airport.parkings.features
    }
    let p = random(ret)
    return p.properties.name
};

export const play = function(scenario) {
    return false
};

export const parkingFeature = function(name) {
    let ret = _airport.parkings.features.filter(f => f.properties.name == name)
    return (ret.length > 0) ? ret[0] : false
};

/**
 * Prototypes of resource booking/reservation function. Used for parking and for runways.
 * Could also be used for services (fuel trucks, etc.)
 * Limitation is that you need to book a resource between 2 times.
 * Both function do not live well with concurrency.
 */
export const getAvailableRunway = function(runways, datefrom, dateto) {
    let possibilities = [] // runways is typically ["22L", "22R"]

    runways.forEach( (rwy) => { queue.create(rwy) } ) // init in case they were not

    runways.forEach( (rwy) => {
        possibilities.push({
            runway: rwy,
            nextavail: queue.resourceNextAvailable(rwy, datefrom, dateto)
        })
    })

    possibilities.sort( (a,b) => moment(a.nextavail).isSameOrAfter(moment(b.nextavail)) )

    return possibilities[0]
};

export const getAvailableParking = function(apron = false, datefrom, dateto) {
    let allparking = apron ? _airport.parkings.features.filter(f => f.properties.apron == apron) : _airport.parkings.features
    let avail = false
    let p
    const MAXTRIES = 100
    let i = 0

    if (allparking.length < 1) {
        debug.warning("no parking on apron '" + apron + "' found")
        allparking = _airport.parkings.features
    }

    while (!avail && (i < MAXTRIES)) {
        i++
        p = random(allparking)
        let rsc = queue.create(p) // init a resource name
        if (queue.resourceAvailable(p, datefrom, dateto)) {
            queue.reserve(p, datefrom, dateto)
            avail = p
        }
    }
    if (i >= MAXTRIES) {
        console.warn("Queue::getAvailableParking: maximum tries reached", i, avail)
    }
    return avail
};