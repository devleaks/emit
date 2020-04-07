const fs = require('fs')
const debug = require('../lib/debug')

var _aircrafts

exports.init = function(aircrafts) {
    _aircrafts = aircrafts
    return _aircrafts
}

/*
 */
exports.randomAircraftICAO = function() {
    const HEX = '01234567890ABCDEF'
    var ret = ''
    for (var i = 0; i < 6; i++)
        ret += HEX.charAt(Math.floor(Math.random() * HEX.length))
    return ret
}

exports.randomAircraftModel = function(type = false) {
    var ret
    if (type) {
        ret = []
        var t = Object.keys(_aircrafts)
        t.forEach(function(c, idx) {
            if (_aircrafts[c].type == type)
                ret.push(c)
        })
    } else {
        ret = Object.keys(_aircrafts)
    }
    if (ret.length < 1) {
        debug.warning("no aircraft of type '" + type + "' found")
        ret = Object.keys(_aircrafts)
    }
    return ret[Math.floor(Math.random() * ret.length)]
}

/*
 */
exports.find = function(name) {
    return _aircrafts[name]
}

exports.randomAirline = function(type, departure = false) {
    const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    var char = UPPERCASE.charAt(Math.floor(Math.random() * UPPERCASE.length))
    var airline
    switch (type) {
        case 'CARGO':
            airline = (departure ? 'D' : 'C') + char
            break
        case 'PAX':
            airline = (departure ? 'Q' : 'P') + char
            break
        default:
            airline = (Math.random() > 0.5 ? (departure ? 'D' : 'C') : (departure ? 'Q' : 'P')) + char
    }
    return airline
}

var _flightnum = 100

exports.randomFlightname = function(type, departure = false, reuse = false) {
    var airline = exports.randomAirline(type, departure)
    var fn = 0
    if (reuse) {
        fn = reuse.substr(2,3) // assume 2 letter company name
    } else {
        if (_flightnum > 980) _flightnum = 100 // loop
        _flightnum += (1 + Math.floor(Math.random() * 10))
        fn = _flightnum
    }
    return airline + fn.toString().padStart(3, '0')
}