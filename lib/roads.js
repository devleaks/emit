const fs = require('fs')
const moment = require('moment')
const geojson = require('../lib/geojson-util')
const debug = require('../lib/debug')

var _roads
var _services

var _busy = []

exports.init = function(config, dirbase = './') {
    _roads = config.roads
    _services = config.services

    // load higways
    _roads["highways"] = {}
    for(var f in config.roads["highways-file"]) {
        var jsonfile = fs.readFileSync(dirbase + config.roads["highways-file"][f], 'utf8')
        _roads.highways[f] = JSON.parse(jsonfile)
    }

    // load local roads
    var jsonfile = fs.readFileSync(dirbase + config.roads["localroads-file"], 'utf8')
    _roads.localroads = JSON.parse(jsonfile)
    geojson.complexify(_roads.localroads)

    // load local roads
    var jsonfile = fs.readFileSync(dirbase + config.roads["parking-file"], 'utf8')
    _roads.parkings = JSON.parse(jsonfile)

    return _roads
}

exports.randomHighway = function() {
    return geojson.randomElemFrom(Object.keys(_roads.highways))
}

exports.randomHandler = function() {
    return geojson.randomElemFrom(Object.keys(_services.handlers))
}

exports.randomParking = function(handler = false) {
    var avail = handler ? _roads.parkings.features.filter(p => _services["handlers"][handler].indexOf(p.properties.ramp) > -1 ) : _roads.parkings.features

    if(avail.length < 1) {
        debug.warning("no parking on handler '"+handler+"' found")
        avail = _roads.parkings.features
    }
    var p = geojson.randomElemFrom(avail)
    return p.properties.name
}

/*
 */
exports.park = function(parkingName, datefrom, dateto) {
    if (exports.parkingAvailable(parkingName, datefrom, dateto)) {
        _busy.push({
            parking: parkingName,
            datefrom: datefrom,
            dateto: dateto
        })
        return true
    }
    return false
}


/*
 */
exports.parkingAvailable = function(parkingName, datefrom, dateto) {
    const thisParking = _busy.filter(p => p.parking == parkingName)
    var overlap = false
    thisParking.forEach(function(p, idx) { // should do a reduce...
        debug.print("overlap", overlap, p.dateto, datefrom, ((p.datefrom <= dateto) && (p.dateto >= datefrom)))
        overlap = overlap || ((p.datefrom <= dateto) && (p.dateto >= datefrom))  // https://stackoverflow.com/questions/325933/determine-whether-two-date-ranges-overlap
    })
    return !overlap
}


/*
 */
exports.purge = function(dateto) {
    _busy.forEach(function(p, idx) {
        if (p.dateto < dateto)
            delete _busy[idx]
    })
}

exports.findParking = function(datefrom, dateto, handler = false) {
    var ret = false
    var avail = handler ? _roads.parkings.features.filter(p => _services["handlers"][handler].indexOf(p.properties.ramp) > -1 ) : _roads.parkings.features

    avail.forEach(function(parking, idx) {
        const p = parking.properties.name
        if (!ret && exports.parkingAvailable(p, datefrom, dateto)) {
            ret = p
        }
    })
    return ret
}
