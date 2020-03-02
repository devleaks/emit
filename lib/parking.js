const fs = require('fs')
const debug = require('../lib/debug')
const geojson = require('../lib/geojson-util')

var _parkings = []
var _busy = []

exports.init = function(parkings) {
    _parkings = parkings
    return _parkings
}

/*
 */
exports.busy = function(parking, datefrom, dateto) {
    if (parkingAvailable()) {
        _busy.push({
            parking: parking,
            datefrom: datefrom,
            dateto: dateto
        })
        return true
    }
    return false
}


/*
 */
function parkingAvailable(parking, datefrom, dateto) {
  return true
}


/*
 */
exports.purge = function(dateto) {
    _busy.forEach(function(p, idx) {
        if (p.dateto < dateto)
            delete _busy[idx]
    })
}

