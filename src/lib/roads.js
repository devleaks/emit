import fs from "fs";
import moment from "moment";
import * as geojson from "./geojson-util.js";
import * as debug from "./debug.js";

let _roads
let _services

let _busy = []

export const init = function(config, dirbase = "./") {
    _roads = config.roads
    _services = config.services

    // load higways
    _roads["highways"] = {}
    for(let f in config.roads["highways-file"]) {
        let jsonfile = fs.readFileSync(dirbase + config.roads["highways-file"][f], "utf8")
        _roads.highways[f] = JSON.parse(jsonfile)
    }

    // load local roads
    let jsonfile = fs.readFileSync(dirbase + config.roads["localroads-file"], "utf8")
    _roads.localroads = JSON.parse(jsonfile)
    geojson.complexify(_roads.localroads)

    // load local roads
    jsonfile = fs.readFileSync(dirbase + config.roads["parking-file"], "utf8")
    _roads.parkings = JSON.parse(jsonfile)

    return _roads
};

export const randomHighway = function() {
    return geojson.randomElemFrom(Object.keys(_roads.highways))
};

export const randomHandler = function() {
    return geojson.randomElemFrom(Object.keys(_services.handlers))
};

export const randomParking = function(handler = false) {
    let avail = handler ? _roads.parkings.features.filter(p => _services["handlers"][handler].indexOf(p.properties.ramp) > -1 ) : _roads.parkings.features

    if(avail.length < 1) {
        debug.warning("no parking on handler '"+handler+"' found")
        avail = _roads.parkings.features
    }
    let p = geojson.randomElemFrom(avail)
    return p.properties.name
};

/*
 */
export const park = function(parkingName, datefrom, dateto) {
    if (parkingAvailable(parkingName, datefrom, dateto)) {
        _busy.push({
            parking: parkingName,
            datefrom: datefrom,
            dateto: dateto
        })
        return true
    }
    return false
};

/*
 */
export const parkingAvailable = function(parkingName, datefrom, dateto) {
    const thisParking = _busy.filter(p => p.parking == parkingName)
    let overlap = false
    thisParking.forEach(function(p, idx) { // should do a reduce... should returns as soon as overlaps
        debug.print("overlap", overlap, p.dateto, datefrom, ((p.datefrom <= dateto) && (p.dateto >= datefrom)))
        overlap = overlap || (
                        moment(p.datefrom, moment.ISO_8601).isBefore( moment(dateto, moment.ISO_8601) ) 
                        &&
                        moment(p.dateto, moment.ISO_8601).isAfter( moment(datefrom, moment.ISO_8601) ) 
                        )  // https://stackoverflow.com/questions/325933/determine-whether-two-date-ranges-overlap
    })
    return !overlap
};

/*
 */
export const purge = function(dateto) {
    _busy.forEach(function(p, idx) {
        if (p.dateto < dateto)
            delete _busy[idx]
    })
};

export const findParking = function(datefrom, dateto, handler = false) {
    let ret = false
    let avail = handler ? _roads.parkings.features.filter(p => _services["handlers"][handler].indexOf(p.properties.ramp) > -1 ) : _roads.parkings.features
    let free = avail.filter(f => parkingAvailable(f.properties.name, datefrom, dateto))
    let p = geojson.randomElemFrom(free) 
    return p.properties.name
};
