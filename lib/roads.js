const fs = require('fs')
const geojson = require('../lib/geojson-util')
const debug = require('../lib/debug')

var _roads

exports.init = function(config, dirbase = './') {
    _roads = config.roads

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

exports.randomHandler = function(services) {
    return geojson.randomElemFrom(Object.keys(services.handlers))
}

exports.randomParking = function(services, handler = false) {
    var ret
    if(handler) {
        const ramps = services.handlers[handler]
        ret  = []
        _roads.parkings.features.forEach(function(c, idx) {
            if(ramps.indexOf(c.properties.ramp) > -1)
                ret.push(c)
        })
    } else {
        ret = _roads.parkings.features
    }
    if(ret.length < 1) {
        debug.warning("no parking on handler '"+handler+"' found")
        ret = _roads.parkings.features
    }
    var p = geojson.randomElemFrom(ret)
    return p.properties.name
}
