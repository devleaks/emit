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

const NAMELEN = 3 // 2 or 3 letters
const CODELEN = 4 // 3 or 4 numbers?
var _flightnum = Math.pow(10, CODELEN-1)

exports.randomAirline = function(type, departure = false) {
    const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    var char = ''
    for(var i = 0; i < (NAMELEN - 1); i++) {
        char += UPPERCASE.charAt(Math.floor(Math.random() * UPPERCASE.length))
    }
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

exports.randomFlightname = function(type, departure = false, reuse = false) {
    // reuse company name, but change first letter...
    var airline = reuse ? exports.randomAirline(type, departure).substr(0, 1) + reuse.substr(1, NAMELEN-1) : exports.randomAirline(type, departure)
    if (_flightnum > Math.pow(10, CODELEN)-1) _flightnum = Math.pow(10, CODELEN-1) // loop
    _flightnum = 2 * Math.floor((_flightnum + 2 + Math.floor(Math.random() * 10)) / 2) // even number
    _flightnum += (departure ? 1 : 0)
    fn = _flightnum
    /*
    // reuse flight number
    var airline = exports.randomAirline(type, departure)
    var fn = 0
    if (reuse) {
        fn = reuse.substr(NAMELEN,CODELEN)
    } else {
        if (_flightnum > Math.pow(10, CODELEN)-1) _flightnum = Math.pow(10, CODELEN-1) // loop
        _flightnum += (1 + Math.floor(Math.random() * 10))
        fn = _flightnum
    }
    */
    //console.log(airline, fn.toString().padStart(CODELEN, '0'))
    return airline + fn.toString().padStart(CODELEN, '0')
}