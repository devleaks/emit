const fs = require('fs')
const debug = require('../lib/debug.js')

var _aircrafts

exports.init = function(aircrafts) {
    _aircrafts = aircrafts
    return _aircrafts
}

/*
 */
exports.randomAircraft = function(type = false) {
    var ret
    if(type) {
        ret  = []
        var t = Object.keys(_aircrafts)
        t.forEach(function(c, idx) {
            if(_aircrafts[c].type == type)
                ret.push(c)
        })
    } else {
        ret = Object.keys(_aircrafts)
    }
    if(ret.length < 1) {
        debug.warning("no aircraft of type '"+type+"' found")
        ret = Object.keys(_aircrafts)
    }
    return ret[Math.floor(Math.random() * ret.length)]
}

/*
 */
exports.find = function(name) {
    return _aircrafts[name]
}
