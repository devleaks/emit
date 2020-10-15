import fs from "fs";
import * as debug from "./debug.js";

var _aircrafts

export const init = function(aircrafts) {
    _aircrafts = aircrafts
    return _aircrafts
};

/*
 */
export const randomAircraftICAO = function() {
    const HEX = "01234567890ABCDEF"
    var ret = ""
    for (var i = 0; i < 6; i++)
        ret += HEX.charAt(Math.floor(Math.random() * HEX.length))
    return ret
};

export const randomAircraftModel = function(type = false) {
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
};

/*
 */
export const find = function(name) {
    return _aircrafts[name]
};

export const NAMELEN = 3 // 2 or 3 letters
export const CODELEN = 4 // 3 or 4 numbers?
var _flightnum = Math.pow(10, CODELEN-1)

export const randomAirline = function(type, departure = false) {
    const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    var char = ""
    for(var i = 0; i < (NAMELEN - 1); i++) {
        char += UPPERCASE.charAt(Math.floor(Math.random() * UPPERCASE.length))
    }
    var airline
    switch (type) {
        case "CARGO":
            airline = (departure ? "D" : "C") + char
            break
        case "PAX":
            airline = (departure ? "Q" : "P") + char
            break
        default:
            airline = (Math.random() > 0.5 ? (departure ? "D" : "C") : (departure ? "Q" : "P")) + char
    }
    return airline
};

export const randomFlightname = function(type, departure = false, reuse = false) {
    // reuse company name, but change first letter...
    let airline = reuse ? reuse.substr(0, NAMELEN) : randomAirline(type, departure)
    if (_flightnum > Math.pow(10, CODELEN)-1) _flightnum = Math.pow(10, CODELEN-1) // loop
    _flightnum = 2 * Math.floor((_flightnum + 2 + Math.floor(Math.random() * 10)) / 2) // even number
    _flightnum += (departure ? 1 : 0)
    let fn = _flightnum
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
    //console.log(airline, fn.toString().padStart(CODELEN, "0"))
    return airline + fn.toString().padStart(CODELEN, "0")
};