const fs = require('fs')
const debug = require('../lib/debug')
const geojson = require('../lib/geojson-util')

var _trucks

exports.init = function(config) {
    _trucks = config.trucks
    return _trucks
}

/*
 */
exports.randomTruckModel = function(type = false) {
    var ret = Object.keys(_trucks["truck-models"])
    if(ret.length < 1) {
        debug.warning("no aircraft of type '"+type+"' found")
        ret = Object.keys(_aircrafts)
    }
    return geojson.randomElemFrom(ret)
}

exports.findModel = function(model) {
  return _trucks["truck-models"][model]
}