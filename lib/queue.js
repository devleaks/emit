const fs = require("fs")
const moment = require('moment')
const geojson = require('../lib/geojson-util')
const debug = require('../lib/debug')

/* Resources like room, airport runways or taxiways reservation by time frames.*/

var _RESOURCES = {}

/*
 */
exports.create = function(resourceName) {
    if (!_RESOURCES.hasOwnProperty(resourceName))
        _RESOURCES[resourceName] = []
    return _RESOURCES[resourceName]
}


/*
 */
exports.reserve = function(resourceName, datefrom, dateto) {
    if (exports.resourceAvailable(resourceName, datefrom, dateto)) {
        _RESOURCES[resourceName].push({
            datefrom: datefrom,
            dateto: dateto
        })
        return true
    }
    return false
}


/*
 */
exports.resourceAvailable = function(resourceName, datefrom, dateto) {
    var overlap = false
    _RESOURCES[resourceName].forEach(function(p, idx) { // should do a reduce... should returns as soon as overlaps
        // debug.print("overlap", overlap, p.dateto, datefrom, ((p.datefrom <= dateto) && (p.dateto >= datefrom)))
        overlap = overlap || (
            moment(p.datefrom, moment.ISO_8601).isBefore(moment(dateto, moment.ISO_8601)) &&
            moment(p.dateto, moment.ISO_8601).isAfter(moment(datefrom, moment.ISO_8601))
        ) // https://stackoverflow.com/questions/325933/determine-whether-two-date-ranges-overlap
    })
    return !overlap
}


/**
 * Returns the first datetime when ressource is available.
 *
 * @param      {<type>}            resourceName  The resource name
 * @param      {string}            datefrom      The datefrom
 * @param      {string}            dateto        The dateto
 * @return     {(boolean|string)}  Datetime when resource is next available or false if no resource found.
 */
exports.resourceNextAvailable = function(resourceName, datefrom, dateto) {
    if (exports.resourceAvailable(resourceName, datefrom, dateto)) {
        return datefrom
    }
    var nextAvail = false
    var idx = 0
    var next = _RESOURCES[resourceName].filter((a) => moment(a.dateto).isAfter(moment(datefrom)))
    next.sort((a, b) => (moment(a.datefrom).isAfter(moment(b.datefrom)) ? 1 : -1))
    debug.print("next", next)

    while (!nextAvail && idx < (next.length - 1)) {
        debug.print("test", datefrom + " >= " + next[idx].dateto, dateto + " <= " + next[idx + 1].datefrom)
        if (!nextAvail &&
            moment(datefrom).isSameOrAfter(moment(next[idx].dateto)) &&
            moment(dateto).isSameOrBefore(moment(next[idx + 1].datefrom))
        ) {
            nextAvail = next[idx].dateto
        }
        idx++
    }
    return nextAvail ? nextAvail : next[next.length - 1].dateto
}

exports.reschedule = function(datefrom, dateto, datefrom2) {
    return {
        datefrom: datefrom2,
        dateto: moment(datefrom2).add(moment(dateto).diff(moment(datefrom))).toISOString(true)
    }
}


exports.dump = function(fn) {
    fs.writeFileSync(fn, JSON.stringofy(_RESOURCES), { mode: 0o644 })
}